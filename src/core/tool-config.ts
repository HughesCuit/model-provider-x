import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { parse } from "jsonc-parser";
import type { ProviderProfile, ToolConfig } from "../shared/types.js";

export function getDefaultToolConfigPath(homeDir = homedir()): string {
  return join(homeDir, ".config", "model-provider-x", "config.jsonc");
}

export async function readToolConfig(path = getDefaultToolConfigPath()): Promise<ToolConfig> {
  if (!(await fileExists(path))) {
    return createDefaultToolConfig();
  }

  const text = await readFile(path, "utf8");
  const parsed = parse(text, undefined, { allowTrailingComma: true, disallowComments: false }) as Partial<ToolConfig>;
  return normalizeToolConfig(parsed);
}

export async function writeToolConfig(path: string, config: ToolConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalizeToolConfig(config), null, 2)}\n`, "utf8");
}

export async function upsertProviderProfile(
  path: string,
  profile: ProviderProfile,
  proxy?: Partial<ToolConfig["proxy"]>
): Promise<ToolConfig> {
  const current = await readToolConfig(path);
  const next = normalizeToolConfig({
    ...current,
    profiles: {
      ...current.profiles,
      [profile.id]: profile
    },
    proxy: {
      ...current.proxy,
      ...proxy
    }
  });

  await writeToolConfig(path, next);
  return next;
}

function createDefaultToolConfig(): ToolConfig {
  return {
    profiles: {},
    proxy: {
      host: "127.0.0.1",
      port: 4141,
      authToken: createProxyAuthToken()
    }
  };
}

export function createProxyAuthToken(): string {
  return `mpx-${randomBytes(18).toString("base64url")}`;
}

function normalizeToolConfig(config: Partial<ToolConfig>): ToolConfig {
  const fallback = createDefaultToolConfig();
  const profiles = isRecord(config.profiles) ? config.profiles : {};
  const proxy: Record<string, unknown> = isRecord(config.proxy) ? config.proxy : {};

  return {
    profiles: Object.fromEntries(
      Object.entries(profiles).map(([id, profile]) => {
        const value = profile as Partial<ProviderProfile>;
        return [
          id,
          {
            id: String(value.id ?? id),
            name: String(value.name ?? id),
            baseURL: String(value.baseURL ?? ""),
            apiKey: value.apiKey ? String(value.apiKey) : undefined,
            models: Array.isArray(value.models) ? value.models.map(String) : [],
            target: isValidTarget(value.target) ? value.target : undefined,
            opencodeApiType: isValidOpencodeApiType(value.opencodeApiType) ? value.opencodeApiType : undefined,
            proxy: typeof value.proxy === "boolean" ? value.proxy : undefined
          }
        ];
      })
    ),
    proxy: {
      host: typeof proxy.host === "string" ? proxy.host : fallback.proxy.host,
      port: typeof proxy.port === "number" ? proxy.port : fallback.proxy.port,
      authToken: typeof proxy.authToken === "string" ? proxy.authToken : fallback.proxy.authToken
    }
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidTarget(value: unknown): value is "opencode" | "codex" | "claude-code" {
  return typeof value === "string" && ["opencode", "codex", "claude-code"].includes(value);
}

function isValidOpencodeApiType(value: unknown): value is "chat" | "responses" | "messages" {
  return typeof value === "string" && ["chat", "responses", "messages"].includes(value);
}
