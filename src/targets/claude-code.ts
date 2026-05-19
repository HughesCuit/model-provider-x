import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface ClaudeProxySettings {
  baseURL: string;
  authToken: string;
  enableModelDiscovery: boolean;
  defaultModel?: string;
}

export interface WriteClaudeCodeSettingsInput {
  targetPath?: string;
  proxy: ClaudeProxySettings;
}

export interface WriteClaudeCodeSettingsResult {
  targetPath: string;
  backupPath?: string;
}

type ClaudeSettings = Record<string, unknown> & {
  env?: Record<string, string>;
};

export function getDefaultClaudeSettingsPath(homeDir = homedir()): string {
  return join(homeDir, ".claude", "settings.json");
}

export function mergeClaudeCodeSettings(settings: ClaudeSettings, proxy: ClaudeProxySettings): ClaudeSettings {
  const env: Record<string, string> = {
    ...(isRecord(settings.env) ? stringifyRecord(settings.env) : {}),
    ANTHROPIC_BASE_URL: proxy.baseURL,
    ANTHROPIC_AUTH_TOKEN: proxy.authToken
  };

  if (proxy.enableModelDiscovery) {
    env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = "1";
  }

  if (proxy.defaultModel) {
    env.ANTHROPIC_MODEL = proxy.defaultModel;
  }

  return {
    ...settings,
    env
  };
}

export async function writeClaudeCodeSettings(
  input: WriteClaudeCodeSettingsInput
): Promise<WriteClaudeCodeSettingsResult> {
  const targetPath = input.targetPath ?? getDefaultClaudeSettingsPath();
  await mkdir(dirname(targetPath), { recursive: true });
  const exists = await fileExists(targetPath);
  const current = exists ? JSON.parse(await readFile(targetPath, "utf8")) : {};
  let backupPath: string | undefined;

  if (exists) {
    backupPath = `${targetPath}.${timestamp()}.bak`;
    await copyFile(targetPath, backupPath);
  }

  const next = mergeClaudeCodeSettings(current, input.proxy);
  await writeFile(targetPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { targetPath, backupPath };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function stringifyRecord(record: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, String(value)]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
