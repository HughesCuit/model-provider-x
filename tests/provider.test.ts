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
    expect(result).toEqual({ baseURL: "http://localhost:8888/v1", models: ["qwen3.6-35b", "gemma-4-e2b"] });
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
});
