export interface CliOptions {
  apiKey?: string;
  baseURL?: string;
  configPath?: string;
  models?: string[];
  print: boolean;
  providerId?: string;
  providerName?: string;
  providerPreset?: string;
  proxy?: boolean;
  yes: boolean;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = { print: false, yes: false };

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
      case "--api-key":
        options.apiKey = next();
        break;
      case "--base-url":
        options.baseURL = next();
        break;
      case "--config":
        options.configPath = next();
        break;
      case "--id":
        options.providerId = next();
        break;
      case "--models":
        options.models = next()
          .split(",")
          .map((model) => model.trim())
          .filter(Boolean);
        break;
      case "--name":
        options.providerName = next();
        break;
      case "--provider":
        options.providerPreset = next();
        break;
      case "--proxy":
        options.proxy = true;
        break;
      case "--direct":
        options.proxy = false;
        break;
      case "--print":
        options.print = true;
        break;
      case "--yes":
      case "-y":
        options.yes = true;
        break;
      case "--help":
      case "-h":
        throw new HelpRequested();
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function parseModelSelection(selection: string, models: string[]): string[] {
  const trimmed = selection.trim();
  if (!trimmed || trimmed.toLowerCase() === "all") {
    return models;
  }

  const selected = new Set<string>();
  for (const part of trimmed.split(",")) {
    const token = part.trim();
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let index = start; index <= end; index += 1) {
        addModelByOneBasedIndex(selected, models, index);
      }
      continue;
    }

    const index = Number(token);
    if (Number.isInteger(index)) {
      addModelByOneBasedIndex(selected, models, index);
      continue;
    }

    if (models.includes(token)) {
      selected.add(token);
      continue;
    }

    throw new Error(`Unknown model selection: ${token}`);
  }

  return [...selected];
}

export function usage(): string {
  return `model-provider-x

Usage:
  model-provider-x [options]
  model-provider-x setup [options]

Options:
  --base-url <url>     OpenAI-compatible API base URL, for example http://localhost:8888/v1
  --api-key <key>      Optional API key. Written into config when provided.
  --name <name>        Provider display name.
  --id <id>            Provider id used under provider.<id>.
  --provider <id>      Use a built-in provider preset, for example lmstudio or openai.
  --proxy              Write agent config through the local compatibility proxy.
  --direct             Write agent config directly to the upstream provider.
  --models <list>      Comma-separated model ids. Skips interactive model selection.
  --config <path>      OpenCode config path to write when targeting OpenCode.
  --print              Print generated JSON and do not write config.
  --yes, -y            Accept defaults in non-interactive prompts.
  --help, -h           Show this help.
`;
}

export class HelpRequested extends Error {}

function addModelByOneBasedIndex(selected: Set<string>, models: string[], index: number) {
  const model = models[index - 1];
  if (!model) {
    throw new Error(`Model index out of range: ${index}`);
  }
  selected.add(model);
}
