import { readFile } from "node:fs/promises";
import { parse } from "jsonc-parser";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ModelInfo, ModelModalities, ModelRegistry, ModelRegistryModel } from "../shared/types.js";

export const DEFAULT_MODEL_REGISTRY_FILE = "model-provider-x.models.jsonc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DEV_DATA_PATH = resolve(__dirname, "../data/models-dev.json");

let modelsDevCache: ModelRegistry | null = null;

async function loadModelsDevRegistry(): Promise<ModelRegistry> {
  if (modelsDevCache) {
    return modelsDevCache;
  }

  try {
    const text = await readFile(MODELS_DEV_DATA_PATH, "utf-8");
    const data = JSON.parse(text) as { source?: string; providers?: Record<string, { models?: Record<string, ModelRegistryModel> }> };
    modelsDevCache = {
      source: data.source ?? "models-dev",
      providers: data.providers
    };
    return modelsDevCache;
  } catch {
    return { source: "models-dev", providers: {} };
  }
}

export async function loadModelRegistryFile(path: string): Promise<ModelRegistry> {
  const text = await readFile(path, "utf8");
  const value = parse(text) as unknown;
  if (!isObject(value)) {
    throw new Error(`Model registry must be an object: ${path}`);
  }
  return normalizeRegistry(value as Record<string, unknown>, "local-registry");
}

export async function resolveModelRegistryMetadata(input: {
  providerId?: string;
  modelId: string;
  registries?: ModelRegistry[];
  includeBuiltIn?: boolean;
}): Promise<ModelInfo | undefined> {
  const builtInRegistry = input.includeBuiltIn === false ? undefined : await loadModelsDevRegistry();
  const registries = [
    ...(builtInRegistry ? [builtInRegistry] : []),
    ...(input.registries ?? [])
  ];

  let result: ModelInfo | undefined;
  for (const registry of registries) {
    const model = lookupRegistryModel(registry, input.providerId, input.modelId);
    if (!model) {
      continue;
    }
    const info = normalizeRegistryModel(input.modelId, model, registry.source);
    result = result ? mergeRegistryInfo(result, info) : info;
  }

  return result;
}

function normalizeRegistry(value: Record<string, unknown>, fallbackSource: string): ModelRegistry {
  return {
    source: stringValue(value.source) ?? fallbackSource,
    providers: normalizeProviders(value.providers),
    models: normalizeModels(value.models)
  };
}

function lookupRegistryModel(registry: ModelRegistry, providerId: string | undefined, modelId: string): ModelRegistryModel | undefined {
  const aliases = modelAliases(modelId);
  
  // First try the specified provider
  if (providerId) {
    const providerModels = registry.providers?.[providerId]?.models;
    const match = lookupModel(providerModels, aliases);
    if (match) {
      return match;
    }

    const modelsDevProvider = (registry as unknown as Record<string, unknown>)[providerId];
    if (isObject(modelsDevProvider)) {
      const provider = normalizeProviders({ [providerId]: modelsDevProvider })?.[providerId];
      const providerMatch = lookupModel(provider?.models, aliases);
      if (providerMatch) {
        return providerMatch;
      }
    }
  }

  // Search across all providers if not found in specified provider
  if (registry.providers) {
    for (const [, provider] of Object.entries(registry.providers)) {
      const match = lookupModel(provider.models, aliases);
      if (match) {
        return match;
      }
    }
  }

  return lookupModel(registry.models, aliases);
}

function lookupModel(models: Record<string, ModelRegistryModel> | undefined, aliases: string[]): ModelRegistryModel | undefined {
  if (!models) {
    return undefined;
  }
  for (const alias of aliases) {
    if (models[alias]) {
      return models[alias];
    }
  }
  return undefined;
}

