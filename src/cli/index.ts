#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { readProxyStatus, startProxyProcess, stopProxyProcess } from "../core/proxy-process.js";
import { createProxyAuthToken, getDefaultToolConfigPath, readToolConfig, upsertProviderProfile, writeToolConfig } from "../core/tool-config.js";
import { discoverOpenCodeConfigs, getDefaultConfigPath, writeProviderToConfig } from "../core/config.js";
import { buildProviderConfig, detectProviderCapabilities, recommendProxyMode, validateAndFetchModels, type ProviderApiKind, type ProviderCapabilities } from "../core/provider.js";
import type { DiscoveredConfig, OpenCodeApiType, ModelInfo, ModelModalities } from "../shared/types.js";
import { isKnownModel } from "../core/model-capabilities.js";
import { startProxyServer } from "../proxy/server.js";
import { defaultClaudeModelMapping, getDefaultClaudeSettingsPath, writeClaudeCodeSettings, type ClaudeModelMapping } from "../targets/claude-code.js";
import { getDefaultCodexConfigPath, writeCodexConfig } from "../targets/codex.js";
import { HelpRequested, parseModelSelection, type CliOptions } from "./args.js";
import { commandUsage, parseCommand, type CliCommand, type TargetId } from "./commands.js";
import { createModelChoices } from "./model-choices.js";
import { createProviderChoices, getProviderPreset, type ProviderPreset } from "./provider-presets.js";
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
    if (command.options.print) {
      await runCli(command.options);
      return;
    }
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

  if (command.command === "config-api-key") {
    const config = await readToolConfig();
    const profile = config.profiles[command.profileId];
    if (!profile?.apiKey) {
      throw new Error(`No API key stored for provider profile: ${command.profileId}`);
    }
    output.write(`${profile.apiKey}\n`);
    return;
  }

  await runProxyCommand(command);
}

