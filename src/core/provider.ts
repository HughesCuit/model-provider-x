import type {
  OpenCodeConfigFragment,
  OpenCodeProviderConfig,
  OpenCodeApiType,
  ProviderConfigInput,
  ProviderValidationInput,
  ProviderValidationResult,
  ModelInfo,
  ModelRegistry
} from "../shared/types.js";
import { parseCapabilitiesFromApi, mergeModelCapabilities } from "./model-capabilities.js";
import { loadModelRegistryFile, resolveModelRegistryMetadata } from "./model-registry.js";

type FetchLike = (input: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status?: number;
  statusText?: string;
  json(): Promise<unknown>;
}>;

type LmStudioSdkLoader = (baseURL: string) => Promise<ModelInfo[]>;

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
  fetchImpl: FetchLike = globalThis.fetch as FetchLike,
  lmStudioSdkLoader: LmStudioSdkLoader = loadLmStudioSdkModels
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

  const sourceModels = body.data.map((model) => normalizeModelInfo(model, "openai-models"));
  const nativeModels = await fetchNativeRestModelDetails(baseURL, headers, fetchImpl);
  const sdkModels =
    nativeModels.length > 0 && (lmStudioSdkLoader !== loadLmStudioSdkModels || fetchImpl === (globalThis.fetch as FetchLike))
      ? await safeLoadLmStudioSdkModels(lmStudioSdkLoader, baseURL)
      : [];
  const registries = await loadRegistries(input);
  const registryModels = await Promise.all(
    sourceModels.map((model) =>
      resolveModelRegistryMetadata({
        providerId: input.providerId,
        modelId: model.id,
        registries
      })
    )
  );
  const modelDetailsById = mergeModelDetails([...sourceModels, ...registryModels.filter(isModelInfo), ...nativeModels, ...sdkModels]);
  const compatibleModels = sourceModels
    .map((model) => mergeModelInfo(model, modelDetailsForId(model.id, modelDetailsById)))
    .filter(isOpenCodeCompatibleModel);
  const models = [...new Set(compatibleModels.map((model) => model.id.trim()).filter(Boolean))];
  if (models.length === 0) {
    throw new Error("Provider returned no OpenCode-compatible model ids");
  }

  const modelDetails: ModelInfo[] = models.map((modelId) => withMergedModalities(modelDetailsForId(modelId, modelDetailsById)));

  return { baseURL, models, modelDetails };
}

async function loadRegistries(input: ProviderValidationInput): Promise<ModelRegistry[]> {
  const loaded = await Promise.all((input.modelRegistryPaths ?? []).map((path) => loadModelRegistryFile(path)));
  return [...(input.registries ?? []), ...loaded];
}

