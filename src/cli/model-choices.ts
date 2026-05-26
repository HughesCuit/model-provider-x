import type { Choice } from "./tui.js";

const likelyUnsupportedModelName = /\b(?:embed|embedding|embeddings|bge|e5|nomic-embed)\b/i;

export function createModelChoices(models: string[]): Choice<string>[] {
  return models.map((model) => {
    if (!isLikelyUnsupportedModelName(model)) {
      return { label: model, value: model, selected: true };
    }

    return {
      label: model,
      value: model,
      hint: "suspected unsupported model",
      selected: false
    };
  });
}

export function isLikelyUnsupportedModelName(model: string): boolean {
  return likelyUnsupportedModelName.test(model);
}
