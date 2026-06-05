import { describe, expect, it, vi } from "vitest";
import {
  buildProviderConfig,
  detectProviderCapabilities,
  normalizeBaseUrl,
  recommendProxyMode,
  validateAndFetchModels
} from "../src/core/provider";

describe("provider utilities", () => {
  it("normalizes base urls by trimming whitespace and trailing slashes", () => {
    expect(normalizeBaseUrl(" http://localhost:8888/v1/// ")).toBe("http://localhost:8888/v1");
  });

  it("fetches models from /models without an auth header when api key is empty", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "qwen3.6-35b" }, { id: "gemma-4-e2b" }] })
    });

    const result = await validateAndFetchModels(
      { baseURL: "http://localhost:8888/v1/", apiKey: " " },
      fetchImpl
    );

    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:8888/v1/models", { headers: {} });
    expect(result.baseURL).toBe("http://localhost:8888/v1");
    expect(result.models).toEqual(["qwen3.6-35b", "gemma-4-e2b"]);
    expect(result.modelDetails).toHaveLength(2);
    expect(result.modelDetails[0].id).toBe("qwen3.6-35b");
    expect(result.modelDetails[1].id).toBe("gemma-4-e2b");
  });

  it("enriches sparse provider models from registry metadata", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "mimo-v2.5-tts" }] })
    });

    const result = await validateAndFetchModels(
      {
        baseURL: "http://127.0.0.1:3100/v1",
        providerId: "mimo-pool",
        registries: [
          {
            source: "project-registry",
            providers: {
              "mimo-pool": {
                models: {
                  "mimo-v2.5-tts": {
                    type: "tts",
                    modalities: { input: ["text"], output: ["audio"] },
                    capabilities: { toolCall: false, reasoning: false },
                    contextLength: 8192
                  }
                }
              }
            }
          }
        ]
      },
      fetchImpl
    );

    expect(result.modelDetails[0]).toMatchObject({
      id: "mimo-v2.5-tts",
      type: "tts",
      modalities: { input: ["text"], output: ["audio"] },
      contextLength: 8192,
      metadataSources: expect.arrayContaining(["openai-models", "project-registry"])
    });
  });

  it("enriches LM Studio models from native REST metadata", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "http://localhost:1234/v1/models") {
        return {
          ok: true,
          json: async () => ({
            data: [
              { id: "qwen2.5-vl-7b-instruct" },
              { id: "nomic-embed-text" }
            ]
          })
        };
      }

      if (url === "http://localhost:1234/api/v1/models") {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "qwen2.5-vl-7b-instruct",
                type: "llm",
                arch: "qwen2vl",
                quantization: "Q4_K_M",
                state: "loaded",
                max_context_length: 32768,
                capabilities: {
                  vision: true,
                  trainedForToolUse: true,
                  reasoning: true
                }
              },
              {
                id: "nomic-embed-text",
                type: "embedding"
              }
            ]
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    });

    const result = await validateAndFetchModels({ baseURL: "http://localhost:1234/v1" }, fetchImpl);

    expect(result.models).toEqual(["qwen2.5-vl-7b-instruct"]);
    expect(result.modelDetails[0]).toMatchObject({
      id: "qwen2.5-vl-7b-instruct",
      type: "llm",
      architecture: "qwen2vl",
      quantization: "Q4_K_M",
      state: "loaded",
      contextLength: 32768,
      modalities: { input: ["text", "image"], output: ["text"] },
      capabilities: {
        toolCall: true,
        reasoning: true
      },
      metadataSources: expect.arrayContaining(["openai-models", "lmstudio-rest"])
    });
  });

  it("parses current LM Studio native REST model shapes", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "http://127.0.0.1:1234/v1/models") {
        return {
          ok: true,
          json: async () => ({
            data: [
              { id: "google/gemma-4-12b" },
              { id: "text-embedding-nomic-embed-text-v1.5" }
            ]
          })
        };
      }

      if (url === "http://127.0.0.1:1234/api/v1/models") {
        return {
          ok: true,
          json: async () => ({
            models: [
              {
                type: "llm",
                key: "google/gemma-4-12b",
                architecture: "gemma4",
                quantization: { name: "Q4_K_M", bits_per_weight: 4 },
                params_string: "12B",
                loaded_instances: [{ id: "google/gemma-4-12b" }],
                max_context_length: 131072,
                capabilities: {
                  vision: true,
                  trained_for_tool_use: true,
                  reasoning: { allowed_options: ["off", "on"], default: "on" }
                }
              },
              {
                type: "embedding",
                key: "text-embedding-nomic-embed-text-v1.5",
                quantization: { name: "Q4_K_M", bits_per_weight: 4 },
                max_context_length: 2048
              }
            ]
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    });

    const result = await validateAndFetchModels({ baseURL: "http://127.0.0.1:1234/v1" }, fetchImpl);

    expect(result.models).toEqual(["google/gemma-4-12b"]);
    expect(result.modelDetails[0]).toMatchObject({
      id: "google/gemma-4-12b",
      type: "llm",
      architecture: "gemma4",
      quantization: "Q4_K_M",
      parameterSize: "12B",
      state: "loaded",
      contextLength: 131072,
      modalities: { input: ["text", "image"], output: ["text"] },
      capabilities: { toolCall: true, reasoning: true }
    });
  });

  it("merges injected LM Studio SDK metadata after native REST detection", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "http://localhost:1234/v1/models") {
        return {
          ok: true,
          json: async () => ({ data: [{ id: "local/qwen3-8b" }] })
        };
      }
      if (url === "http://localhost:1234/api/v1/models") {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: "qwen3-8b", type: "llm", max_context_length: 40960 }]
          })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const result = await validateAndFetchModels(
      { baseURL: "http://localhost:1234/v1" },
      fetchImpl,
      async () => [
        {
          id: "qwen3-8b",
          architecture: "qwen3",
          parameterSize: "8B",
          capabilities: { toolCall: true },
          metadataSources: ["lmstudio-sdk"]
        }
      ]
    );

    expect(result.modelDetails[0]).toMatchObject({
      id: "local/qwen3-8b",
      architecture: "qwen3",
      parameterSize: "8B",
      contextLength: 40960,
      capabilities: { toolCall: true },
      metadataSources: expect.arrayContaining(["openai-models", "lmstudio-rest", "lmstudio-sdk"])
    });
  });

  it("filters typed embedding models from discovery", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "qwen3.6-35b", type: "llm" },
          { id: "nomic-embed-text", type: "embedding" },
          { id: "legacy-chat-model" }
        ]
      })
    });

    const result = await validateAndFetchModels({ baseURL: "http://localhost:1234/v1" }, fetchImpl);

    expect(result.models).toEqual(["qwen3.6-35b", "legacy-chat-model"]);
  });

  it("rejects providers that only return typed embedding models", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "text-embedding", type: "embed" }] })
    });

    await expect(validateAndFetchModels({ baseURL: "http://localhost:1234/v1" }, fetchImpl)).rejects.toThrow(
      "Provider returned no OpenCode-compatible model ids"
    );
  });

  it("includes bearer auth when api key is present", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-oss-20b" }] })
    });

    await validateAndFetchModels({ baseURL: "https://api.example.com/v1", apiKey: "sk-test" }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith("https://api.example.com/v1/models", {
      headers: { Authorization: "Bearer sk-test" }
    });
  });

  it("rejects malformed model responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ["missing-data-array"] })
    });

    await expect(validateAndFetchModels({ baseURL: "https://api.example.com/v1" }, fetchImpl)).rejects.toThrow(
      "Expected /models to return an object with a data array"
    );
  });

  it("detects provider API capabilities with lightweight endpoint probes", async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: url.endsWith("/models"),
      status: url.endsWith("/responses") ? 400 : url.endsWith("/messages") ? 404 : 200
    }));

    const capabilities = await detectProviderCapabilities({ baseURL: "http://localhost:1234/v1" }, fetchImpl);

    expect(capabilities).toEqual({
      baseURL: "http://localhost:1234/v1",
      apis: ["openai-compatible", "openai-responses"]
    });
  });

  it("does not treat OpenAI-shaped /messages responses as Anthropic Messages support", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/models")) {
        return { ok: true, status: 200, json: async () => ({ data: [] }) };
      }
      if (url.endsWith("/messages")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "chatcmpl_probe",
            choices: [{ message: { role: "assistant", content: "" } }]
          })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const capabilities = await detectProviderCapabilities({ baseURL: "http://localhost:1234/v1" }, fetchImpl);

    expect(capabilities.apis).toEqual(["openai-compatible"]);
    expect(recommendProxyMode(capabilities, "claude-code")).toBe(true);
  });

  it("detects Anthropic Messages support when /messages returns Anthropic-shaped errors", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/models")) {
        return { ok: true, status: 200, json: async () => ({ data: [] }) };
      }
      if (url.endsWith("/messages")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            type: "error",
            error: { type: "authentication_error", message: "missing key" }
          })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const capabilities = await detectProviderCapabilities({ baseURL: "https://api.anthropic.com/v1" }, fetchImpl);

    expect(capabilities.apis).toEqual(["openai-compatible", "anthropic-messages"]);
    expect(recommendProxyMode(capabilities, "claude-code")).toBe(false);
  });

  it("recommends direct mode when the provider supports the target API", () => {
    expect(
      recommendProxyMode({ baseURL: "http://local/v1", apis: ["openai-compatible"] }, "opencode")
    ).toBe(false);
    expect(recommendProxyMode({ baseURL: "http://local/v1", apis: ["openai-compatible"] }, "codex")).toBe(true);
    expect(
      recommendProxyMode({ baseURL: "http://local/v1", apis: ["openai-responses"] }, "codex")
    ).toBe(false);
    expect(
      recommendProxyMode({ baseURL: "http://local/v1", apis: ["anthropic-messages"] }, "claude-code")
    ).toBe(false);
  });

  it("generates opencode provider config without apiKey when empty", () => {
    expect(
      buildProviderConfig({
        providerId: "unsloth",
        providerName: "Unsloth Local",
        baseURL: "http://localhost:8888/v1/",
        apiKey: "",
        models: ["Qwen3.6-35B"]
      })
    ).toEqual({
      $schema: "https://opencode.ai/config.json",
      provider: {
        unsloth: {
          npm: "@ai-sdk/openai-compatible",
          name: "Unsloth Local",
          options: {
            baseURL: "http://localhost:8888/v1",
            setCacheKey: true
          },
          models: {
            "Qwen3.6-35B": { name: "Qwen3.6-35B" }
          }
        }
      }
    });
  });

  it("generates opencode provider config with apiKey when provided", () => {
    const config = buildProviderConfig({
      providerId: "cloud",
      providerName: "Cloud Gateway",
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-test",
      models: ["model-a"]
    });

    expect(config.provider.cloud.options).toEqual({
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-test",
      setCacheKey: true
    });
  });

  it("enables OpenCode cache key routing for OpenAI-compatible providers", () => {
    const config = buildProviderConfig({
      providerId: "lmstudio",
      providerName: "LM Studio",
      baseURL: "http://localhost:1234/v1",
      models: ["gemma"]
    });

    expect(config.provider.lmstudio.options.setCacheKey).toBe(true);
  });

  it("generates OpenCode provider config for the Responses API", () => {
    const config = buildProviderConfig({
      providerId: "lmstudio",
      providerName: "LM Studio",
      baseURL: "http://localhost:1234/v1",
      models: ["gemma"],
      opencodeApiType: "responses"
    });

    expect(config.provider.lmstudio).toMatchObject({
      npm: "@ai-sdk/openai",
      options: {
        baseURL: "http://localhost:1234/v1",
        setCacheKey: true
      }
    });
  });

  it("generates OpenCode provider config for the Anthropic Messages API", () => {
    const config = buildProviderConfig({
      providerId: "lmstudio",
      providerName: "LM Studio",
      baseURL: "http://localhost:1234/v1",
      models: ["gemma"],
      opencodeApiType: "messages"
    });

    expect(config.provider.lmstudio).toMatchObject({
      npm: "@ai-sdk/anthropic",
      options: {
        baseURL: "http://localhost:1234/v1"
      }
    });
    expect(config.provider.lmstudio.options).not.toHaveProperty("setCacheKey");
  });

  it("includes modalities in model config when provided", () => {
    const config = buildProviderConfig({
      providerId: "lmstudio",
      providerName: "LM Studio",
      baseURL: "http://localhost:1234/v1",
      models: ["gpt-4o", "text-only-model"],
      modelDetails: [
        { id: "gpt-4o", modalities: { input: ["text", "image"], output: ["text"] } },
        { id: "text-only-model" }
      ]
    });

    expect(config.provider.lmstudio.models["gpt-4o"]).toEqual({
      name: "gpt-4o",
      modalities: { input: ["text", "image"], output: ["text"] }
    });
    expect(config.provider.lmstudio.models["text-only-model"]).toEqual({
      name: "text-only-model"
    });
  });

  it("includes enriched model metadata in OpenCode model config", () => {
    const config = buildProviderConfig({
      providerId: "lmstudio",
      providerName: "LM Studio",
      baseURL: "http://localhost:1234/v1",
      models: ["qwen2.5-vl-7b-instruct"],
      modelDetails: [
        {
          id: "qwen2.5-vl-7b-instruct",
          modalities: { input: ["text", "image"], output: ["text"] },
          capabilities: { toolCall: true, reasoning: true },
          contextLength: 32768
        }
      ]
    });

    expect(config.provider.lmstudio.models["qwen2.5-vl-7b-instruct"]).toEqual({
      name: "qwen2.5-vl-7b-instruct",
      modalities: { input: ["text", "image"], output: ["text"] },
      tool_call: true,
      reasoning: true,
      limit: { context: 32768 }
    });
  });

  it("lets explicit model details override registry metadata in generated config", () => {
    const config = buildProviderConfig({
      providerId: "mimo-pool",
      providerName: "mimo-pool",
      baseURL: "http://127.0.0.1:3100/v1",
      models: ["mimo-v2.5-tts"],
      modelDetails: [
        {
          id: "mimo-v2.5-tts",
          modalities: { input: ["text", "audio"], output: ["audio"] },
          contextLength: 8192,
          metadataSources: ["user"]
        }
      ]
    });

    expect(config.provider["mimo-pool"].models["mimo-v2.5-tts"]).toEqual({
      name: "mimo-v2.5-tts",
      modalities: { input: ["text", "audio"], output: ["audio"] },
      limit: { context: 8192 }
    });
  });

  it("generates model config with modalities from known models", () => {
    const config = buildProviderConfig({
      providerId: "unsloth",
      providerName: "Unsloth Local",
      baseURL: "http://localhost:8888/v1",
      models: ["qwen2.5-vl-72b-instruct"],
      modelDetails: [
        { id: "qwen2.5-vl-72b-instruct", modalities: { input: ["text", "image"], output: ["text"] } }
      ]
    });

    expect(config.provider.unsloth.models["qwen2.5-vl-72b-instruct"]).toEqual({
      name: "qwen2.5-vl-72b-instruct",
      modalities: { input: ["text", "image"], output: ["text"] }
    });
  });
});