function isModelInfo(value: ModelInfo | undefined): value is ModelInfo {
  return Boolean(value);
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
  if (modelInfo?.capabilities?.reasoning) {
    config.reasoning = true;
  }
  if (modelInfo?.capabilities?.toolCall) {
    config.tool_call = true;
  }
  if (modelInfo?.contextLength) {
    config.limit = { context: modelInfo.contextLength };
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

function isOpenCodeCompatibleModel(model: { type?: string }): boolean {
  if (typeof model.type !== "string") {
    return true;
  }

  return !["embedding", "embed", "rerank", "reranker"].includes(model.type.trim().toLowerCase());
}

async function fetchNativeRestModelDetails(
  baseURL: string,
  headers: Record<string, string>,
  fetchImpl: FetchLike
): Promise<ModelInfo[]> {
  if (!isLikelyLmStudioBaseUrl(baseURL)) {
    return [];
  }

  for (const endpoint of nativeLmStudioModelEndpoints(baseURL)) {
    try {
      const response = await fetchImpl(endpoint, { headers });
      if (!response.ok) {
        continue;
      }
      const body = await response.json();
      const rawModels = modelListItems(body);
      if (!rawModels) {
        continue;
      }
      return rawModels.map((model) => normalizeModelInfo(model, "lmstudio-rest"));
    } catch {
      continue;
    }
  }

  return [];
}

function nativeLmStudioModelEndpoints(baseURL: string): string[] {
  const url = new URL(baseURL);
  url.pathname = "/api/v1/models";
  url.search = "";
  url.hash = "";
  const v1 = url.toString();
  url.pathname = "/api/v0/models";
  const v0 = url.toString();
  return [v1, v0];
}

function isLikelyLmStudioBaseUrl(baseURL: string): boolean {
  const url = new URL(baseURL);
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && url.port === "1234";
}

function normalizeModelInfo(raw: Record<string, unknown>, source: string): ModelInfo {
  const id = String(raw.id ?? raw.key ?? raw.model ?? "").trim();
  const capabilitiesObject = objectValue(raw.capabilities);
  const modalities = parseCapabilitiesFromApi(raw as { modalities?: unknown; capabilities?: unknown });
  const type = stringValue(raw.type);
  const contextLength = numberValue(raw.max_context_length ?? raw.context_length ?? raw.contextLength);
  const toolCall = capabilityFlag(
    raw.tool_call ??
      raw.tool_calls ??
      raw.toolCall ??
      raw.supports_tool_calls ??
      raw.supportsToolCalls ??
      capabilitiesObject?.toolUse ??
      capabilitiesObject?.tool_use ??
      capabilitiesObject?.toolCall ??
      capabilitiesObject?.tool_call ??
      capabilitiesObject?.trainedForToolUse ??
      capabilitiesObject?.trained_for_tool_use
  );
  const reasoning = capabilityFlag(raw.reasoning ?? raw.supports_reasoning ?? capabilitiesObject?.reasoning);

  return cleanModelInfo({
    id,
    type,
    architecture: stringValue(raw.arch ?? raw.architecture),
    quantization: stringValue(raw.quantization) ?? stringValue(objectValue(raw.quantization)?.name),
    parameterSize: stringValue(raw.params_string ?? raw.paramsString ?? raw.parameterSize),
    state: stringValue(raw.state) ?? (Array.isArray(raw.loaded_instances) && raw.loaded_instances.length > 0 ? "loaded" : undefined),
    contextLength,
    modalities,
    capabilities: toolCall || reasoning ? { toolCall, reasoning } : undefined,
    metadataSources: [source]
  });
}

function mergeModelDetails(models: ModelInfo[]): Map<string, ModelInfo> {
  const result = new Map<string, ModelInfo>();
  for (const model of models) {
    if (!model.id) {
      continue;
    }
    for (const alias of modelAliases(model.id)) {
      const current = result.get(alias);
      result.set(alias, current ? mergeModelInfo(current, model) : model);
    }
  }
  return result;
}

function modelDetailsForId(modelId: string, models: Map<string, ModelInfo>): ModelInfo {
  return modelAliases(modelId).reduce(
    (merged, alias) => {
      const next = models.get(alias);
      return next ? mergeModelInfo(merged, next) : merged;
    },
    { id: modelId } as ModelInfo
  );
}

function mergeModelInfo(base: ModelInfo, next: ModelInfo): ModelInfo {
  return cleanModelInfo({
    ...base,
    ...next,
    id: base.id || next.id,
    type: next.type ?? base.type,
    architecture: next.architecture ?? base.architecture,
    quantization: next.quantization ?? base.quantization,
    parameterSize: next.parameterSize ?? base.parameterSize,
    state: next.state ?? base.state,
    contextLength: next.contextLength ?? base.contextLength,
    modalities: next.modalities ?? base.modalities,
    capabilities:
      base.capabilities || next.capabilities
        ? {
            ...base.capabilities,
            ...next.capabilities
          }
        : undefined,
    metadataSources: [...new Set([...(base.metadataSources ?? []), ...(next.metadataSources ?? [])])]
  });
}

function withMergedModalities(model: ModelInfo): ModelInfo {
  const modalities = mergeModelCapabilities(model.id, model.modalities);
  return cleanModelInfo({
    ...model,
    modalities,
    metadataSources: modalities
      ? [...new Set([...(model.metadataSources ?? []), model.modalities ? undefined : "heuristics"].filter((v): v is string => Boolean(v)))]
      : model.metadataSources
  });
}

function modelAliases(modelId: string): string[] {
  const normalized = modelId.trim();
  const withoutPrefix = normalized.includes("/") ? normalized.split("/").pop()! : normalized;
  return [...new Set([normalized, withoutPrefix])];
}

function cleanModelInfo(model: ModelInfo): ModelInfo {
  const capabilities =
    model.capabilities?.toolCall || model.capabilities?.reasoning
      ? model.capabilities
      : undefined;
  return {
    id: model.id,
    ...(model.type ? { type: model.type } : {}),
    ...(model.architecture ? { architecture: model.architecture } : {}),
    ...(model.quantization ? { quantization: model.quantization } : {}),
    ...(model.parameterSize ? { parameterSize: model.parameterSize } : {}),
    ...(model.state ? { state: model.state } : {}),
    ...(model.contextLength ? { contextLength: model.contextLength } : {}),
    ...(model.modalities ? { modalities: model.modalities } : {}),
    ...(capabilities ? { capabilities } : {}),
    ...(model.metadataSources?.length ? { metadataSources: model.metadataSources } : {})
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (["true", "yes", "1"].includes(value.toLowerCase())) {
      return true;
    }
    if (["false", "no", "0"].includes(value.toLowerCase())) {
      return false;
    }
  }
  return undefined;
}

function capabilityFlag(value: unknown): boolean | undefined {
  if (typeof value === "object" && value !== null) {
    return true;
  }
  return booleanValue(value);
}

function modelListItems(body: unknown): Array<Record<string, unknown>> | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const data = (body as { data?: unknown }).data;
  const models = (body as { models?: unknown }).models;
  const items = Array.isArray(data) ? data : Array.isArray(models) ? models : undefined;
  if (!items) {
    return undefined;
  }
  if (!items.every((model) => typeof model === "object" && model !== null)) {
    return undefined;
  }
  return items as Array<Record<string, unknown>>;
}

async function safeLoadLmStudioSdkModels(loader: LmStudioSdkLoader, baseURL: string): Promise<ModelInfo[]> {
  try {
    return await loader(baseURL);
  } catch {
    return [];
  }
}

async function loadLmStudioSdkModels(baseURL: string): Promise<ModelInfo[]> {
  const sdk = await import("@lmstudio/sdk");
  const Client = (sdk as { LMStudioClient?: new (opts?: unknown) => unknown }).LMStudioClient;
  if (!Client) {
    return [];
  }

  const wsBaseURL = httpBaseUrlToWs(baseURL);
  const connectedClient = new Client({ baseUrl: wsBaseURL, logger: silentLogger }) as {
    system?: {
      listDownloadedModels?: () => Promise<unknown[]>;
    };
    [Symbol.asyncDispose]?: () => Promise<void>;
  };
  try {
    const models = await connectedClient.system?.listDownloadedModels?.();
    if (!Array.isArray(models)) {
      return [];
    }

    return models.map((model) => {
      const raw = model as Record<string, unknown>;
      const id = stringValue(raw.modelKey ?? raw.path ?? raw.id ?? raw.displayName) ?? "";
      const vision = booleanValue(raw.vision);
      const trainedForToolUse = booleanValue(raw.trainedForToolUse ?? raw.trained_for_tool_use);
      return cleanModelInfo({
        id,
        type: stringValue(raw.type) ?? "llm",
        architecture: stringValue(raw.architecture),
        quantization: stringValue(raw.quantization) ?? stringValue(objectValue(raw.quantization)?.name),
        parameterSize: stringValue(raw.paramsString),
        contextLength: numberValue(raw.maxContextLength ?? raw.max_context_length),
        modalities: vision ? { input: ["text", "image"], output: ["text"] } : undefined,
        capabilities: trainedForToolUse ? { toolCall: true } : undefined,
        metadataSources: ["lmstudio-sdk"]
      });
    });
  } finally {
    await connectedClient[Symbol.asyncDispose]?.();
  }
}

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

function httpBaseUrlToWs(baseURL: string): string {
  const url = new URL(baseURL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
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
