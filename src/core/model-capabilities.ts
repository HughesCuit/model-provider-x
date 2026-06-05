import type { ModelModalities } from "../shared/types.js";

const MODEL_CAPABILITIES: Record<string, ModelModalities> = {
  "gpt-4o": { input: ["text", "image"], output: ["text"] },
  "gpt-4o-mini": { input: ["text", "image"], output: ["text"] },
  "gpt-4-turbo": { input: ["text", "image"], output: ["text"] },
  "gpt-4-vision-preview": { input: ["text", "image"], output: ["text"] },
  "gpt-4.1": { input: ["text", "image"], output: ["text"] },
  "gpt-4.1-mini": { input: ["text", "image"], output: ["text"] },
  "gpt-4.1-nano": { input: ["text", "image"], output: ["text"] },
  "gpt-5": { input: ["text", "image"], output: ["text"] },
  "gpt-5-mini": { input: ["text", "image"], output: ["text"] },
  "gpt-5-nano": { input: ["text", "image"], output: ["text"] },
  "o1": { input: ["text", "image"], output: ["text"] },
  "o1-mini": { input: ["text", "image"], output: ["text"] },
  "o1-pro": { input: ["text", "image"], output: ["text"] },
  "o3": { input: ["text", "image"], output: ["text"] },
  "o3-mini": { input: ["text", "image"], output: ["text"] },
  "o3-pro": { input: ["text", "image"], output: ["text"] },
  "o4-mini": { input: ["text", "image"], output: ["text"] },

  "claude-3-opus": { input: ["text", "image"], output: ["text"] },
  "claude-3-sonnet": { input: ["text", "image"], output: ["text"] },
  "claude-3-haiku": { input: ["text", "image"], output: ["text"] },
  "claude-3.5-sonnet": { input: ["text", "image"], output: ["text"] },
  "claude-3.5-haiku": { input: ["text", "image"], output: ["text"] },
  "claude-4-opus": { input: ["text", "image"], output: ["text"] },
  "claude-4-sonnet": { input: ["text", "image"], output: ["text"] },
  "claude-4.5-opus": { input: ["text", "image"], output: ["text"] },
  "claude-4.5-sonnet": { input: ["text", "image"], output: ["text"] },
  "claude-4.5-haiku": { input: ["text", "image"], output: ["text"] },

  "gemini-pro-vision": { input: ["text", "image"], output: ["text"] },
  "gemini-1.5-pro": { input: ["text", "image", "audio", "video"], output: ["text"] },
  "gemini-1.5-flash": { input: ["text", "image", "audio", "video"], output: ["text"] },
  "gemini-2.0-flash": { input: ["text", "image", "audio", "video"], output: ["text"] },
  "gemini-2.5-pro": { input: ["text", "image", "audio", "video"], output: ["text"] },
  "gemini-2.5-flash": { input: ["text", "image", "audio", "video"], output: ["text"] },

  "qwen-vl-plus": { input: ["text", "image"], output: ["text"] },
  "qwen-vl-max": { input: ["text", "image"], output: ["text"] },
  "qwen-vl-chat": { input: ["text", "image"], output: ["text"] },
  "qwen2.5-vl-72b-instruct": { input: ["text", "image"], output: ["text"] },
  "qwen2.5-vl-7b-instruct": { input: ["text", "image"], output: ["text"] },
  "qwen2.5-vl-32b-instruct": { input: ["text", "image"], output: ["text"] },
  "qwen3-vl-235b-a22b": { input: ["text", "image"], output: ["text"] },
  "qwen3-vl-30b-a3b": { input: ["text", "image"], output: ["text"] },

  "llama-3.2-11b-vision-instruct": { input: ["text", "image"], output: ["text"] },
  "llama-3.2-90b-vision-instruct": { input: ["text", "image"], output: ["text"] },
  "llama-4-scout-17b-16e-instruct": { input: ["text", "image"], output: ["text"] },
  "llama-4-maverick-17b-128e-instruct": { input: ["text", "image"], output: ["text"] },

  "deepseek-vl": { input: ["text", "image"], output: ["text"] },
  "deepseek-vl2": { input: ["text", "image"], output: ["text"] },

  "glm-4v": { input: ["text", "image"], output: ["text"] },
  "glm-4.5v": { input: ["text", "image"], output: ["text"] },
  "glm-4.6v": { input: ["text", "image"], output: ["text"] },
  "glm-5v-turbo": { input: ["text", "image"], output: ["text"] },

  "pixtral-large-2411": { input: ["text", "image"], output: ["text"] },
  "pixtral-large-2502": { input: ["text", "image"], output: ["text"] },
  "mistral-small-3.1-24b-instruct": { input: ["text", "image"], output: ["text"] },

  "phi-4-multimodal": { input: ["text", "image", "audio"], output: ["text"] },

  "gemma-3-4b-it": { input: ["text", "image"], output: ["text"] },
  "gemma-3-12b-it": { input: ["text", "image"], output: ["text"] },
  "gemma-3-27b-it": { input: ["text", "image"], output: ["text"] },
  "gemma-4-26b-a4b-it": { input: ["text", "image"], output: ["text"] },
  "gemma-4-31b-it": { input: ["text", "image"], output: ["text"] },
};

