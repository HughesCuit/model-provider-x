#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { getDefaultToolConfigPath, readToolConfig, upsertProviderProfile } from "../core/tool-config.js";
import { discoverOpenCodeConfigs, getDefaultConfigPath, writeProviderToConfig } from "../core/config.js";
import { buildProviderConfig, validateAndFetchModels } from "../core/provider.js";
import type { DiscoveredConfig } from "../shared/types.js";
import { startProxyServer } from "../proxy/server.js";
import { getDefaultClaudeSettingsPath, writeClaudeCodeSettings } from "../targets/claude-code.js";
import { HelpRequested, parseModelSelection, type CliOptions } from "./args.js";
import { commandUsage, parseCommand, type CliCommand, type TargetId } from "./commands.js";
import { canUseTui, multiSelectChoices, renderIntro, selectChoice, type Choice } from "./tui.js";

async function main() {
  try {
    const command = parseCommand(process.argv.slice(2));
    await runCommand(command);
  } catch (error) {
    if (error instanceof HelpRequested) {
      console.log(commandUsage());
      return;
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export async function runCommand(command: CliCommand) {
  if (command.command === "opencode") {
    await runCli(command.options);
    return;
  }

  if (command.command === "setup") {
    await runSetup(command);
    return;
  }

  if (command.command === "config-print") {
    const config = await readToolConfig();
    const profile = config.profiles[command.profileId];
    if (!profile) {
      throw new Error(`Unknown provider profile: ${command.profileId}`);
    }
    output.write(`${JSON.stringify(profile, null, 2)}\n`);
    return;
  }

  const config = await readToolConfig();
  const server = await startProxyServer({
    profileId: command.profileId,
    config,
    host: command.host,
    port: command.port
  });
  output.write(`model-provider-x proxy listening at ${server.baseURL}\n`);
  await new Promise<void>((resolve) => {
    const stop = async () => {
      await server.close();
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

export async function runCli(options: CliOptions) {
  const rl = createInterface({ input, output });
  try {
    output.write(canUseTui() ? renderIntro() : "model-provider-x\n\n");
    const providerName = await requiredOption(rl, options.providerName, "Provider name");
    const providerId = await requiredOption(rl, options.providerId ?? slugify(providerName), "Provider id");
    const baseURL = await requiredOption(rl, options.baseURL, "API base URL");
    const apiKey = options.apiKey ?? (await rl.question("API key (optional): "));

    output.write("Fetching models...\n");
    const fetched = await validateAndFetchModels({ baseURL, apiKey });
    const selectedModels =
      options.models ??
      (canUseTui()
        ? await multiSelectChoices(
            "Select models",
            fetched.models.map((model) => ({ label: model, value: model }))
          )
        : parseModelSelection(await rl.question(formatModelPrompt(fetched.models)), fetched.models));

    const fragment = buildProviderConfig({
      providerId,
      providerName,
      baseURL: fetched.baseURL,
      apiKey,
      models: selectedModels
    });
    const provider = fragment.provider[providerId];
    const json = JSON.stringify(fragment, null, 2);

    if (options.print) {
      output.write(`${json}\n`);
      return;
    }

    const targetPath = options.configPath ?? (await chooseConfigPath(rl, providerId, options.yes));
    if (!targetPath) {
      output.write(`${json}\n`);
      return;
    }

    if (apiKey.trim()) {
      output.write("Warning: the API key will be written to the selected OpenCode config.\n");
    }

    const result = await writeProviderToConfig({ targetPath, providerId, provider });
    output.write(`Updated ${result.targetPath}\n`);
    if (result.backupPath) {
      output.write(`Backup: ${result.backupPath}\n`);
    }
  } finally {
    rl.close();
  }
}

async function runSetup(command: Extract<CliCommand, { command: "setup" }>) {
  if (command.target === "opencode") {
    await runCli(command.options);
    return;
  }

  await runClaudeCodeSetup(command);
}

async function runClaudeCodeSetup(command: Extract<CliCommand, { command: "setup"; target: TargetId }>) {
  const rl = createInterface({ input, output });
  try {
    output.write(canUseTui() ? renderIntro() : "model-provider-x\n\n");
    const providerName = await requiredOption(rl, command.options.providerName, "Provider name");
    const providerId = await requiredOption(rl, command.profileId ?? command.options.providerId ?? slugify(providerName), "Provider id");
    const baseURL = await requiredOption(rl, command.options.baseURL, "API base URL");
    const apiKey = command.options.apiKey ?? (await rl.question("Upstream API key (optional): "));

    output.write("Fetching models...\n");
    const fetched = await validateAndFetchModels({ baseURL, apiKey });
    const selectedModels =
      command.options.models ??
      (canUseTui()
        ? await multiSelectChoices(
            "Select Claude Code gateway models",
            fetched.models.map((model) => ({ label: model, value: model }))
          )
        : parseModelSelection(await rl.question(formatModelPrompt(fetched.models)), fetched.models));

    const toolConfigPath = getDefaultToolConfigPath();
    const config = await upsertProviderProfile(
      toolConfigPath,
      {
        id: providerId,
        name: providerName,
        baseURL: fetched.baseURL,
        apiKey: apiKey.trim() || undefined,
        models: selectedModels
      },
      {
        host: command.host,
        port: command.port
      }
    );

    const proxyBaseURL = `http://${config.proxy.host}:${config.proxy.port}`;
    const result = await writeClaudeCodeSettings({
      targetPath: getDefaultClaudeSettingsPath(),
      proxy: {
        baseURL: proxyBaseURL,
        authToken: config.proxy.authToken,
        enableModelDiscovery: true,
        defaultModel: command.defaultModel
      }
    });

    output.write(`Saved profile ${providerId} to ${toolConfigPath}\n`);
    output.write(`Updated Claude Code settings: ${result.targetPath}\n`);
    if (result.backupPath) {
      output.write(`Backup: ${result.backupPath}\n`);
    }
    output.write(`Run proxy: model-provider-x proxy --profile ${providerId}\n`);
  } finally {
    rl.close();
  }
}

async function requiredOption(
  rl: ReturnType<typeof createInterface>,
  value: string | undefined,
  label: string
): Promise<string> {
  const answer = value ?? (await rl.question(`${label}: `));
  if (!answer.trim()) {
    throw new Error(`${label} is required`);
  }
  return answer.trim();
}

async function chooseConfigPath(
  rl: ReturnType<typeof createInterface>,
  providerId: string,
  yes: boolean
): Promise<string | undefined> {
  const configs = await discoverOpenCodeConfigs({ providerId });
  if (configs.length === 0) {
    const defaultPath = getDefaultConfigPath();
    if (yes) {
      return defaultPath;
    }

    if (canUseTui()) {
      return selectChoice("No OpenCode config found", [
        { label: `Create ${defaultPath}`, value: defaultPath },
        { label: "Print JSON only", value: undefined, hint: "copy it manually" }
      ]);
    }

    const answer = await rl.question(`No OpenCode config found. Create ${defaultPath}? [Y/n/print] `);
    if (!answer.trim() || answer.trim().toLowerCase() === "y") {
      return defaultPath;
    }
    return undefined;
  }

  output.write("OpenCode configs:\n");
  configs.forEach((config, index) => {
    output.write(`${index + 1}. ${describeConfig(config)}\n`);
  });

  if (yes) {
    return configs.find((config) => config.writable)?.path;
  }

  if (canUseTui()) {
    return selectChoice("Choose install target", [
      ...configs.map(
        (config): Choice<string> => ({
          label: config.label,
          value: config.path,
          hint: `${config.path}${config.hasProvider ? " (provider exists)" : ""}`,
          disabled: !config.writable
        })
      ),
      { label: "Print JSON only", value: undefined, hint: "copy it manually" }
    ]);
  }

  const answer = await rl.question("Choose config number, enter a path, or type print: ");
  if (answer.trim().toLowerCase() === "print") {
    return undefined;
  }

  const index = Number(answer.trim());
  if (Number.isInteger(index) && configs[index - 1]) {
    return configs[index - 1].path;
  }

  if (answer.trim()) {
    return answer.trim();
  }

  return configs.find((config) => config.writable)?.path;
}

function describeConfig(config: DiscoveredConfig): string {
  const flags = [config.writable ? "writable" : "read-only", config.hasProvider ? "provider exists" : undefined]
    .filter(Boolean)
    .join(", ");
  return `${config.label} - ${config.path} (${flags})`;
}

function formatModelPrompt(models: string[]): string {
  const lines = models.map((model, index) => `${index + 1}. ${model}`).join("\n");
  return `Models:\n${lines}\nSelect models by number, range, name, comma list, or press Enter for all: `;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

void main();
