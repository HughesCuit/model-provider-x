import { describe, expect, it } from "vitest";
import {
  lookupModelCapabilities,
  parseCapabilitiesFromApi,
  mergeModelCapabilities,
  isKnownModel,
  parseModalitiesFromString
} from "../src/core/model-capabilities";

describe("model capabilities", () => {
  describe("lookupModelCapabilities", () => {
    it("returns capabilities for known vision models", () => {
      expect(lookupModelCapabilities("gpt-4o")).toEqual({
        input: ["text", "image"],
        output: ["text"]
      });
    });

    it("returns capabilities for claude vision models", () => {
      expect(lookupModelCapabilities("claude-3.5-sonnet")).toEqual({
        input: ["text", "image"],
        output: ["text"]
      });
    });

    it("returns capabilities for gemini multimodal models", () => {
      const caps = lookupModelCapabilities("gemini-1.5-pro");
      expect(caps?.input).toContain("image");
      expect(caps?.input).toContain("audio");
      expect(caps?.input).toContain("video");
    });

    it("handles model ids with provider prefix", () => {
      expect(lookupModelCapabilities("openai/gpt-4o")).toEqual({
        input: ["text", "image"],
        output: ["text"]
      });
    });

    it("returns undefined for unknown text-only models", () => {
      expect(lookupModelCapabilities("unknown-model-123")).toBeUndefined();
    });

    it("detects vision capability from keyword", () => {
      expect(lookupModelCapabilities("my-custom-vl-model")).toEqual({
        input: ["text", "image"],
        output: ["text"]
      });
    });

    it("detects vision capability from 'vision' keyword", () => {
      expect(lookupModelCapabilities("llama-3.2-vision")).toEqual({
        input: ["text", "image"],
        output: ["text"]
      });
    });

    it("handles case-insensitive matching", () => {
      expect(lookupModelCapabilities("GPT-4O")).toEqual({
        input: ["text", "image"],
        output: ["text"]
      });
    });
  });

  describe("parseCapabilitiesFromApi", () => {
    it("parses modalities from API response", () => {
      const result = parseCapabilitiesFromApi({
        modalities: {
          input: ["text", "image"],
          output: ["text"]
        }
      });
      expect(result).toEqual({
        input: ["text", "image"],
        output: ["text"]
      });
    });

    it("parses capabilities object", () => {
      const result = parseCapabilitiesFromApi({
        capabilities: {
          vision: true
        }
      });
      expect(result).toEqual({
        input: ["text", "image"],
        output: ["text"]
      });
    });

    it("returns undefined when no capabilities found", () => {
      expect(parseCapabilitiesFromApi({})).toBeUndefined();
    });
  });

  describe("mergeModelCapabilities", () => {
    it("prefers user overrides over all", () => {
      const result = mergeModelCapabilities(
        "gpt-4o",
        { input: ["text"], output: ["text"] },
        { input: ["text", "image", "pdf"], output: ["text"] }
      );
      expect(result).toEqual({
        input: ["text", "image", "pdf"],
        output: ["text"]
      });
    });

    it("uses API capabilities when no user override", () => {
      const result = mergeModelCapabilities(
        "custom-model",
        { input: ["text", "image"], output: ["text"] }
      );
      expect(result).toEqual({
        input: ["text", "image"],
        output: ["text"]
      });
    });

    it("falls back to lookup table", () => {
      const result = mergeModelCapabilities("gpt-4o");
      expect(result).toEqual({
        input: ["text", "image"],
        output: ["text"]
      });
    });

    it("returns undefined for unknown models without API data", () => {
      expect(mergeModelCapabilities("unknown-model")).toBeUndefined();
    });
  });

  describe("isKnownModel", () => {
    it("returns true for known vision models", () => {
      expect(isKnownModel("gpt-4o")).toBe(true);
    });

    it("returns true for models with vision keywords", () => {
      expect(isKnownModel("custom-vl-model")).toBe(true);
    });

    it("returns false for unknown models", () => {
      expect(isKnownModel("unknown-model-123")).toBe(false);
    });
  });

  describe("parseModalitiesFromString", () => {
    it("parses valid modality string", () => {
      expect(parseModalitiesFromString("text,image:text")).toEqual({
        input: ["text", "image"],
        output: ["text"]
      });
    });

    it("throws on invalid format", () => {
      expect(() => parseModalitiesFromString("invalid")).toThrow();
    });

    it("throws on unknown modality", () => {
      expect(() => parseModalitiesFromString("text,unknown:text")).toThrow();
    });
  });
});
