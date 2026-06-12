import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  loadModelRegistryFile,
  resolveModelRegistryMetadata
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
});
