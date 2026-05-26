export interface ProviderValidationInput {
  baseURL: string;
  apiKey?: string;
}

export interface ProviderValidationResult {
  baseURL: string;
  models: string[];
}

export interface ProviderConfigInput extends ProviderValidationInput {
  providerId: string;
  providerName: string;
  models: string[];
  opencodeApiType?: OpenCodeApiType;
}

export interface OpenCodeModelConfig {
  name: string;
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
