import { readFile } from "node:fs/promises";
import { parse } from "jsonc-parser";
import type { ModelInfo, ModelModalities, ModelRegistry, ModelRegistryModel } from "../shared/types.js";

export const DEFAULT_MODEL_REGISTRY_FILE = "model-provider-x.models.jsonc";

const BUILT_IN_MODELS_DEV_REGISTRY: ModelRegistry = {
  source: "models-dev",
  providers: {
    openai: {
      models: {
        "gpt-oss-20b": {
          type: "llm",
          contextLength: 131072,
          capabilities: {
            reasoning: true,
            toolCall: true
          }
        }
      }
    }
  }
};

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
  const registries = [
    ...(input.includeBuiltIn === false ? [] : [BUILT_IN_MODELS_DEV_REGISTRY]),
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
