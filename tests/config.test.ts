import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverOpenCodeConfigs,
  getDefaultConfigPath,
  mergeProviderIntoConfigText,
  writeProviderToConfig
} from "../src/core/config";
import { buildProviderConfig } from "../src/core/provider";

const tempDirs: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "opencode-configurator-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("config utilities", () => {
  it("discovers standard, legacy, OPENCODE_CONFIG, and OPENCODE_CONFIG_DIR configs", async () => {
    const home = await tempDir();
    const explicit = join(home, "explicit.jsonc");
    const customDir = join(home, "custom");

    await mkdir(join(home, ".config", "opencode"), { recursive: true });
    await mkdir(join(home, ".opencode"), { recursive: true });
    await mkdir(customDir, { recursive: true });
    await writeFile(join(home, ".config", "opencode", "opencode.jsonc"), "{}", "utf8");
    await writeFile(join(home, ".opencode", "opencode.json"), "{}", "utf8");
    await writeFile(explicit, "{}", "utf8");
    await writeFile(join(customDir, "opencode.jsonc"), "{}", "utf8");

    const configs = await discoverOpenCodeConfigs({
      homeDir: home,
      env: { OPENCODE_CONFIG: explicit, OPENCODE_CONFIG_DIR: customDir }
    });

    expect(configs.map((config) => config.path)).toEqual([
      join(home, ".config", "opencode", "opencode.jsonc"),
      join(home, ".opencode", "opencode.json"),
      explicit,
      join(customDir, "opencode.jsonc")
    ]);
  });

  it("returns standard jsonc path as the default creation target", async () => {
    const home = await tempDir();
    expect(getDefaultConfigPath(home)).toBe(join(home, ".config", "opencode", "opencode.jsonc"));
  });

  it("merges provider into jsonc while preserving unrelated settings", () => {
    const provider = buildProviderConfig({
      providerId: "unsloth",
      providerName: "Unsloth Local",
      baseURL: "http://localhost:8888/v1",
      models: ["qwen"]
    }).provider.unsloth;

    const merged = mergeProviderIntoConfigText(
      '{\n  // keep me\n  "$schema": "https://opencode.ai/config.json",\n  "model": "anthropic/claude-sonnet-4-5"\n}\n',
      "unsloth",
      provider
    );

    expect(merged).toContain("// keep me");
    expect(merged).toContain('"model": "anthropic/claude-sonnet-4-5"');
    expect(merged).toContain('"unsloth"');
    expect(merged).toContain('"@ai-sdk/openai-compatible"');
  });

  it("writes a backup before replacing config contents", async () => {
    const dir = await tempDir();
    const target = join(dir, "opencode.jsonc");
    await writeFile(target, '{\n  "provider": {}\n}\n', "utf8");

    const provider = buildProviderConfig({
      providerId: "unsloth",
      providerName: "Unsloth Local",
      baseURL: "http://localhost:8888/v1",
      models: ["qwen"]
    }).provider.unsloth;

    const result = await writeProviderToConfig({ targetPath: target, providerId: "unsloth", provider });
    const written = await readFile(target, "utf8");
    const backupPath = result.backupPath;
    expect(backupPath).toBeDefined();
    if (!backupPath) {
      throw new Error("Expected backupPath to be defined");
    }
    const backup = await readFile(backupPath, "utf8");

    expect(written).toContain('"unsloth"');
    expect(backup).toBe('{\n  "provider": {}\n}\n');
  });
});
