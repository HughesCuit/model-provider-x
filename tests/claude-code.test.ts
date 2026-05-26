import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  getDefaultClaudeSettingsPath,
  mergeClaudeCodeSettings,
  normalizeClaudeCodeBaseURL,
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

  it("normalizes Anthropic base URLs because Claude Code appends /v1/messages", () => {
    expect(normalizeClaudeCodeBaseURL("http://localhost:1234/v1")).toBe("http://localhost:1234");
    expect(normalizeClaudeCodeBaseURL("http://127.0.0.1:4141")).toBe("http://127.0.0.1:4141");
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
      ANTHROPIC_API_KEY: "mpx-token",
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
      ANTHROPIC_MODEL: "qwen",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "qwen",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "qwen",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "qwen",
      CLAUDE_CODE_SUBAGENT_MODEL: "qwen"
    });
    expect(merged.model).toBe("qwen");
    expect(merged.availableModels).toEqual(["qwen"]);
    expect(merged.modelOverrides).toMatchObject({
      "claude-sonnet-4-5": "qwen",
      "claude-3-5-haiku-20241022": "qwen"
    });
    expect(merged.env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
    expect(JSON.stringify(merged)).not.toContain("sk-upstream");
  });

  it("writes Claude Code base URL without a trailing /v1", () => {
    const merged = mergeClaudeCodeSettings(
      {},
      {
        baseURL: "http://localhost:1234/v1",
        authToken: "123",
        enableModelDiscovery: false
      }
    );

    expect(merged.env).toMatchObject({
      ANTHROPIC_BASE_URL: "http://localhost:1234",
      ANTHROPIC_API_KEY: "123"
    });
  });

  it("removes stale Anthropic auth token env to avoid Claude Code auth conflicts", () => {
    const merged = mergeClaudeCodeSettings(
      {
        env: { ANTHROPIC_AUTH_TOKEN: "old-token", ANTHROPIC_API_KEY: "old-key" }
      },
      {
        baseURL: "http://127.0.0.1:4141",
        authToken: "mpx-token",
        enableModelDiscovery: true
      }
    );

    expect(merged.env).toMatchObject({ ANTHROPIC_API_KEY: "mpx-token" });
    expect(merged.env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
  });

  it("preserves existing model settings and adds selected provider models", () => {
    const merged = mergeClaudeCodeSettings(
      {
        availableModels: ["old-model"],
        modelOverrides: { "custom-claude-alias": "old-model" }
      },
      {
        baseURL: "http://127.0.0.1:4141",
        authToken: "mpx-token",
        enableModelDiscovery: true,
        defaultModel: "qwen",
        models: ["qwen", "gemma"]
      }
    );

    expect(merged.availableModels).toEqual(["old-model", "qwen", "gemma"]);
    expect(merged.modelOverrides).toMatchObject({
      "custom-claude-alias": "old-model",
      "claude-sonnet-4-5": "qwen"
    });
  });

  it("maps Claude Opus, Sonnet, Haiku, and subagent roles independently", () => {
    const merged = mergeClaudeCodeSettings(
      {},
      {
        baseURL: "http://127.0.0.1:4141",
        authToken: "mpx-token",
        enableModelDiscovery: true,
        defaultModel: "sonnet-local",
        models: ["opus-local", "sonnet-local", "haiku-local"],
        modelMapping: {
          opus: "opus-local",
          sonnet: "sonnet-local",
          haiku: "haiku-local",
          subagent: "haiku-local"
        }
      }
    );

    expect(merged.env).toMatchObject({
      ANTHROPIC_MODEL: "sonnet-local",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "opus-local",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "sonnet-local",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "haiku-local",
      CLAUDE_CODE_SUBAGENT_MODEL: "haiku-local"
    });
    expect(merged.modelOverrides).toMatchObject({
      "claude-opus-4-5": "opus-local",
      "claude-sonnet-4-5": "sonnet-local",
      "claude-3-5-haiku-20241022": "haiku-local"
    });
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
