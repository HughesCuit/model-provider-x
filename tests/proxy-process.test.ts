import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { getDefaultProxyStatePath, readProxyStatus, startProxyProcess, stopProxyProcess } from "../src/core/proxy-process";
import type { ToolConfig } from "../src/shared/types";

const tempDirs: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "model-provider-x-proxy-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function toolConfig(): ToolConfig {
  return {
    profiles: {
      local: {
        id: "local",
        name: "Local",
        baseURL: "http://localhost:1234/v1",
        models: ["qwen"]
      }
    },
    proxy: { host: "127.0.0.1", port: 4141, authToken: "mpx-token" }
  };
}

describe("proxy process lifecycle", () => {
  it("uses ~/.config/model-provider-x/proxy.json as the default state path", async () => {
    const home = await tempDir();

    expect(getDefaultProxyStatePath(home)).toBe(join(home, ".config", "model-provider-x", "proxy.json"));
  });

  it("starts a detached proxy process and writes state", async () => {
    const dir = await tempDir();
    const statePath = join(dir, "proxy.json");

    const state = await startProxyProcess({
      profileId: "local",
      config: toolConfig(),
      statePath,
      entrypoint: "-e",
      nodePath: process.execPath
    });

    expect(state).toMatchObject({
      profileId: "local",
      baseURL: "http://127.0.0.1:4141",
      authToken: "mpx-token"
    });
    expect(await readFile(statePath, "utf8")).toContain('"profileId": "local"');
    await stopProxyProcess(statePath);
  });

  it("reports missing state as stopped", async () => {
    const dir = await tempDir();

    await expect(readProxyStatus(join(dir, "missing.json"))).resolves.toEqual({ running: false });
  });
});
