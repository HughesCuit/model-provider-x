import type { Choice } from "./tui.js";

export interface ProviderPreset {
  id: string;
  name: string;
  baseURL: string;
  apiKeyRequired: boolean;
}

export type ProviderChoiceValue = string | "custom";

const providerPresets: ProviderPreset[] = [
  { id: "unsloth", name: "Unsloth Local", baseURL: "http://localhost:8888/v1", apiKeyRequired: false },
  { id: "lmstudio", name: "LM Studio", baseURL: "http://localhost:1234/v1", apiKeyRequired: false },
  { id: "ollama", name: "Ollama", baseURL: "http://localhost:11434/v1", apiKeyRequired: false },
  { id: "vllm", name: "vLLM", baseURL: "http://localhost:8000/v1", apiKeyRequired: false },
  { id: "openai", name: "OpenAI", baseURL: "https://api.openai.com/v1", apiKeyRequired: true },
  { id: "openrouter", name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", apiKeyRequired: true }
];

export function getProviderPresets(): ProviderPreset[] {
  return [...providerPresets];
}

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return providerPresets.find((preset) => preset.id === id);
}

export function createProviderChoices(): Choice<ProviderChoiceValue>[] {
  return [
    ...providerPresets.map((preset) => ({
      label: preset.name,
      value: preset.id,
      hint: preset.baseURL
    })),
    { label: "Custom provider", value: "custom", hint: "enter URL and API key manually" }
  ];
}
