import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProxyAuthToken,
  getDefaultToolConfigPath,
  readToolConfig,
  upsertProviderProfile,
  writeToolConfig
} from "../src/core/tool-config";

const tempDirs: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "model-provider-x-config-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("tool config", () => {
  it("uses ~/.config/model-provider-x/config.jsonc as the default path", async () => {
    const home = await tempDir();

    expect(getDefaultToolConfigPath(home)).toBe(join(home, ".config", "model-provider-x", "config.jsonc"));
  });

  it("generates proxy auth tokens with the expected prefix", () => {
    expect(createProxyAuthToken()).toMatch(/^mpx-[A-Za-z0-9_-]+$/);
    expect(createProxyAuthToken()).not.toBe(createProxyAuthToken());
  });

  it("writes and reads provider profiles", async () => {
    const dir = await tempDir();
    const path = join(dir, "config.jsonc");

    await writeToolConfig(path, {
      profiles: {
        local: {
          id: "local",
          name: "Local Gateway",
          baseURL: "http://localhost:8888/v1",
          apiKey: "sk-local",
          models: ["qwen"]
        }
      },
      proxy: {
        host: "127.0.0.1",
        port: 4141,
        authToken: "mpx-token"
      }
    });

    const config = await readToolConfig(path);
    const text = await readFile(path, "utf8");

    expect(config.profiles.local.apiKey).toBe("sk-local");
    expect(config.proxy.port).toBe(4141);
    expect(text).toContain('"profiles"');
  });

  it("upserts profiles without removing existing proxy settings", async () => {
    const dir = await tempDir();
    const path = join(dir, "config.jsonc");

    await writeToolConfig(path, {
      profiles: {},
      proxy: { host: "127.0.0.1", port: 4141, authToken: "keep-me" }
    });

    const next = await upsertProviderProfile(path, {
      id: "cloud",
      name: "Cloud Gateway",
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-cloud",
      models: ["model-a", "model-b"]
    });

    expect(next.proxy.authToken).toBe("keep-me");
    expect(next.profiles.cloud.models).toEqual(["model-a", "model-b"]);
  });
});
