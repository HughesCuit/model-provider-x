import type { Choice } from "./tui.js";

export interface ProviderPreset {
  id: string;
  name: string;
  baseURL: string;
  apiKeyRequired: boolean;
  category?: "local" | "cloud" | "gateway";
}

export type ProviderChoiceValue = string | "custom";

const providerPresets: ProviderPreset[] = [
  // Local providers
  { id: "unsloth", name: "Unsloth Local", baseURL: "http://localhost:8888/v1", apiKeyRequired: false, category: "local" },
  { id: "lmstudio", name: "LM Studio", baseURL: "http://localhost:1234/v1", apiKeyRequired: false, category: "local" },
  { id: "ollama", name: "Ollama", baseURL: "http://localhost:11434/v1", apiKeyRequired: false, category: "local" },
  { id: "vllm", name: "vLLM", baseURL: "http://localhost:8000/v1", apiKeyRequired: false, category: "local" },
  
  // Cloud providers
  { id: "openai", name: "OpenAI", baseURL: "https://api.openai.com/v1", apiKeyRequired: true, category: "cloud" },
  { id: "anthropic", name: "Anthropic", baseURL: "https://api.anthropic.com/v1", apiKeyRequired: true, category: "cloud" },
  { id: "google", name: "Google AI", baseURL: "https://generativelanguage.googleapis.com/v1", apiKeyRequired: true, category: "cloud" },
  { id: "deepseek", name: "DeepSeek", baseURL: "https://api.deepseek.com/v1", apiKeyRequired: true, category: "cloud" },
  { id: "mistral", name: "Mistral AI", baseURL: "https://api.mistral.ai/v1", apiKeyRequired: true, category: "cloud" },
  { id: "groq", name: "Groq", baseURL: "https://api.groq.com/openai/v1", apiKeyRequired: true, category: "cloud" },
  { id: "together", name: "Together AI", baseURL: "https://api.together.xyz/v1", apiKeyRequired: true, category: "cloud" },
  { id: "fireworks", name: "Fireworks AI", baseURL: "https://api.fireworks.ai/inference/v1", apiKeyRequired: true, category: "cloud" },
  { id: "xai", name: "xAI (Grok)", baseURL: "https://api.x.ai/v1", apiKeyRequired: true, category: "cloud" },
  { id: "cohere", name: "Cohere", baseURL: "https://api.cohere.ai/v1", apiKeyRequired: true, category: "cloud" },
  { id: "alibaba", name: "Alibaba Qwen", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKeyRequired: true, category: "cloud" },
  
  // Gateways
  { id: "openrouter", name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", apiKeyRequired: true, category: "gateway" },
  { id: "requesty", name: "Requesty", baseURL: "https://router.requesty.ai/v1", apiKeyRequired: true, category: "gateway" },
  { id: "siliconflow", name: "SiliconFlow", baseURL: "https://api.siliconflow.cn/v1", apiKeyRequired: true, category: "gateway" },
  { id: "nvidia", name: "NVIDIA NIM", baseURL: "https://integrate.api.nvidia.com/v1", apiKeyRequired: true, category: "gateway" }
];

export function getProviderPresets(): ProviderPreset[] {
  return [...providerPresets];
}

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return providerPresets.find((preset) => preset.id === id);
}

export function createProviderChoices(): Choice<ProviderChoiceValue>[] {
  const localProviders = providerPresets.filter((p) => p.category === "local");
  const cloudProviders = providerPresets.filter((p) => p.category === "cloud");
  const gatewayProviders = providerPresets.filter((p) => p.category === "gateway");

  return [
    ...localProviders.map((preset) => ({
      label: preset.name,
      value: preset.id,
      hint: preset.baseURL
    })),
    ...cloudProviders.map((preset) => ({
      label: preset.name,
      value: preset.id,
      hint: preset.baseURL
    })),
    ...gatewayProviders.map((preset) => ({
      label: preset.name,
      value: preset.id,
      hint: preset.baseURL
    })),
    { label: "Custom provider", value: "custom", hint: "enter URL and API key manually" }
  ];
}
