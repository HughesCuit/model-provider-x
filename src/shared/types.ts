export interface ProviderValidationInput {
  baseURL: string;
  apiKey?: string;
  providerId?: string;
  registries?: ModelRegistry[];
  modelRegistryPaths?: string[];
}

export interface ModelModalities {
  input?: ("text" | "audio" | "image" | "video" | "pdf")[];
  output?: ("text" | "audio" | "image" | "video" | "pdf")[];
}

export interface ModelInfo {
  id: string;
  type?: string;
  architecture?: string;
  quantization?: string;
  parameterSize?: string;
  state?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  modalities?: ModelModalities;
  capabilities?: {
    toolCall?: boolean;
    reasoning?: boolean;
  };
  metadataSources?: string[];
}

export interface ModelRegistry {
  source: string;
  providers?: Record<string, { models?: Record<string, ModelRegistryModel> }>;
  models?: Record<string, ModelRegistryModel>;
}

export type ModelRegistryModel = Omit<ModelInfo, "id" | "metadataSources"> & {
  id?: string;
  limit?: { context?: number; input?: number; output?: number };
  input_modalities?: ModelModalities["input"];
  output_modalities?: ModelModalities["output"];
  tool_call?: boolean;
  reasoning?: boolean;
};

export interface ProviderValidationResult {
  baseURL: string;
  models: string[];
  modelDetails: ModelInfo[];
}

export interface ProviderConfigInput extends ProviderValidationInput {
  providerId: string;
  providerName: string;
  models: string[];
  modelDetails?: ModelInfo[];
  opencodeApiType?: OpenCodeApiType;
}

export interface OpenCodeModelConfig {
  name: string;
  modalities?: ModelModalities;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  temperature?: boolean;
  limit?: { context?: number; input?: number; output?: number };
}

export interface OpenCodeProviderConfig {
  npm: "@ai-sdk/openai-compatible" | "@ai-sdk/openai" | "@ai-sdk/anthropic";
  name: string;
  options: {
    baseURL: string;
    apiKey?: string;
    setCacheKey?: boolean;
  };
  models: Record<string, OpenCodeModelConfig>;
}

export type OpenCodeApiType = "chat" | "responses" | "messages";

export interface OpenCodeConfigFragment {
  $schema: "https://opencode.ai/config.json";
  provider: Record<string, OpenCodeProviderConfig>;
}

export interface DiscoveredConfig {
  path: string;
  label: string;
  exists: boolean;
  writable: boolean;
  hasProvider: boolean;
}

export interface WriteProviderInput {
  targetPath: string;
  providerId: string;
  provider: OpenCodeProviderConfig;
}

export interface WriteProviderResult {
  targetPath: string;
  backupPath?: string;
}

export interface ConfiguratorApi {
  validateAndFetchModels(input: ProviderValidationInput): Promise<ProviderValidationResult>;
  previewProviderConfig(input: ProviderConfigInput): Promise<OpenCodeConfigFragment>;
  discoverOpenCodeConfigs(providerId?: string): Promise<DiscoveredConfig[]>;
  mergeProviderIntoConfig(input: WriteProviderInput): Promise<WriteProviderResult>;
  chooseConfigPath(): Promise<string | undefined>;
  createDefaultConfig(input: Omit<WriteProviderInput, "targetPath">): Promise<WriteProviderResult>;
}

export interface ProviderProfile {
  id: string;
  name: string;
  baseURL: string;
  apiKey?: string;
  models: string[];
  target?: "opencode" | "codex" | "claude-code";
  opencodeApiType?: OpenCodeApiType;
  proxy?: boolean;
}

export interface ProxyConfig {
  host: string;
  port: number;
  authToken: string;
}

export interface ToolConfig {
  profiles: Record<string, ProviderProfile>;
  proxy: ProxyConfig;
}