export async function runCli(options: CliOptions) {
  const rl = createInterface({ input, output });
  try {
    output.write(canUseTui() ? renderIntro() : "model-provider-x\n\n");
    const providerDefaults = await resolveProviderDefaults(rl, options);
    const providerName = await requiredOption(rl, options.providerName ?? providerDefaults.name, "Provider name");
    const providerId = await requiredOption(rl, options.providerId ?? providerDefaults.id ?? slugify(providerName), "Provider id");
    const baseURL = await requiredOption(rl, options.baseURL ?? providerDefaults.baseURL, "API base URL");
    const apiKey = await resolveApiKey(rl, options.apiKey, providerDefaults.preset);

    output.write("Fetching models...\n");
    const fetched = await validateAndFetchModels({ baseURL, apiKey });
    const selectedModels =
      options.models ??
      (canUseTui()
        ? await multiSelectChoices(
            "Select models",
            createModelChoices(fetched.models)
          )
        : parseModelSelection(await rl.question(formatModelPrompt(fetched.models)), fetched.models));

    const modelDetails = fetched.modelDetails.filter((m) => selectedModels.includes(m.id));
    const fragment = buildProviderConfig({
      providerId,
      providerName,
      baseURL: fetched.baseURL,
      apiKey,
      models: selectedModels,
      modelDetails,
      opencodeApiType: options.opencodeApiType ?? "chat"
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
  const rl = createInterface({ input, output });
  try {
    output.write(canUseTui() ? renderIntro() : "model-provider-x\n\n");
    const providerInput = await collectProviderInput(rl, command);
    output.write("Detecting provider capabilities...\n");
    const capabilities = await detectProviderCapabilities({ baseURL: providerInput.baseURL, apiKey: providerInput.apiKey });
    const selection = await collectProviderSelection(rl, command, providerInput);
    const target = await resolveSetupTarget(rl, command.target);
    const useProxy = await resolveProxyMode(rl, command.options, capabilities, target);

    if (target === "opencode") {
      await writeOpenCodeSetup(rl, command, selection, useProxy, capabilities);
      return;
    }

    if (target === "codex") {
      await writeCodexSetup(rl, command, selection, useProxy);
      return;
    }

    await writeClaudeCodeSetup(rl, command, selection, useProxy);
  } finally {
    rl.close();
  }
}

interface ProviderSelection {
  providerId: string;
  providerName: string;
  upstreamBaseURL: string;
  apiKey: string;
  selectedModels: string[];
  modelDetails: ModelInfo[];
  defaultModel: string;
  config: Awaited<ReturnType<typeof upsertProviderProfile>>;
  toolConfigPath: string;
}

interface ProviderInput {
  providerId: string;
  providerName: string;
  baseURL: string;
  apiKey: string;
}

async function collectProviderInput(
  rl: ReturnType<typeof createInterface>,
  command: Extract<CliCommand, { command: "setup" }>
): Promise<ProviderInput> {
  const providerDefaults = await resolveProviderDefaults(rl, command.options);
  const providerName = await requiredOption(rl, command.options.providerName ?? providerDefaults.name, "Provider name");
  const providerId = await requiredOption(
    rl,
    command.profileId ?? command.options.providerId ?? providerDefaults.id ?? slugify(providerName),
    "Provider id"
  );
  const baseURL = await requiredOption(rl, command.options.baseURL ?? providerDefaults.baseURL, "API base URL");
  const apiKey = await resolveApiKey(rl, command.options.apiKey, providerDefaults.preset, "Upstream API key");

  return { providerId, providerName, baseURL, apiKey };
}

async function collectProviderSelection(
  rl: ReturnType<typeof createInterface>,
  command: Extract<CliCommand, { command: "setup" }>,
  providerInput: ProviderInput
): Promise<ProviderSelection> {
  output.write("Fetching models...\n");
  const fetched = await validateAndFetchModels({ baseURL: providerInput.baseURL, apiKey: providerInput.apiKey });
  const selectedModels =
    command.options.models ??
    (canUseTui()
      ? await multiSelectChoices("Select models", createModelChoices(fetched.models))
      : parseModelSelection(await rl.question(formatModelPrompt(fetched.models)), fetched.models));
  const defaultModel = await resolveDefaultModel(rl, command, selectedModels);
  if (!defaultModel) {
    throw new Error("Select at least one model");
  }

  const modelDetails = await resolveModelModalities(rl, command, selectedModels, fetched.modelDetails);

  const toolConfigPath = getDefaultToolConfigPath();
  const config = await upsertProviderProfile(
    toolConfigPath,
    {
      id: providerInput.providerId,
      name: providerInput.providerName,
      baseURL: fetched.baseURL,
      apiKey: providerInput.apiKey.trim() || undefined,
      models: selectedModels
    },
    {
      host: command.host,
      port: command.port
    }
  );

  return {
    providerId: providerInput.providerId,
    providerName: providerInput.providerName,
    upstreamBaseURL: fetched.baseURL,
    apiKey: providerInput.apiKey,
    selectedModels,
    modelDetails,
    defaultModel,
    config,
    toolConfigPath
  };
}

async function writeOpenCodeSetup(
  rl: ReturnType<typeof createInterface>,
  command: Extract<CliCommand, { command: "setup" }>,
  selection: ProviderSelection,
  useProxy: boolean,
  capabilities: ProviderCapabilities
) {
  if (useProxy) {
    await ensureProxyAuthToken(rl, command, selection);
  }

  const baseURL = useProxy ? `http://${selection.config.proxy.host}:${selection.config.proxy.port}/v1` : selection.upstreamBaseURL;
  const apiKey = useProxy ? selection.config.proxy.authToken : selection.apiKey;
  const opencodeApiType = await resolveOpenCodeApiType(rl, command, capabilities, useProxy);
  const fragment = buildProviderConfig({
    providerId: selection.providerId,
    providerName: selection.providerName,
    baseURL,
    apiKey,
    models: selection.selectedModels,
    modelDetails: selection.modelDetails,
    opencodeApiType
  });
  const provider = fragment.provider[selection.providerId];
  const targetPath = command.options.configPath ?? (await chooseConfigPath(rl, selection.providerId, command.options.yes));
  if (!targetPath) {
    output.write(`${JSON.stringify(fragment, null, 2)}\n`);
    return;
  }

  const result = await writeProviderToConfig({ targetPath, providerId: selection.providerId, provider });
  output.write(`Saved profile ${selection.providerId} to ${selection.toolConfigPath}\n`);
  output.write(`Updated ${result.targetPath}\n`);
  if (result.backupPath) {
    output.write(`Backup: ${result.backupPath}\n`);
  }
  if (useProxy) {
    const proxy = await startProxyProcess({
      profileId: selection.providerId,
      config: selection.config,
      entrypoint: fileURLToPath(import.meta.url),
      replace: true
    });
    output.write(`Started proxy: ${proxy.baseURL}\n`);
  }
}

async function writeClaudeCodeSetup(
  rl: ReturnType<typeof createInterface>,
  command: Extract<CliCommand, { command: "setup" }>,
  selection: ProviderSelection,
  useProxy: boolean
) {
  if (useProxy) {
    await ensureProxyAuthToken(rl, command, selection);
  }

  const proxyBaseURL = useProxy ? `http://${selection.config.proxy.host}:${selection.config.proxy.port}` : selection.upstreamBaseURL;
  const modelMapping = await resolveClaudeModelMapping(rl, command, selection);
  const result = await writeClaudeCodeSettings({
    targetPath: getDefaultClaudeSettingsPath(),
    proxy: {
      baseURL: proxyBaseURL,
      authToken: useProxy ? selection.config.proxy.authToken : selection.apiKey,
      enableModelDiscovery: useProxy,
      defaultModel: selection.defaultModel,
      models: selection.selectedModels,
      modelMapping
    }
  });

  output.write(`Saved profile ${selection.providerId} to ${selection.toolConfigPath}\n`);
  output.write(`Updated Claude Code settings: ${result.targetPath}\n`);
  if (result.backupPath) {
    output.write(`Backup: ${result.backupPath}\n`);
  }
  if (useProxy) {
    const proxy = await startProxyProcess({
      profileId: selection.providerId,
      config: selection.config,
      entrypoint: fileURLToPath(import.meta.url),
      replace: true
    });
    output.write(`Started proxy: ${proxy.baseURL}\n`);
  }
}

async function writeCodexSetup(
  rl: ReturnType<typeof createInterface>,
  command: Extract<CliCommand, { command: "setup" }>,
  selection: ProviderSelection,
  useProxy: boolean
) {
  if (useProxy) {
    await ensureProxyAuthToken(rl, command, selection);
  }

  const proxyBaseURL = useProxy
    ? `http://${selection.config.proxy.host}:${selection.config.proxy.port}/v1`
    : selection.upstreamBaseURL;
  const result = await writeCodexConfig({
    targetPath: getDefaultCodexConfigPath(),
    providerId: selection.providerId,
    providerName: selection.providerName,
    baseURL: proxyBaseURL,
    authCommand: "model-provider-x",
    authArgs: useProxy ? ["proxy", "token"] : ["config", "api-key", "--profile", selection.providerId],
    model: selection.defaultModel
  });

  output.write(`Saved profile ${selection.providerId} to ${selection.toolConfigPath}\n`);
  output.write(`Updated Codex config: ${result.targetPath}\n`);
  if (result.backupPath) {
    output.write(`Backup: ${result.backupPath}\n`);
  }
  if (useProxy) {
    const proxy = await startProxyProcess({
      profileId: selection.providerId,
      config: selection.config,
      entrypoint: fileURLToPath(import.meta.url),
      replace: true
    });
    output.write(`Started proxy: ${proxy.baseURL}\n`);
  }
}

async function runProxyCommand(command: Extract<CliCommand, { command: "proxy" }>) {
  if (command.action === "up") {
    const config = await readToolConfig();
    const state = await startProxyProcess({
      profileId: command.profileId!,
      config,
      host: command.host,
      port: command.port,
      entrypoint: fileURLToPath(import.meta.url)
    });
    output.write(`Proxy running at ${state.baseURL} for profile ${state.profileId}\n`);
    return;
  }

  if (command.action === "down") {
    const status = await stopProxyProcess();
    output.write(status.state ? `Stopped proxy for profile ${status.state.profileId}\n` : "Proxy is not running\n");
    return;
  }

  if (command.action === "status") {
    const status = await readProxyStatus();
    if (!status.state) {
      output.write("Proxy is not running\n");
      return;
    }
    output.write(
      status.running
        ? `Proxy is running at ${status.state.baseURL} for profile ${status.state.profileId} (pid ${status.state.pid})\n`
        : `Proxy state exists but process ${status.state.pid} is not running\n`
    );
    return;
  }

  if (command.action === "token") {
    const config = await readToolConfig();
    output.write(`${config.proxy.authToken}\n`);
    return;
  }

  const config = await readToolConfig();
  const server = await startProxyServer({
    profileId: command.profileId!,
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

async function ensureProxyAuthToken(
  rl: ReturnType<typeof createInterface> | undefined,
  command: Extract<CliCommand, { command: "setup" }>,
  selection: ProviderSelection
): Promise<void> {
  if (command.options.yes || !rl) {
    return;
  }

  const current = selection.config.proxy.authToken;
  const action = canUseTui()
    ? await selectChoice("Proxy token", [
        { label: "Use existing proxy token", value: "use", hint: tokenHint(current) },
        { label: "Generate a new proxy token", value: "generate" },
        { label: "Enter a proxy token", value: "input" }
      ])
    : await promptProxyTokenAction(rl, current);

  if (action === "use") {
    return;
  }

  const nextToken =
    action === "generate"
      ? createProxyAuthToken()
      : await requiredOption(rl, undefined, "Proxy token");

  selection.config.proxy.authToken = nextToken;
  await writeToolConfig(selection.toolConfigPath, selection.config);
}

async function promptProxyTokenAction(
  rl: ReturnType<typeof createInterface>,
  current: string
): Promise<"use" | "generate" | "input"> {
  output.write(`Proxy token found (${tokenHint(current)}).\n`);
  const answer = await rl.question("Use existing, generate new, or enter your own? [use/generate/input] ");
  const value = answer.trim().toLowerCase();
  if (!value || value === "use" || value === "u") {
    return "use";
  }
  if (value === "generate" || value === "g") {
    return "generate";
  }
  if (value === "input" || value === "i" || value === "byok") {
    return "input";
  }
  throw new Error(`Unknown proxy token action: ${answer}`);
}

function tokenHint(token: string): string {
  if (token.length <= 10) {
    return token;
  }
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
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

async function resolveProviderDefaults(
  rl: ReturnType<typeof createInterface>,
  options: CliOptions
): Promise<{ id?: string; name?: string; baseURL?: string; preset?: ProviderPreset }> {
  if (options.baseURL) {
    return {};
  }

  const presetId =
    options.providerPreset ?? (canUseTui() ? await selectChoice("Choose provider", createProviderChoices()) : undefined);
  if (!presetId || presetId === "custom") {
    return {};
  }

  const preset = getProviderPreset(presetId);
  if (!preset) {
    throw new Error(`Unknown provider preset: ${presetId}`);
  }

  return {
    id: preset.id,
    name: preset.name,
    baseURL: preset.baseURL,
    preset
  };
}

async function resolveProxyMode(
  rl: ReturnType<typeof createInterface>,
  options: CliOptions,
  capabilities: ProviderCapabilities,
  target: TargetId
): Promise<boolean> {
  if (options.proxy !== undefined) {
    return options.proxy;
  }

  const recommendedProxy = recommendProxyMode(capabilities, target);
  if (canUseTui()) {
    return selectChoice("Connection mode", [
      {
        label: "Direct provider config",
        value: false,
        hint: recommendedProxy ? "target API not detected" : "recommended"
      },
      {
        label: "Use compatibility proxy",
        value: true,
        hint: recommendedProxy ? "recommended" : "maximum compatibility"
      }
    ]);
  }

  const prompt = recommendedProxy ? "Use compatibility proxy? [Y/n] " : "Use direct provider config? [Y/n] ";
  const answer = await rl.question(prompt);
  const accepted = !answer.trim() || answer.trim().toLowerCase() === "y";
  return recommendedProxy ? accepted : !accepted;
}

async function resolveOpenCodeApiType(
  rl: ReturnType<typeof createInterface>,
  command: Extract<CliCommand, { command: "setup" }>,
  capabilities: ProviderCapabilities,
  useProxy: boolean
): Promise<OpenCodeApiType> {
  if (command.options.opencodeApiType) {
    return command.options.opencodeApiType;
  }

  const availableApis = useProxy ? new Set<ProviderApiKind>(["openai-compatible", "openai-responses", "anthropic-messages"]) : new Set(capabilities.apis);
  const recommended = recommendedOpenCodeApiType(availableApis);
  if (command.options.yes) {
    return recommended;
  }

  const choices: Choice<OpenCodeApiType>[] = [
    {
      label: "Responses API",
      value: "responses",
      hint: choiceHint("openai-responses", recommended, "responses", availableApis)
    },
    {
      label: "Chat Completions API",
      value: "chat",
      hint: choiceHint("openai-compatible", recommended, "chat", availableApis)
    },
    {
      label: "Anthropic Messages API",
      value: "messages",
      hint: choiceHint("anthropic-messages", recommended, "messages", availableApis)
    }
  ];

  if (canUseTui()) {
    return selectChoice("OpenCode API type", choices);
  }

  output.write("OpenCode API types:\n");
  choices.forEach((choice, index) => {
    output.write(`${index + 1}. ${choice.label}${choice.hint ? ` - ${choice.hint}` : ""}\n`);
  });
  const answer = await rl.question(`OpenCode API type [${recommended}]: `);
  const value = answer.trim();
  if (!value) {
    return recommended;
  }
  if (value === "1" || value === "responses") {
    return "responses";
  }
  if (value === "2" || value === "chat" || value === "chat-completions") {
    return "chat";
  }
  if (value === "3" || value === "messages") {
    return "messages";
  }
  throw new Error(`Unknown OpenCode API type: ${value}`);
}

function recommendedOpenCodeApiType(apis: Set<ProviderApiKind>): OpenCodeApiType {
  if (apis.has("openai-responses")) {
    return "responses";
  }
  if (apis.has("openai-compatible")) {
    return "chat";
  }
  if (apis.has("anthropic-messages")) {
    return "messages";
  }
  return "chat";
}

function choiceHint(
  api: ProviderApiKind,
  recommended: OpenCodeApiType,
  value: OpenCodeApiType,
  availableApis: Set<ProviderApiKind>
): string {
  const hints = [];
  if (value === recommended) {
    hints.push("recommended");
  }
  if (!availableApis.has(api)) {
    hints.push("not detected");
  }
  return hints.join(", ");
}

async function resolveDefaultModel(
  rl: ReturnType<typeof createInterface>,
  command: Extract<CliCommand, { command: "setup" }>,
  selectedModels: string[]
): Promise<string> {
  if (command.defaultModel) {
    if (!selectedModels.includes(command.defaultModel)) {
      throw new Error(`Default model is not in the selected model list: ${command.defaultModel}`);
    }
    return command.defaultModel;
  }

  if (selectedModels.length === 0) {
    throw new Error("Select at least one model");
  }

  if (selectedModels.length === 1 || command.options.yes) {
    return selectedModels[0];
  }

  if (canUseTui()) {
    return selectChoice("Choose default model", selectedModels.map((model) => ({ label: model, value: model })));
  }

  const answer = await rl.question(`Default model [${selectedModels[0]}]: `);
  const model = answer.trim() || selectedModels[0];
  if (!selectedModels.includes(model)) {
    throw new Error(`Default model is not in the selected model list: ${model}`);
  }
  return model;
}

async function resolveClaudeModelMapping(
  rl: ReturnType<typeof createInterface>,
  command: Extract<CliCommand, { command: "setup" }>,
  selection: ProviderSelection
): Promise<ClaudeModelMapping> {
  const defaultMapping = defaultClaudeModelMapping(selection.defaultModel);
  if (selection.selectedModels.length <= 1 || command.options.yes) {
    return defaultMapping;
  }

  const customize = canUseTui()
    ? await selectChoice("Claude Code model mapping", [
        { label: "Use default model for Opus, Sonnet, Haiku", value: false, hint: "recommended" },
        { label: "Customize Opus, Sonnet, Haiku models", value: true }
      ])
    : (await rl.question("Use default model for Opus, Sonnet, Haiku? [Y/n] ")).trim().toLowerCase() === "n";

  if (!customize) {
    return defaultMapping;
  }

  return {
    opus: await selectModelForRole(rl, "Opus model", selection.selectedModels, selection.defaultModel),
    sonnet: await selectModelForRole(rl, "Sonnet model", selection.selectedModels, selection.defaultModel),
    haiku: await selectModelForRole(rl, "Haiku model", selection.selectedModels, selection.defaultModel),
    subagent: await selectModelForRole(rl, "Subagent model", selection.selectedModels, selection.defaultModel)
  };
}

async function selectModelForRole(
  rl: ReturnType<typeof createInterface>,
  label: string,
  models: string[],
  defaultModel: string
): Promise<string> {
  if (canUseTui()) {
    return selectChoice(label, models.map((model) => ({ label: model, value: model, hint: model === defaultModel ? "default" : undefined })));
  }

  const answer = await rl.question(`${label} [${defaultModel}]: `);
  const model = answer.trim() || defaultModel;
  if (!models.includes(model)) {
    throw new Error(`${label} is not in the selected model list: ${model}`);
  }
  return model;
}

async function resolveSetupTarget(
  rl: ReturnType<typeof createInterface>,
  target: TargetId | undefined
): Promise<TargetId> {
  if (target) {
    return target;
  }

  if (canUseTui()) {
    return selectChoice("Choose agent platform", [
      { label: "OpenCode", value: "opencode" },
      { label: "Codex", value: "codex" },
      { label: "Claude Code", value: "claude-code" }
    ]);
  }

  const answer = await rl.question("Agent platform [opencode/codex/claude-code]: ");
  const value = answer.trim() || "opencode";
  if (value === "opencode" || value === "codex" || value === "claude-code") {
    return value;
  }
  throw new Error(`Unknown setup target: ${value}`);
}

async function resolveApiKey(
  rl: ReturnType<typeof createInterface>,
  apiKey: string | undefined,
  preset: ProviderPreset | undefined,
  label = "API key"
): Promise<string> {
  if (apiKey !== undefined) {
    return apiKey;
  }

  const suffix = preset?.apiKeyRequired ? "" : " (optional)";
  return rl.question(`${label}${suffix}: `);
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

async function resolveModelModalities(
  rl: ReturnType<typeof createInterface>,
  command: Extract<CliCommand, { command: "setup" }>,
  selectedModels: string[],
  fetchedModelDetails: ModelInfo[]
): Promise<ModelInfo[]> {
  const userModalityOverrides = new Map<string, ModelModalities>();
  if (command.options.modalities) {
    for (const override of command.options.modalities) {
      userModalityOverrides.set(override.modelId, override.modalities);
    }
  }

  const result: ModelInfo[] = [];
  for (const modelId of selectedModels) {
    const fetched = fetchedModelDetails.find((m) => m.id === modelId);
    const userOverride = userModalityOverrides.get(modelId);

    if (userOverride) {
      result.push({ id: modelId, modalities: userOverride });
      continue;
    }

    if (fetched?.modalities) {
      result.push(fetched);
      continue;
    }

    if (command.options.yes || isKnownModel(modelId)) {
      result.push(fetched ?? { id: modelId });
      continue;
    }

    const modalities = await promptModelModalities(rl, modelId);
    result.push({ id: modelId, modalities });
  }

  return result;
}

async function promptModelModalities(
  rl: ReturnType<typeof createInterface>,
  modelId: string
): Promise<ModelModalities> {
  output.write(`\nModel: ${modelId} - Capabilities unknown\n`);

  if (canUseTui()) {
    const inputModalities = await multiSelectChoices("Input modalities", [
      { label: "text", value: "text", hint: "default" },
      { label: "image", value: "image" },
      { label: "audio", value: "audio" },
      { label: "video", value: "video" },
      { label: "pdf", value: "pdf" },
    ]);
    const outputModalities = await multiSelectChoices("Output modalities", [
      { label: "text", value: "text", hint: "default" },
      { label: "image", value: "image" },
      { label: "audio", value: "audio" },
      { label: "video", value: "video" },
      { label: "pdf", value: "pdf" },
    ]);
    return {
      input: inputModalities as ModelModalities["input"],
      output: outputModalities as ModelModalities["output"],
    };
  }

  const inputAnswer = await rl.question("Input modalities [text]: ");
  const outputAnswer = await rl.question("Output modalities [text]: ");

  const parseModalityList = (answer: string): ("text" | "image" | "audio" | "video" | "pdf")[] => {
    if (!answer.trim()) {
      return ["text"];
    }
    return answer.split(",").map((m) => {
      const trimmed = m.trim().toLowerCase();
      if (["text", "image", "audio", "video", "pdf"].includes(trimmed)) {
        return trimmed as "text" | "image" | "audio" | "video" | "pdf";
      }
      throw new Error(`Unknown modality: ${trimmed}`);
    });
  };

  return {
    input: parseModalityList(inputAnswer),
    output: parseModalityList(outputAnswer),
  };
}

void main();
