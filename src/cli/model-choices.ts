import type { Choice } from "./tui.js";
import type { ModelInfo } from "../shared/types.js";

const likelyUnsupportedModelName = /\b(?:embed|embedding|embeddings|bge|e5|nomic-embed)\b/i;

export function createModelChoices(models: Array<string | ModelInfo>): Choice<string>[] {
  return models.map((model) => {
    const info = typeof model === "string" ? { id: model } : model;
    const unsupported = isLikelyUnsupportedModel(info);
    const hint = modelHint(info, unsupported);
    if (!unsupported) {
      return modelChoice(info.id, hint, true);
    }

    return modelChoice(info.id, hint, false);
  });
}

export function isLikelyUnsupportedModelName(model: string): boolean {
  return likelyUnsupportedModelName.test(model);
}

function isLikelyUnsupportedModel(model: ModelInfo): boolean {
  return model.type === "embedding" || isLikelyUnsupportedModelName(model.id);
}

function modelHint(model: ModelInfo, unsupported: boolean): string | undefined {
  const hints = [
    model.type,
    model.architecture,
    model.quantization,
    model.contextLength ? `${formatContextLength(model.contextLength)} ctx` : undefined,
    model.modalities?.input?.includes("image") ? "vision" : undefined,
    model.capabilities?.toolCall ? "tools" : undefined,
    model.capabilities?.reasoning ? "reasoning" : undefined,
    model.state && model.state !== "loaded" ? model.state : undefined,
    unsupported ? "suspected unsupported model" : undefined
  ].filter((hint): hint is string => Boolean(hint));

  return hints.length ? hints.join(", ") : undefined;
}

function formatContextLength(value: number): string {
  if (value >= 1000 && value % 1000 === 0) {
    return `${value / 1000}k`;
  }
  if (value >= 1024 && value % 1024 === 0) {
    return `${value / 1024}k`;
  }
  return String(value);
}

function modelChoice(modelId: string, hint: string | undefined, selected: boolean): Choice<string> {
  return {
    label: modelId,
    value: modelId,
    ...(hint ? { hint } : {}),
    selected
  };
}
