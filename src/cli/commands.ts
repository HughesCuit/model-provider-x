import { HelpRequested, parseCliArgs, usage, type CliOptions } from "./args.js";

export type TargetId = "opencode" | "claude-code";

export type CliCommand =
  | { command: "opencode"; options: CliOptions }
  | { command: "setup"; target: TargetId; profileId?: string; port?: number; host?: string; defaultModel?: string; options: CliOptions }
  | { command: "proxy"; profileId: string; host?: string; port?: number }
  | { command: "config-print"; profileId: string };

export function parseCommand(argv: string[]): CliCommand {
  const [command, ...rest] = argv;

  if (!command || command.startsWith("--")) {
    return { command: "opencode", options: parseCliArgs(argv) };
  }

  if (command === "setup") {
    return parseSetupCommand(rest);
  }

  if (command === "proxy") {
    return parseProxyCommand(rest);
  }

  if (command === "config") {
    return parseConfigCommand(rest);
  }

  if (command === "--help" || command === "-h") {
    throw new HelpRequested();
  }

  throw new Error(`Unknown command: ${command}`);
}

export function commandUsage(): string {
  return `${usage()}
Commands:
  model-provider-x setup --target <opencode|claude-code> [options]
  model-provider-x proxy --profile <id> [--host 127.0.0.1] [--port 4141]
  model-provider-x config print --profile <id>
`;
}

function parseSetupCommand(argv: string[]): Extract<CliCommand, { command: "setup" }> {
  let target: TargetId = "opencode";
  let profileId: string | undefined;
  let port: number | undefined;
  let host: string | undefined;
  let defaultModel: string | undefined;
  const providerArgs: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--target":
        target = parseTarget(next());
        break;
      case "--profile":
        profileId = next();
        break;
      case "--port":
        port = parsePort(next());
        break;
      case "--host":
        host = next();
        break;
      case "--default-model":
        defaultModel = next();
        break;
      default:
        providerArgs.push(arg);
    }
  }

  return { command: "setup", target, profileId, port, host, defaultModel, options: parseCliArgs(providerArgs) };
}

function parseProxyCommand(argv: string[]): Extract<CliCommand, { command: "proxy" }> {
  let profileId: string | undefined;
  let host: string | undefined;
  let port: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--profile":
        profileId = next();
        break;
      case "--host":
        host = next();
        break;
      case "--port":
        port = parsePort(next());
        break;
      case "--help":
      case "-h":
        throw new HelpRequested();
      default:
        throw new Error(`Unknown proxy argument: ${arg}`);
    }
  }

  if (!profileId) {
    throw new Error("--profile is required");
  }

  return { command: "proxy", profileId, host, port };
}

function parseConfigCommand(argv: string[]): Extract<CliCommand, { command: "config-print" }> {
  const [subcommand, ...rest] = argv;
  if (subcommand !== "print") {
    throw new Error(`Unknown config command: ${subcommand ?? ""}`.trim());
  }

  let profileId: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg !== "--profile") {
      throw new Error(`Unknown config print argument: ${arg}`);
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--profile requires a value");
    }
    profileId = value;
    index += 1;
  }

  if (!profileId) {
    throw new Error("--profile is required");
  }

  return { command: "config-print", profileId };
}

function parseTarget(value: string): TargetId {
  if (value === "opencode" || value === "claude-code") {
    return value;
  }
  throw new Error(`Unknown setup target: ${value}`);
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}