const VISION_KEYWORDS = [
  "vision",
  "vl",
  "visual",
  "multimodal",
  "pixtral",
];

const KNOWN_MODALITY_MODELS = new Set(Object.keys(MODEL_CAPABILITIES));

export function lookupModelCapabilities(modelId: string): ModelModalities | undefined {
  const normalized = modelId.toLowerCase().trim();
  if (MODEL_CAPABILITIES[normalized]) {
    return MODEL_CAPABILITIES[normalized];
  }

  for (const [pattern, caps] of Object.entries(MODEL_CAPABILITIES)) {
    if (normalized.includes(pattern) || pattern.includes(normalized)) {
      return caps;
    }
  }

  const withoutPrefix = normalized.includes("/")
    ? normalized.split("/").pop()!
    : normalized;
  if (MODEL_CAPABILITIES[withoutPrefix]) {
    return MODEL_CAPABILITIES[withoutPrefix];
  }

  for (const [pattern, caps] of Object.entries(MODEL_CAPABILITIES)) {
    if (withoutPrefix.includes(pattern) || pattern.includes(withoutPrefix)) {
      return caps;
    }
  }

  for (const keyword of VISION_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return { input: ["text", "image"], output: ["text"] };
    }
  }

  return undefined;
}

export function parseCapabilitiesFromApi(model: {
  modalities?: unknown;
  capabilities?: unknown;
  supported_parameters?: unknown;
}): ModelModalities | undefined {
  if (model.modalities && typeof model.modalities === "object") {
    const m = model.modalities as Record<string, unknown>;
    const result: ModelModalities = {};
    if (Array.isArray(m.input)) {
      result.input = m.input.filter((v): v is string => typeof v === "string") as ModelModalities["input"];
    }
    if (Array.isArray(m.output)) {
      result.output = m.output.filter((v): v is string => typeof v === "string") as ModelModalities["output"];
    }
    if (result.input || result.output) {
      return result;
    }
  }

  if (model.capabilities && typeof model.capabilities === "object") {
    const caps = model.capabilities as Record<string, unknown>;
    const input: string[] = ["text"];
    if (caps.vision || caps.image || caps.multimodal || caps.image_input) {
      input.push("image");
    }
    if (caps.audio || caps.speech) {
      input.push("audio");
    }
    if (caps.video) {
      input.push("video");
    }
    if (input.length > 1) {
      return { input: input as ModelModalities["input"], output: ["text"] };
    }
  }

  return undefined;
}

export function mergeModelCapabilities(
  modelId: string,
  apiCapabilities?: ModelModalities,
  userOverrides?: ModelModalities
): ModelModalities | undefined {
  if (userOverrides && (userOverrides.input || userOverrides.output)) {
    return userOverrides;
  }

  if (apiCapabilities && (apiCapabilities.input || apiCapabilities.output)) {
    return apiCapabilities;
  }

  return lookupModelCapabilities(modelId);
}

export function isKnownModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase().trim();
  if (KNOWN_MODALITY_MODELS.has(normalized)) {
    return true;
  }

  const withoutPrefix = normalized.includes("/")
    ? normalized.split("/").pop()!
    : normalized;
  if (KNOWN_MODALITY_MODELS.has(withoutPrefix)) {
    return true;
  }

  for (const keyword of VISION_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return true;
    }
  }

  return false;
}

export function parseModalitiesFromString(value: string): ModelModalities {
  const parts = value.split(":");
  if (parts.length !== 2) {
    throw new Error(`Invalid modalities format: ${value}. Expected <input>:<output>`);
  }

  const [inputStr, outputStr] = parts;
  const parseModalityList = (s: string): ("text" | "image" | "audio" | "video" | "pdf")[] => {
    return s.split(",").map((m) => {
      const trimmed = m.trim().toLowerCase();
      if (["text", "image", "audio", "video", "pdf"].includes(trimmed)) {
        return trimmed as "text" | "image" | "audio" | "video" | "pdf";
      }
      throw new Error(`Unknown modality: ${trimmed}`);
    });
  };

  return {
    input: parseModalityList(inputStr),
    output: parseModalityList(outputStr),
  };
}
