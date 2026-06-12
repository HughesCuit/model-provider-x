import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  loadModelRegistryFile,
  resolveModelRegistryMetadata,
  modelAliases
} from "../src/core/model-registry";

describe("model registry", () => {
  it("resolves built-in models.dev-shaped metadata by provider and model id", async () => {
    const metadata = await resolveModelRegistryMetadata({
      providerId: "openai",
      modelId: "openai/gpt-oss-20b"
    });

    expect(metadata).toMatchObject({
      id: "gpt-oss-20b",
      type: "llm",
      contextLength: 128000,
      capabilities: {
        reasoning: true,
        toolCall: true
      },
      metadataSources: expect.arrayContaining(["models.dev"])
    });
  });

  it("loads local JSONC registry overrides for private providers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "model-provider-x-registry-"));
    const registryPath = join(dir, "model-provider-x.models.jsonc");
    await writeFile(
      registryPath,
      `{
        // Local mimo-pool metadata.
        "providers": {
          "mimo-pool": {
            "models": {
              "mimo-v2.5-tts": {
                "type": "tts",
                "modalities": {
                  "input": ["text"],
                  "output": ["audio"]
                },
                "capabilities": {
                  "tool_call": false,
                  "reasoning": false
                },
                "limit": {
                  "context": 8192
                }
              }
            }
          }
        }
      }`,
      "utf8"
    );

    const registry = await loadModelRegistryFile(registryPath);
    const metadata = await resolveModelRegistryMetadata({
      providerId: "mimo-pool",
      modelId: "mimo-v2.5-tts",
      registries: [registry]
    });

    expect(metadata).toMatchObject({
      id: "mimo-v2.5-tts",
      type: "tts",
      modalities: { input: ["text"], output: ["audio"] },
      contextLength: 8192,
      metadataSources: expect.arrayContaining(["local-registry"])
    });
  });

  it("supports global model entries as a fallback", async () => {
    const metadata = await resolveModelRegistryMetadata({
      providerId: "private",
      modelId: "mimo-v2.5-asr",
      registries: [
        {
          source: "project-registry",
          models: {
            "mimo-v2.5-asr": {
              modalities: { input: ["audio"], output: ["text"] }
            }
          }
        }
      ]
    });

    expect(metadata).toMatchObject({
      id: "mimo-v2.5-asr",
      modalities: { input: ["audio"], output: ["text"] },
      metadataSources: ["project-registry"]
    });
  });

  describe("modelAliases", () => {
    it("strips provider prefix", () => {
      const aliases = modelAliases("openai/gpt-4o");
      expect(aliases).toContain("gpt-4o");
    });

    it("strips single suffix", () => {
      const aliases = modelAliases("llama-3-70b-instruct");
      expect(aliases).toContain("llama-3-70b");
      expect(aliases).toContain("llama-3");
    });

    it("strips multiple suffixes iteratively", () => {
      const aliases = modelAliases("llama-3-70b-instruct-gguf");
      expect(aliases).toContain("llama-3-70b");
      expect(aliases).toContain("llama-3");
    });

    it("handles decimal parameter sizes", () => {
      const aliases = modelAliases("qwen3-1.5b-instruct");
      expect(aliases).toContain("qwen3-1.5b");
      expect(aliases).toContain("qwen3");
    });

    it("handles version suffixes", () => {
      const aliases = modelAliases("gemini-2.0-flash-v2");
      expect(aliases).toContain("gemini-2.0-flash");
    });

    it("handles size variants", () => {
      const aliases = modelAliases("gpt-4o-mini");
      expect(aliases).toContain("gpt-4o");
    });

    it("handles case insensitivity", () => {
      const aliases = modelAliases("GPT-4O-INSTRUCT");
      expect(aliases).toContain("gpt-4o");
    });

    it("removes duplicates", () => {
      const aliases = modelAliases("gpt-4o");
      const uniqueAliases = [...new Set(aliases)];
      expect(aliases.length).toBe(uniqueAliases.length);
    });
  });
});
