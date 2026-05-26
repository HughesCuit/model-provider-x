import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ToolConfig } from "../shared/types.js";

export interface ProxyState {
  pid: number;
  profileId: string;
  baseURL: string;
  authToken: string;
  startedAt: string;
}

export interface StartProxyProcessInput {
  profileId: string;
  config: ToolConfig;
  host?: string;
  port?: number;
  statePath?: string;
  entrypoint?: string;
  nodePath?: string;
  replace?: boolean;
}

export interface ProxyStatus {
  running: boolean;
  state?: ProxyState;
}

export function getDefaultProxyStatePath(homeDir = homedir()): string {
  return join(homeDir, ".config", "model-provider-x", "proxy.json");
}

export async function readProxyStatus(path = getDefaultProxyStatePath()): Promise<ProxyStatus> {
  const state = await readProxyState(path);
  if (!state) {
    return { running: false };
  }

  return { running: isProcessRunning(state.pid), state };
}

export async function startProxyProcess(input: StartProxyProcessInput): Promise<ProxyState> {
  const profile = input.config.profiles[input.profileId];
  if (!profile) {
    throw new Error(`Unknown provider profile: ${input.profileId}`);
  }

  const statePath = input.statePath ?? getDefaultProxyStatePath();
  const current = await readProxyStatus(statePath);
  if (current.running && current.state?.profileId === input.profileId) {
    return current.state;
  }
  if (current.running && current.state) {
    if (input.replace) {
      await stopProxyProcess(statePath);
    } else {
      throw new Error(`Proxy is already running for profile ${current.state.profileId}`);
    }
  }

  const host = input.host ?? input.config.proxy.host;
  const port = input.port ?? input.config.proxy.port;
  const entrypoint = input.entrypoint ?? process.argv[1];
  const child = spawn(input.nodePath ?? process.execPath, [entrypoint, "proxy", "--profile", input.profileId, "--host", host, "--port", String(port)], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, MODEL_PROVIDER_X_API_KEY: input.config.proxy.authToken }
  });
  child.unref();

  const state: ProxyState = {
    pid: child.pid ?? 0,
    profileId: input.profileId,
    baseURL: `http://${host}:${port}`,
    authToken: input.config.proxy.authToken,
    startedAt: new Date().toISOString()
  };

  await writeProxyState(statePath, state);
  return state;
}

export async function stopProxyProcess(path = getDefaultProxyStatePath()): Promise<ProxyStatus> {
  const state = await readProxyState(path);
  if (!state) {
    return { running: false };
  }

  if (isProcessRunning(state.pid)) {
    process.kill(state.pid, "SIGTERM");
  }

  await rm(path, { force: true });
  return { running: false, state };
}

async function readProxyState(path: string): Promise<ProxyState | undefined> {
  if (!(await fileExists(path))) {
    return undefined;
  }

  const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<ProxyState>;
  if (typeof parsed.pid !== "number" || typeof parsed.profileId !== "string") {
    return undefined;
  }

  return {
    pid: parsed.pid,
    profileId: parsed.profileId,
    baseURL: String(parsed.baseURL ?? ""),
    authToken: String(parsed.authToken ?? ""),
    startedAt: String(parsed.startedAt ?? "")
  };
}

async function writeProxyState(path: string, state: ProxyState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function isProcessRunning(pid: number): boolean {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
