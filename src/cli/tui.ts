import { emitKeypressEvents } from "node:readline";
import type { ReadStream, WriteStream } from "node:tty";

export interface Choice<T = string> {
  label: string;
  value: T;
  hint?: string;
  disabled?: boolean;
  selected?: boolean;
}

const width = 60;
const border = `+${"-".repeat(width)}+`;

export function renderSelect<T>(title: string, choices: Choice<T>[], cursor: number): string {
  return renderFrame(
    title,
    choices.map((choice, index) => renderChoiceLine(choice, index, index === cursor)),
    "Use Up/Down or j/k. Press Enter to confirm."
  );
}

export function renderMultiSelect<T>(title: string, choices: Choice<T>[], cursor: number, selected: Set<number>): string {
  return renderFrame(
    title,
    choices.map((choice, index) => renderChoiceLine(choice, index, index === cursor, selected.has(index))),
    `Selected: ${selected.size}/${choices.filter((choice) => !choice.disabled).length}  |  Space toggles. a selects all. Enter confirms.`
  );
}

export function renderIntro(): string {
  return [
    border,
    boxLine(color("model-provider-x", "cyan")),
    boxLine(color("OpenAI-compatible provider setup", "muted")),
    boxLine(""),
    boxLine("Validates /models, generates JSON,"),
    boxLine("and can write opencode.jsonc."),
    boxLine("API keys are only written when you provide one."),
    border,
    ""
  ].join("\n");
}

export function moveCursor(cursor: number, delta: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return (cursor + delta + length) % length;
}

export function toggleSelectedIndex(selected: Set<number>, index: number): Set<number> {
  const next = new Set(selected);
  if (next.has(index)) {
    next.delete(index);
  } else {
    next.add(index);
  }
  return next;
}

export async function selectChoice<T>(
  title: string,
  choices: Choice<T>[],
  streams: { input: NodeJS.ReadStream; output: NodeJS.WriteStream } = { input: process.stdin, output: process.stdout }
): Promise<T> {
  const enabledChoices = choices.filter((choice) => !choice.disabled);
  if (enabledChoices.length === 0) {
    throw new Error("No selectable choices are available");
  }

  const selected = await runKeyMenu(
    (cursor) => renderSelect(title, choices, cursor),
    choices,
    streams,
    () => undefined
  );
  return selected.value;
}

export async function multiSelectChoices<T>(
  title: string,
  choices: Choice<T>[],
  streams: { input: NodeJS.ReadStream; output: NodeJS.WriteStream } = { input: process.stdin, output: process.stdout }
): Promise<T[]> {
  let selected = new Set(
    choices
      .map((choice, index) => (choice.disabled || choice.selected === false ? -1 : index))
      .filter((index) => index >= 0)
  );
  const choice = await runKeyMenu(
    (cursor) => renderMultiSelect(title, choices, cursor, selected),
    choices,
    streams,
    (key, cursor) => {
      if (key.name === "space") {
        selected = toggleSelectedIndex(selected, cursor);
      }
      if (key.name === "a") {
        selected =
          selected.size === choices.filter((item) => !item.disabled).length
            ? new Set()
            : new Set(choices.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0));
      }
    }
  );

  if (choice && selected.size === 0) {
    throw new Error("Select at least one item");
  }

  return choices.filter((_choice, index) => selected.has(index)).map((item) => item.value);
}

export function canUseTui(input: NodeJS.ReadStream = process.stdin, output: NodeJS.WriteStream = process.stdout): boolean {
  return Boolean(input.isTTY && output.isTTY && typeof input.setRawMode === "function");
}

async function runKeyMenu<T>(
  render: (cursor: number) => string,
  choices: Choice<T>[],
  streams: { input: NodeJS.ReadStream; output: NodeJS.WriteStream },
  onKey: (key: { name?: string; ctrl?: boolean }, cursor: number) => void
): Promise<Choice<T>> {
  const input = streams.input as ReadStream;
  const output = streams.output as WriteStream;
  let cursor = firstEnabledIndex(choices);

  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.setRawMode(false);
      input.off("keypress", handleKeypress);
      output.write("\n");
    };

    const draw = () => {
      output.write("\x1b[2J\x1b[H");
      output.write(render(cursor));
    };

    const handleKeypress = (_chunk: string, key: { name?: string; ctrl?: boolean }) => {
      try {
        if (key.ctrl && key.name === "c") {
          cleanup();
          reject(new Error("Cancelled"));
          return;
        }

        if (key.name === "up" || key.name === "k") {
          cursor = nextEnabledIndex(choices, cursor, -1);
        } else if (key.name === "down" || key.name === "j") {
          cursor = nextEnabledIndex(choices, cursor, 1);
        } else if (key.name === "return") {
          cleanup();
          resolve(choices[cursor]);
          return;
        } else {
          onKey(key, cursor);
        }

        draw();
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    input.on("keypress", handleKeypress);
    draw();
  });
}

function renderFrame(title: string, lines: string[], footer: string): string {
  return [
    border,
    boxLine(color("model-provider-x", "cyan")),
    boxLine(color(title, "bold")),
    border,
    ...lines.map((line) => boxLine(line)),
    border,
    boxLine(color(footer, "muted")),
    border,
    ""
  ].join("\n");
}

function renderChoiceLine<T>(choice: Choice<T>, index: number, active: boolean, selected?: boolean): string {
  const cursor = active ? color(">", "cyan") : " ";
  const mark = selected === undefined ? "" : `${selected ? color("[x]", "green") : "[ ]"} `;
  const ordinal = `${index + 1}.`;
  const hint = choice.hint ? ` - ${choice.hint}` : "";
  const disabled = choice.disabled ? " (unavailable)" : "";
  const label = choice.disabled ? color(choice.label, "muted") : choice.label;
  return `${cursor} ${mark}${ordinal} ${label}${color(hint, "muted")}${color(disabled, "muted")}`;
}

function firstEnabledIndex<T>(choices: Choice<T>[]): number {
  const index = choices.findIndex((choice) => !choice.disabled);
  if (index === -1) {
    throw new Error("No selectable choices are available");
  }
  return index;
}

function nextEnabledIndex<T>(choices: Choice<T>[], cursor: number, delta: number): number {
  let next = cursor;
  do {
    next = moveCursor(next, delta, choices.length);
  } while (choices[next].disabled);
  return next;
}

export function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
}

function boxLine(value: string): string {
  const visible = stripAnsi(value);
  const trimmed = visible.length > width - 2 ? truncateAnsi(value, width - 5) : value;
  const padding = width - stripAnsi(trimmed).length - 1;
  return `| ${trimmed}${" ".repeat(Math.max(0, padding))}|`;
}

function truncateAnsi(value: string, maxVisible: number): string {
  const plain = stripAnsi(value);
  return `${plain.slice(0, maxVisible)}...`;
}

function color(value: string, tone: "bold" | "cyan" | "green" | "muted"): string {
  if (process.env.NO_COLOR) {
    return value;
  }

  const codes = {
    bold: ["\x1b[1m", "\x1b[22m"],
    cyan: ["\x1b[36m", "\x1b[39m"],
    green: ["\x1b[32m", "\x1b[39m"],
    muted: ["\x1b[2m", "\x1b[22m"]
  } as const;
  const [open, close] = codes[tone];
  return `${open}${value}${close}`;
}
