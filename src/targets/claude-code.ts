import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface ClaudeProxySettings {
  baseURL: string;
  authToken: string;
  enableModelDiscovery: boolean;
  defaultModel?: string;
  models?: string[];
  modelMapping?: ClaudeModelMapping;
}

export interface ClaudeModelMapping {
  opus: string;
  sonnet: string;
  haiku: string;
  subagent: string;
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
  availableModels?: string[];
  modelOverrides?: Record<string, string>;
};

const OPUS_MODEL_OVERRIDE_KEYS = [
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-opus-4-1",
  "claude-opus-4-0",
  "claude-3-opus-latest",
  "claude-3-opus-20240229"
];

const SONNET_MODEL_OVERRIDE_KEYS = [
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-sonnet-4-0",
  "claude-3-7-sonnet-latest",
  "claude-3-7-sonnet-20250219",
  "claude-3-5-sonnet-latest",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet-20240620"
];

const HAIKU_MODEL_OVERRIDE_KEYS = [
  "claude-haiku-4-5",
  "claude-3-5-haiku-latest",
  "claude-3-5-haiku-20241022",
  "claude-3-haiku-20240307"
];

export function getDefaultClaudeSettingsPath(homeDir = homedir()): string {
  return join(homeDir, ".claude", "settings.json");
}

export function mergeClaudeCodeSettings(settings: ClaudeSettings, proxy: ClaudeProxySettings): ClaudeSettings {
  const env: Record<string, string> = {
    ...(isRecord(settings.env) ? stringifyRecord(settings.env) : {}),
    ANTHROPIC_BASE_URL: normalizeClaudeCodeBaseURL(proxy.baseURL),
    ANTHROPIC_API_KEY: proxy.authToken
  };
  delete env.ANTHROPIC_AUTH_TOKEN;

  if (proxy.enableModelDiscovery) {
    env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = "1";
  }

  if (proxy.defaultModel) {
    const mapping = proxy.modelMapping ?? defaultClaudeModelMapping(proxy.defaultModel);
    env.ANTHROPIC_MODEL = proxy.defaultModel;
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = mapping.opus;
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = mapping.sonnet;
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = mapping.haiku;
    env.CLAUDE_CODE_SUBAGENT_MODEL = mapping.subagent;
  }

  const next: ClaudeSettings = {
    ...settings,
    env
  };

  if (proxy.defaultModel) {
    const defaultModel = proxy.defaultModel;
    const mapping = proxy.modelMapping ?? defaultClaudeModelMapping(defaultModel);
    next.model = defaultModel;
    next.modelOverrides = {
      ...(isRecord(settings.modelOverrides) ? stringifyRecord(settings.modelOverrides) : {}),
      ...modelOverridesForMapping(mapping)
    };
  }

  const availableModels = uniqueStrings([
    ...(Array.isArray(settings.availableModels) ? settings.availableModels.map(String) : []),
    ...(proxy.models ?? []),
    ...(proxy.defaultModel ? [proxy.defaultModel] : [])
  ]);
  if (availableModels.length > 0) {
    next.availableModels = availableModels;
  }

  return next;
}

export function defaultClaudeModelMapping(defaultModel: string): ClaudeModelMapping {
  return {
    opus: defaultModel,
    sonnet: defaultModel,
    haiku: defaultModel,
    subagent: defaultModel
  };
}

export function normalizeClaudeCodeBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function modelOverridesForMapping(mapping: ClaudeModelMapping): Record<string, string> {
  return {
    ...Object.fromEntries(OPUS_MODEL_OVERRIDE_KEYS.map((model) => [model, mapping.opus])),
    ...Object.fromEntries(SONNET_MODEL_OVERRIDE_KEYS.map((model) => [model, mapping.sonnet])),
    ...Object.fromEntries(HAIKU_MODEL_OVERRIDE_KEYS.map((model) => [model, mapping.haiku]))
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
