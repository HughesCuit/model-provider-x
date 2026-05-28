import type {
  OpenCodeConfigFragment,
  OpenCodeProviderConfig,
  OpenCodeApiType,
  ProviderConfigInput,
  ProviderValidationInput,
  ProviderValidationResult,
  ModelInfo,
  ModelModalities
} from "../shared/types.js";
import { lookupModelCapabilities, parseCapabilitiesFromApi, mergeModelCapabilities } from "./model-capabilities.js";

type FetchLike = (input: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status?: number;
  statusText?: string;
  json(): Promise<unknown>;
}>;

type CapabilityFetchLike = (input: string, init: RequestInit) => Promise<{
  ok: boolean;
  status?: number;
  statusText?: string;
  json?(): Promise<unknown>;
  text?(): Promise<string>;
}>;

export type ProviderApiKind = "openai-compatible" | "openai-responses" | "anthropic-messages";
export type TargetApiKind = "openai-compatible" | "openai-responses" | "anthropic-messages";

export interface ProviderCapabilities {
  baseURL: string;
  apis: ProviderApiKind[];
}

export function normalizeBaseUrl(baseURL: string): string {
  const normalized = baseURL.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("API base URL is required");
  }

  try {
    new URL(normalized);
  } catch {
    throw new Error("API base URL must be a valid URL");
  }

  return normalized;
}

export async function validateAndFetchModels(
  input: ProviderValidationInput,
  fetchImpl: FetchLike = globalThis.fetch as FetchLike
): Promise<ProviderValidationResult> {
  const baseURL = normalizeBaseUrl(input.baseURL);
  const apiKey = input.apiKey?.trim() ?? "";
  const headers: Record<string, string> = {};

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetchImpl(`${baseURL}/models`, { headers });
  if (!response.ok) {
    throw new Error(`Provider returned ${response.status ?? "an error"} ${response.statusText ?? ""}`.trim());
  }

  const body = await response.json();
  if (!isModelListResponse(body)) {
    throw new Error("Expected /models to return an object with a data array");
  }

  const compatibleModels = body.data.filter(isOpenCodeCompatibleModel);
  const models = [
    ...new Set(
      compatibleModels
        .map((model) => model.id.trim())
        .filter(Boolean)
    )
  ];
  if (models.length === 0) {
    throw new Error("Provider returned no OpenCode-compatible model ids");
  }

  const modelDetails: ModelInfo[] = models.map((modelId) => {
    const rawModel = compatibleModels.find((m) => m.id.trim() === modelId);
    const apiCapabilities = rawModel ? parseCapabilitiesFromApi(rawModel as { modalities?: unknown; capabilities?: unknown }) : undefined;
    const mergedCapabilities = mergeModelCapabilities(modelId, apiCapabilities);
    return {
      id: modelId,
      modalities: mergedCapabilities
    };
  });

  return { baseURL, models, modelDetails };
}

export async function detectProviderCapabilities(
  input: ProviderValidationInput,
  fetchImpl: CapabilityFetchLike = globalThis.fetch as CapabilityFetchLike
): Promise<ProviderCapabilities> {
  const baseURL = normalizeBaseUrl(input.baseURL);
  const apiKey = input.apiKey?.trim() ?? "";
  const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const apis = new Set<ProviderApiKind>();

  const models = await probe(`${baseURL}/models`, { method: "GET", headers }, fetchImpl);
  if (models.reachable) {
    apis.add("openai-compatible");
  }

  const responses = await probe(
    `${baseURL}/responses`,
    { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}" },
    fetchImpl
  );
  if (responses.reachable) {
    apis.add("openai-responses");
  }

  const messages = await probe(
    `${baseURL}/messages`,
    { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}" },
    fetchImpl
  );
  if (messages.reachable && (await isAnthropicMessagesProbe(messages.response))) {
    apis.add("anthropic-messages");
  }

  return { baseURL, apis: [...apis] };
}

export function targetRequiredApi(target: "opencode" | "codex" | "claude-code"): TargetApiKind {
  if (target === "codex") {
    return "openai-responses";
  }
  if (target === "claude-code") {
    return "anthropic-messages";
  }
  return "openai-compatible";
}

