#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(PROJECT_ROOT, "src", "data");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "models-dev.json");

interface ModelsDevModel {
  id: string;
  name?: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  open_weights?: boolean;
  limit?: {
    context?: number;
    output?: number;
    input?: number;
  };
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
}

interface ModelsDevProvider {
  id: string;
  name?: string;
  env?: string[];
  npm?: string;
  api?: string;
  doc?: string;
  models: Record<string, ModelsDevModel>;
}

interface ModelsDevData {
  [providerId: string]: ModelsDevProvider;
}

interface RegistryModel {
  id?: string;
  type?: string;
  reasoning?: boolean;
  tool_call?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  limit?: {
    context?: number;
    output?: number;
  };
}

interface RegistryProvider {
  models: Record<string, RegistryModel>;
}

interface RegistryData {
  source: string;
  generatedAt: string;
  providers: Record<string, RegistryProvider>;
}

async function fetchModelsDev(): Promise<ModelsDevData> {
  const response = await fetch("https://models.dev/api.json");
  if (!response.ok) {
    throw new Error(`Failed to fetch models.dev: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<ModelsDevData>;
}

function transformModel(model: ModelsDevModel): RegistryModel {
  const result: RegistryModel = {
    id: model.id,
    type: "llm",
  };

  if (model.reasoning !== undefined) {
    result.reasoning = model.reasoning;
  }

  if (model.tool_call !== undefined) {
    result.tool_call = model.tool_call;
  }

  if (model.modalities) {
    result.modalities = {
      input: model.modalities.input as RegistryModel["modalities"] extends { input?: infer I } ? I : never,
      output: model.modalities.output as RegistryModel["modalities"] extends { output?: infer O } ? O : never,
    };
  }

  if (model.limit) {
    result.limit = {
      context: model.limit.context,
      output: model.limit.output,
    };
  }

  return result;
}

function transformProvider(provider: ModelsDevProvider): RegistryProvider {
  const models: Record<string, RegistryModel> = {};

  for (const [modelId, model] of Object.entries(provider.models)) {
    models[modelId] = transformModel(model);
  }

  return { models };
}

async function main() {
  console.log("Fetching models.dev data...");
  const data = await fetchModelsDev();

  const registry: RegistryData = {
    source: "models.dev",
    generatedAt: new Date().toISOString(),
    providers: {},
  };

  let modelCount = 0;
  for (const [providerId, provider] of Object.entries(data)) {
    registry.providers[providerId] = transformProvider(provider);
    modelCount += Object.keys(provider.models).length;
  }

  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
  }

  await writeFile(OUTPUT_FILE, JSON.stringify(registry, null, 2));
  console.log(`Wrote ${modelCount} models from ${Object.keys(data).length} providers to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error("Failed to fetch models.dev data:", error);
  process.exit(1);
});
