import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  getDefaultClaudeSettingsPath,
  mergeClaudeCodeSettings,
  writeClaudeCodeSettings
} from "../src/targets/claude-code";

const tempDirs: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "claude-code-settings-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Claude Code target", () => {
  it("uses ~/.claude/settings.json as the default user settings path", async () => {
    const home = await tempDir();

    expect(getDefaultClaudeSettingsPath(home)).toBe(join(home, ".claude", "settings.json"));
  });

  it("merges proxy env into settings while preserving unrelated settings", () => {
    const merged = mergeClaudeCodeSettings(
      {
        permissions: { allow: ["Bash(npm test)"] },
        env: { EXISTING: "1", ANTHROPIC_BASE_URL: "https://old.example.com" }
      },
      {
        baseURL: "http://127.0.0.1:4141",
        authToken: "mpx-token",
        enableModelDiscovery: true,
        defaultModel: "qwen"
      }
    );

    expect(merged.permissions).toEqual({ allow: ["Bash(npm test)"] });
    expect(merged.env).toMatchObject({
      EXISTING: "1",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:4141",
      ANTHROPIC_AUTH_TOKEN: "mpx-token",
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
      ANTHROPIC_MODEL: "qwen"
    });
    expect(JSON.stringify(merged)).not.toContain("sk-upstream");
  });

  it("writes a backup before updating an existing settings file", async () => {
    const dir = await tempDir();
    const target = join(dir, ".claude", "settings.json");
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(target, '{\n  "env": { "EXISTING": "1" }\n}\n', "utf8");

    const result = await writeClaudeCodeSettings({
      targetPath: target,
      proxy: { baseURL: "http://127.0.0.1:4141", authToken: "mpx-token", enableModelDiscovery: true }
    });

    const written = await readFile(target, "utf8");
    expect(result.backupPath).toBeDefined();
    expect(written).toContain('"ANTHROPIC_BASE_URL": "http://127.0.0.1:4141"');
    expect(written).toContain('"EXISTING": "1"');
  });
});
