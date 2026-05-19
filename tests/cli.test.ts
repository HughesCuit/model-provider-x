import { describe, expect, it } from "vitest";
import { parseCliArgs, parseModelSelection } from "../src/cli/args";
import { parseCommand } from "../src/cli/commands";
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
      providerId: "unsloth",
      providerName: "Unsloth Local",
      yes: true
    });
  });

  it("supports print-only mode", () => {
    expect(parseCliArgs(["--print", "--models", "qwen,gemma"])).toMatchObject({
      print: true,
      models: ["qwen", "gemma"]
    });
  });

  it("parses setup and proxy subcommands", () => {
    expect(parseCommand(["setup", "--target", "claude-code", "--profile", "local", "--port", "4141"])).toMatchObject({
      command: "setup",
      target: "claude-code",
      profileId: "local",
      port: 4141
    });

    expect(parseCommand(["proxy", "--profile", "local", "--host", "127.0.0.1", "--port", "4141"])).toEqual({
      command: "proxy",
      profileId: "local",
      host: "127.0.0.1",
      port: 4141
    });
  });

  it("selects all models by default and parses numeric ranges", () => {
    const models = ["qwen", "gemma", "gpt-oss"];

    expect(parseModelSelection("", models)).toEqual(models);
    expect(parseModelSelection("1,3", models)).toEqual(["qwen", "gpt-oss"]);
    expect(parseModelSelection("2-3", models)).toEqual(["gemma", "gpt-oss"]);
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