export function recommendProxyMode(capabilities: ProviderCapabilities, target: "opencode" | "codex" | "claude-code"): boolean {
  return !capabilities.apis.includes(targetRequiredApi(target));
}

export function buildProviderConfig(input: ProviderConfigInput): OpenCodeConfigFragment {
  const baseURL = normalizeBaseUrl(input.baseURL);
  const apiKey = input.apiKey?.trim();
  const opencodeApiType = input.opencodeApiType ?? "chat";
  const provider: OpenCodeProviderConfig = {
    npm: npmPackageForOpenCodeApiType(opencodeApiType),
    name: input.providerName.trim(),
    options: {
      baseURL
    },
    models: Object.fromEntries(
      input.models.map((model) => {
        const modelInfo = input.modelDetails?.find((m) => m.id === model);
        return [model, buildModelConfig(model, modelInfo)];
      })
    )
  };

  if (opencodeApiType !== "messages") {
    provider.options.setCacheKey = true;
  }

  if (apiKey) {
    provider.options.apiKey = apiKey;
  }

  return {
    $schema: "https://opencode.ai/config.json",
    provider: {
      [input.providerId.trim()]: provider
    }
  };
}

function buildModelConfig(modelId: string, modelInfo?: ModelInfo): import("../shared/types.js").OpenCodeModelConfig {
  const config: import("../shared/types.js").OpenCodeModelConfig = { name: modelId };
  if (modelInfo?.modalities) {
    config.modalities = modelInfo.modalities;
  }
  return config;
}

export function npmPackageForOpenCodeApiType(apiType: OpenCodeApiType): OpenCodeProviderConfig["npm"] {
  if (apiType === "responses") {
    return "@ai-sdk/openai";
  }
  if (apiType === "messages") {
    return "@ai-sdk/anthropic";
  }
  return "@ai-sdk/openai-compatible";
}

function isModelListResponse(body: unknown): body is { data: Array<{ id: string; type?: unknown; modalities?: unknown; capabilities?: unknown }> } {
  return (
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { data?: unknown }).data) &&
    (body as { data: unknown[] }).data.every(
      (model) => typeof model === "object" && model !== null && typeof (model as { id?: unknown }).id === "string"
    )
  );
}

function isOpenCodeCompatibleModel(model: { type?: unknown }): boolean {
  if (typeof model.type !== "string") {
    return true;
  }

  return ["llm", "chat", "completion", "text-generation"].includes(model.type.trim().toLowerCase());
}

async function probe(
  input: string,
  init: RequestInit,
  fetchImpl: CapabilityFetchLike
): Promise<{ reachable: boolean; response?: Awaited<ReturnType<CapabilityFetchLike>> }> {
  try {
    const response = await fetchImpl(input, init);
    return {
      reachable: response.ok || response.status === 400 || response.status === 401 || response.status === 422,
      response
    };
  } catch {
    return { reachable: false };
  }
}

async function isAnthropicMessagesProbe(response: Awaited<ReturnType<CapabilityFetchLike>> | undefined): Promise<boolean> {
  if (!response) {
    return false;
  }

  const status = response.status ?? (response.ok ? 200 : undefined);
  if (status === 404 || status === undefined) {
    return false;
  }

  if (!response.json) {
    return !response.ok && (status === 400 || status === 401 || status === 422);
  }

  try {
    const body = await response.json();
    if (isAnthropicMessageResponse(body) || isAnthropicErrorResponse(body)) {
      return true;
    }
    return !response.ok && (status === 400 || status === 401 || status === 422);
  } catch {
    return !response.ok && (status === 400 || status === 401 || status === 422);
  }
}

function isAnthropicMessageResponse(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { type?: unknown }).type === "message" &&
    typeof (body as { role?: unknown }).role === "string" &&
    Array.isArray((body as { content?: unknown }).content)
  );
}

function isAnthropicErrorResponse(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { type?: unknown }).type === "error" &&
    typeof (body as { error?: unknown }).error === "object" &&
    (body as { error?: unknown }).error !== null
  );
}
