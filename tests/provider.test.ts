import { describe, expect, it, vi } from "vitest";
import { buildProviderConfig, normalizeBaseUrl, validateAndFetchModels } from "../src/core/provider";

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
            baseURL: "http://localhost:8888/v1"
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
      apiKey: "sk-test"
    });
  });
});
