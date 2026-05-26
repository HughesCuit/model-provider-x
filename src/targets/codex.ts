import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CodexProxyProvider {
  providerId: string;
  providerName: string;
  baseURL: string;
  authCommand: string;
  authArgs: string[];
  model: string;
}

export interface WriteCodexConfigInput extends CodexProxyProvider {
  targetPath?: string;
}

export interface WriteCodexConfigResult {
  targetPath: string;
  backupPath?: string;
}

export function getDefaultCodexConfigPath(homeDir = homedir()): string {
  return join(homeDir, ".codex", "config.toml");
}

export function mergeCodexConfig(text: string, provider: CodexProxyProvider): string {
  let next = text.trimEnd();
  next = upsertTopLevelString(next, "model", provider.model);
  next = upsertTopLevelString(next, "model_provider", provider.providerId);
  next = removeTable(next, `model_providers.${quoteTomlKey(provider.providerId)}`);

  const providerBlock = [
    `[model_providers.${quoteTomlKey(provider.providerId)}]`,
    `name = ${quoteTomlString(provider.providerName)}`,
    `base_url = ${quoteTomlString(provider.baseURL)}`,
    'wire_api = "responses"',
    "",
    `[model_providers.${quoteTomlKey(provider.providerId)}.auth]`,
    `command = ${quoteTomlString(provider.authCommand)}`,
    `args = [${provider.authArgs.map(quoteTomlString).join(", ")}]`,
    "refresh_interval_ms = 0"
  ].join("\n");

  return `${next.trimEnd()}\n\n${providerBlock}\n`;
}

export async function writeCodexConfig(input: WriteCodexConfigInput): Promise<WriteCodexConfigResult> {
  const targetPath = input.targetPath ?? getDefaultCodexConfigPath();
  await mkdir(dirname(targetPath), { recursive: true });
  const exists = await fileExists(targetPath);
  const current = exists ? await readFile(targetPath, "utf8") : "";
  let backupPath: string | undefined;

  if (exists) {
    backupPath = `${targetPath}.${timestamp()}.bak`;
    await copyFile(targetPath, backupPath);
  }

  await writeFile(targetPath, mergeCodexConfig(current, input), "utf8");
  return { targetPath, backupPath };
}

function upsertTopLevelString(text: string, key: string, value: string): string {
  const line = `${key} = ${quoteTomlString(value)}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*=.*$`, "m");
  if (pattern.test(text)) {
    return text.replace(pattern, line);
  }

  return text ? `${line}\n${text}` : line;
}

function removeTable(text: string, tableName: string): string {
  const lines = text.split(/\r?\n/);
  const header = `[${tableName}]`;
  const kept: string[] = [];
  let removing = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      removing = trimmed === header || trimmed.startsWith(`[${tableName}.`);
      if (removing) {
        continue;
      }
    }

    if (!removing) {
      kept.push(line);
    }
  }

  return kept.join("\n").trimEnd();
}

function quoteTomlKey(value: string): string {
  return quoteTomlString(value);
}

function quoteTomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
