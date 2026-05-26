import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { getDefaultCodexConfigPath, mergeCodexConfig, writeCodexConfig } from "../src/targets/codex";

const tempDirs: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "model-provider-x-codex-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Codex config", () => {
  it("uses ~/.codex/config.toml as the default path", async () => {
    const home = await tempDir();

    expect(getDefaultCodexConfigPath(home)).toBe(join(home, ".codex", "config.toml"));
  });

  it("merges a Responses proxy provider without removing unrelated settings", () => {
    const next = mergeCodexConfig(
      'model = "gpt-5.5"\nmodel_reasoning_effort = "medium"\n\n[desktop]\nappearanceTheme = "dark"\n',
      {
        providerId: "local",
        providerName: "Local",
        baseURL: "http://127.0.0.1:4141/v1",
        authCommand: "model-provider-x",
        authArgs: ["proxy", "token"],
        model: "qwen"
      }
    );

    expect(next).toContain('model = "qwen"');
    expect(next).toContain('model_provider = "local"');
    expect(next).toContain('model_reasoning_effort = "medium"');
    expect(next).toContain('[desktop]');
    expect(next).toContain('[model_providers."local"]');
    expect(next).toContain('wire_api = "responses"');
    expect(next).toContain('base_url = "http://127.0.0.1:4141/v1"');
    expect(next).toContain('[model_providers."local".auth]');
    expect(next).toContain('command = "model-provider-x"');
    expect(next).toContain('args = ["proxy", "token"]');
  });

  it("writes config with a backup when an existing file is updated", async () => {
    const dir = await tempDir();
    const path = join(dir, "config.toml");
    await writeFile(path, 'model = "old"\n', "utf8");

    const result = await writeCodexConfig({
      targetPath: path,
      providerId: "local",
      providerName: "Local",
      baseURL: "http://127.0.0.1:4141/v1",
      authCommand: "model-provider-x",
      authArgs: ["proxy", "token"],
      model: "qwen"
    });

    expect(result.backupPath).toBeDefined();
    expect(await readFile(path, "utf8")).toContain('model = "qwen"');
    expect(await readFile(result.backupPath!, "utf8")).toBe('model = "old"\n');
  });
});
