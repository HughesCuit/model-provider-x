import { describe, expect, it } from "vitest";
import { parseCliArgs, parseModelSelection } from "../src/cli/args";
import { parseCommand } from "../src/cli/commands";
import { createModelChoices } from "../src/cli/model-choices";
import { createProviderChoices, getProviderPreset } from "../src/cli/provider-presets";
import {
  moveCursor,
  renderIntro,
  renderMultiSelect,
  renderSelect,
  stripAnsi,
  toggleSelectedIndex,
  type Choice
} from "../src/cli/tui";

describe("CLI argument parsing", () => {
  it("parses non-interactive provider options", () => {
    expect(
      parseCliArgs([
        "--base-url",
        "http://localhost:8888/v1",
        "--api-key",
        "sk-test",
        "--name",
        "Unsloth Local",
        "--id",
        "unsloth",
        "--yes"
      ])
    ).toEqual({
      apiKey: "sk-test",
      baseURL: "http://localhost:8888/v1",
      configPath: undefined,
      models: undefined,
      print: false,
      providerPreset: undefined,
      proxy: undefined,
      opencodeApiType: undefined,
      providerId: "unsloth",
      providerName: "Unsloth Local",
      yes: true
    });
  });

  it("supports print-only mode", () => {
    expect(parseCliArgs(["--print", "--provider", "lmstudio", "--proxy", "--models", "qwen,gemma", "--opencode-api", "responses"])).toMatchObject({
      print: true,
      providerPreset: "lmstudio",
      proxy: true,
      models: ["qwen", "gemma"],
      opencodeApiType: "responses"
    });
  });

  it("exposes common provider presets before custom", () => {
    expect(getProviderPreset("lmstudio")).toMatchObject({
      id: "lmstudio",
      name: "LM Studio",
      baseURL: "http://localhost:1234/v1"
    });

    expect(createProviderChoices().at(-1)).toEqual({
      label: "Custom provider",
      value: "custom",
      hint: "enter URL and API key manually"
    });
  });

  it("parses setup and proxy subcommands", () => {
    expect(parseCommand(["--provider", "lmstudio"])).toMatchObject({
      command: "setup",
      target: undefined,
      options: { providerPreset: "lmstudio" }
    });

    expect(parseCommand(["setup", "--target", "claude-code", "--profile", "local", "--port", "4141"])).toMatchObject({
      command: "setup",
      target: "claude-code",
      profileId: "local",
      port: 4141
    });

    expect(parseCommand(["setup", "--provider", "lmstudio"])).toMatchObject({
      command: "setup",
      target: undefined,
      options: { providerPreset: "lmstudio" }
    });

    expect(parseCommand(["setup", "--target", "codex", "--provider", "lmstudio"])).toMatchObject({
      command: "setup",
      target: "codex",
      options: { providerPreset: "lmstudio" }
    });

    expect(parseCommand(["proxy", "--profile", "local", "--host", "127.0.0.1", "--port", "4141"])).toEqual({
      command: "proxy",
      action: "run",
      profileId: "local",
      host: "127.0.0.1",
      port: 4141
    });

    expect(parseCommand(["proxy", "up", "--profile", "local"])).toMatchObject({
      command: "proxy",
      action: "up",
      profileId: "local"
    });
    expect(parseCommand(["proxy", "down"])).toEqual({ command: "proxy", action: "down", profileId: undefined, host: undefined, port: undefined });
    expect(parseCommand(["proxy", "status"])).toEqual({ command: "proxy", action: "status", profileId: undefined, host: undefined, port: undefined });
    expect(parseCommand(["proxy", "token"])).toEqual({ command: "proxy", action: "token", profileId: undefined, host: undefined, port: undefined });
    expect(parseCommand(["config", "api-key", "--profile", "local"])).toEqual({
      command: "config-api-key",
      profileId: "local"
    });
  });

  it("selects all models by default and parses numeric ranges", () => {
    const models = ["qwen", "gemma", "gpt-oss"];

    expect(parseModelSelection("", models)).toEqual(models);
    expect(parseModelSelection("1,3", models)).toEqual(["qwen", "gpt-oss"]);
    expect(parseModelSelection("2-3", models)).toEqual(["gemma", "gpt-oss"]);
  });

  it("marks likely unsupported model names as unchecked by default", () => {
    const choices = createModelChoices(["qwen3.6-35b", "nomic-embed-text", "text-embedding-bge"]);

    expect(choices).toEqual([
      { label: "qwen3.6-35b", value: "qwen3.6-35b", selected: true },
      {
        label: "nomic-embed-text",
        value: "nomic-embed-text",
        hint: "suspected unsupported model",
        selected: false
      },
      {
        label: "text-embedding-bge",
        value: "text-embedding-bge",
        hint: "suspected unsupported model",
        selected: false
      }
    ]);
  });

  it("renders a single-choice TUI menu with the active cursor", () => {
    const choices: Choice[] = [
      { label: "Write config", value: "write" },
      { label: "Print JSON", value: "print", hint: "safe fallback" }
    ];

    const frame = stripAnsi(renderSelect("Next action", choices, 1));

    expect(frame).toContain("+------------------------------------------------------------+");
    expect(frame).toContain("| model-provider-x");
    expect(frame).toContain("> 2. Print JSON - safe fallback");
  });

  it("renders selected multi-choice items and toggles selection state", () => {
    const choices: Choice[] = [
      { label: "qwen", value: "qwen" },
      { label: "gemma", value: "gemma" }
    ];
    const selected = toggleSelectedIndex(new Set([0]), 1);

    expect([...selected]).toEqual([0, 1]);
    const frame = stripAnsi(renderMultiSelect("Models", choices, 0, selected));

    expect(frame).toContain("[x] 1. qwen");
    expect(frame).toContain("Selected: 2/2");
  });

  it("renders a polished intro panel", () => {
    const frame = stripAnsi(renderIntro());

    expect(frame).toContain("model-provider-x");
    expect(frame).toContain("OpenAI-compatible provider setup");
    expect(frame).toContain("Validates /models, generates JSON,");
    expect(frame).toContain("and can write opencode.jsonc.");
  });

  it("wraps cursor movement at menu boundaries", () => {
    expect(moveCursor(0, -1, 3)).toBe(2);
    expect(moveCursor(2, 1, 3)).toBe(0);
  });
});
