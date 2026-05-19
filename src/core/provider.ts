import type {
  OpenCodeConfigFragment,
  OpenCodeProviderConfig,
  ProviderConfigInput,
  ProviderValidationInput,
  ProviderValidationResult
} from "../shared/types.js";

type FetchLike = (input: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status?: number;
  statusText?: string;
  json(): Promise<unknown>;
}>;

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
  fetchImpl: FetchLike = globalThis.fetch as FetchLike
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

  const models = [...new Set(body.data.map((model: { id: string }) => model.id.trim()).filter(Boolean))];
  if (models.length === 0) {
    throw new Error("Provider returned no model ids");
  }

  return { baseURL, models };
}

export function buildProviderConfig(input: ProviderConfigInput): OpenCodeConfigFragment {
  const baseURL = normalizeBaseUrl(input.baseURL);
  const apiKey = input.apiKey?.trim();
  const provider: OpenCodeProviderConfig = {
    npm: "@ai-sdk/openai-compatible",
    name: input.providerName.trim(),
    options: {
      baseURL
    },
    models: Object.fromEntries(input.models.map((model) => [model, { name: model }]))
  };

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

function isModelListResponse(body: unknown): body is { data: Array<{ id: string }> } {
  return (
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { data?: unknown }).data) &&
    (body as { data: unknown[] }).data.every(
      (model) => typeof model === "object" && model !== null && typeof (model as { id?: unknown }).id === "string"
    )
  );
}
