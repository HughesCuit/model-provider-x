import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { applyEdits, format, modify, parse, type ParseError } from "jsonc-parser";
import type { DiscoveredConfig, OpenCodeProviderConfig, WriteProviderInput, WriteProviderResult } from "../shared/types.js";

interface DiscoveryOptions {
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  providerId?: string;
}

export function getDefaultConfigPath(homeDir = homedir()): string {
  return join(homeDir, ".config", "opencode", "opencode.jsonc");
}

export async function discoverOpenCodeConfigs(options: DiscoveryOptions = {}): Promise<DiscoveredConfig[]> {
  const homeDir = options.homeDir ?? homedir();
  const env = options.env ?? process.env;
  const candidates = [
    { path: join(homeDir, ".config", "opencode", "opencode.jsonc"), label: "Global JSONC config" },
    { path: join(homeDir, ".config", "opencode", "opencode.json"), label: "Global JSON config" },
    { path: join(homeDir, ".opencode", "opencode.jsonc"), label: "Legacy JSONC config" },
    { path: join(homeDir, ".opencode", "opencode.json"), label: "Legacy JSON config" }
  ];

  if (env.OPENCODE_CONFIG) {
    candidates.push({ path: env.OPENCODE_CONFIG, label: "OPENCODE_CONFIG" });
  }

  if (env.OPENCODE_CONFIG_DIR) {
    candidates.push({ path: join(env.OPENCODE_CONFIG_DIR, "opencode.jsonc"), label: "OPENCODE_CONFIG_DIR JSONC" });
    candidates.push({ path: join(env.OPENCODE_CONFIG_DIR, "opencode.json"), label: "OPENCODE_CONFIG_DIR JSON" });
  }

  const seen = new Set<string>();
  const results: DiscoveredConfig[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.path)) {
      continue;
    }
    seen.add(candidate.path);

    const exists = await fileExists(candidate.path);
    if (!exists) {
      continue;
    }

    const writable = await isWritable(candidate.path);
    const hasProvider = options.providerId ? await configHasProvider(candidate.path, options.providerId) : false;
    results.push({ ...candidate, exists, writable, hasProvider });
  }

  return results;
}

export function mergeProviderIntoConfigText(text: string, providerId: string, provider: OpenCodeProviderConfig): string {
  let source = text.trim() ? text : "{}\n";
  const errors: ParseError[] = [];
  const parsed = parse(source, errors, { allowTrailingComma: true, disallowComments: false }) as { provider?: unknown } | undefined;

  if (errors.length > 0 || typeof parsed !== "object" || parsed === null) {
    throw new Error("Selected OpenCode config is not valid JSON/JSONC");
  }

  if (!isRecord(parsed.provider)) {
    source = applyEdits(source, modify(source, ["provider"], {}, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
  }

  const edited = applyEdits(
    source,
    modify(source, ["provider", providerId], provider, {
      formattingOptions: { insertSpaces: true, tabSize: 2 }
    })
  );

  return applyEdits(edited, format(edited, undefined, { insertSpaces: true, tabSize: 2 }));
}

export async function writeProviderToConfig(input: WriteProviderInput): Promise<WriteProviderResult> {
  await mkdir(dirname(input.targetPath), { recursive: true });
  const exists = await fileExists(input.targetPath);
  const current = exists ? await readFile(input.targetPath, "utf8") : "{}\n";
  let backupPath: string | undefined;

  if (exists) {
    backupPath = `${input.targetPath}.${timestamp()}.bak`;
    await copyFile(input.targetPath, backupPath);
  }

  const next = mergeProviderIntoConfigText(current, input.providerId, input.provider);
  await writeFile(input.targetPath, next, "utf8");
  return { targetPath: input.targetPath, backupPath };
}

async function configHasProvider(path: string, providerId: string): Promise<boolean> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = parse(text, undefined, { allowTrailingComma: true, disallowComments: false }) as {
      provider?: Record<string, unknown>;
    };
    return isRecord(parsed?.provider) && Object.prototype.hasOwnProperty.call(parsed.provider, providerId);
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

async function isWritable(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