function normalizeRegistryModel(modelId: string, model: ModelRegistryModel, source: string): ModelInfo {
  const modalities = normalizeModalities(model);
  const capabilities = model.capabilities as (ModelRegistryModel["capabilities"] & { tool_call?: boolean }) | undefined;
  const toolCall = booleanValue(capabilities?.toolCall ?? capabilities?.tool_call ?? model.tool_call);
  const reasoning = booleanValue(capabilities?.reasoning ?? model.reasoning);
  return cleanModelInfo({
    id: model.id ?? modelId,
    type: model.type,
    architecture: model.architecture,
    quantization: model.quantization,
    parameterSize: model.parameterSize,
    state: model.state,
    contextLength: model.contextLength ?? model.limit?.context,
    maxOutputTokens: model.limit?.output,
    modalities,
    capabilities: toolCall || reasoning ? { toolCall, reasoning } : undefined,
    metadataSources: [source]
  });
}

function normalizeModalities(model: ModelRegistryModel): ModelModalities | undefined {
  if (model.modalities) {
    return model.modalities;
  }
  if (model.input_modalities || model.output_modalities) {
    return {
      ...(model.input_modalities ? { input: model.input_modalities } : {}),
      ...(model.output_modalities ? { output: model.output_modalities } : {})
    };
  }
  return undefined;
}

function mergeRegistryInfo(base: ModelInfo, next: ModelInfo): ModelInfo {
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
    maxOutputTokens: next.maxOutputTokens ?? base.maxOutputTokens,
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

function normalizeProviders(value: unknown): ModelRegistry["providers"] {
  if (!isObject(value)) {
    return undefined;
  }
  const providers: ModelRegistry["providers"] = {};
  for (const [providerId, providerValue] of Object.entries(value)) {
    if (!isObject(providerValue)) {
      continue;
    }
    const models = normalizeModels(providerValue.models);
    if (models) {
      providers[providerId] = { models };
    }
  }
  return Object.keys(providers).length ? providers : undefined;
}

function normalizeModels(value: unknown): Record<string, ModelRegistryModel> | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const models: Record<string, ModelRegistryModel> = {};
  for (const [modelId, modelValue] of Object.entries(value)) {
    if (isObject(modelValue)) {
      models[modelId] = modelValue as ModelRegistryModel;
    }
  }
  return Object.keys(models).length ? models : undefined;
}

function modelAliases(modelId: string): string[] {
  const normalized = modelId.trim().toLowerCase();
  const withoutPrefix = normalized.includes("/") ? normalized.split("/").pop()! : normalized;
  
  // Strip common suffixes for fuzzy matching
  const suffixes = [
    "-it", "-qat", "-instruct", "-chat", "-gguf", "-gptq", "-awq", "-exl2",
    "-fp16", "-fp32", "-int4", "-int8", "-4bit", "-8bit", "-16bit",
    "-preview", "-latest", "-beta", "-alpha", "-rc", "-snapshot",
    "-mlx", "-mlxc", "-bnb", "-hqq",
    "-ud", "-xl", "-xs", "-small", "-medium", "-large", "-mini", "-nano", "-micro",
    "-turbo", "-fast", "-pro", "-plus", "-max", "-ultra", "-flash", "-lite",
    "-mtp", "-moe", "-a17b", "-a22b", "-a3b", "-a10b", "-a12b", "-a55b",
    "-chat", "-base", "-raw", "-uncensored", "-abliterated"
  ];
  
  let fuzzy = withoutPrefix;
  for (const suffix of suffixes) {
    if (fuzzy.endsWith(suffix)) {
      fuzzy = fuzzy.slice(0, -suffix.length);
      break;
    }
  }
  
  // Also try removing version suffixes like "-v1", "-v2", etc.
  const versionMatch = fuzzy.match(/-v\d+$/);
  const withoutVersion = versionMatch ? fuzzy.slice(0, -versionMatch[0].length) : fuzzy;
  
  // Try removing parameter size suffixes like "-12b", "-7b", "-70b", etc.
  const paramMatch = fuzzy.match(/-\d+[bBmMkKtT]$/);
  const withoutParams = paramMatch ? fuzzy.slice(0, -paramMatch[0].length) : fuzzy;
  
  return [...new Set([normalized, withoutPrefix, fuzzy, withoutVersion, withoutParams])];
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
    ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
    ...(model.modalities ? { modalities: model.modalities } : {}),
    ...(capabilities ? { capabilities } : {}),
    ...(model.metadataSources?.length ? { metadataSources: model.metadataSources } : {})
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
