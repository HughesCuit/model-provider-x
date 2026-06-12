# model-provider-x

`model-provider-x` is a TypeScript CLI/TUI tool for wiring custom model providers into local AI coding tools.

It currently supports:

- OpenCode provider config generation and JSONC merge.
- Claude Code setup through a local Anthropic Messages-compatible proxy.
- OpenAI-compatible `/v1/models` discovery.
- Anthropic Messages API to OpenAI Chat Completions API conversion.
- OpenAI Responses API to OpenAI Chat Completions API conversion for Codex.
- Non-streaming and streaming SSE proxy responses.

## Install

```bash
npm install
npm run build
```

Or run the published package directly:

```bash
npx @heventure/model-provider-x --help
```

## Unified Setup

Run the TUI wizard:

```bash
node dist/cli/index.js
```

The wizard asks for:

1. Provider.
2. Models.
3. Agent platform: OpenCode, Codex, or Claude Code.
4. Direct or proxy mode, with a recommendation based on provider API support.
5. Any platform-specific install target.

## OpenCode Setup

Print a config fragment without writing files:

```bash
node dist/cli/index.js \
  --name "Unsloth Local" \
  --id unsloth \
  --base-url http://localhost:8888/v1 \
  --models qwen,gemma \
  --print
```

OpenCode provider entries include `options.setCacheKey=true` by default.
This lets OpenCode pass a stable cache key through the OpenAI-compatible provider path so relays or local providers that support prompt caching can route repeated context to the same cache.

When targeting OpenCode, choose the direct API type interactively or pass `--opencode-api`:

```bash
node dist/cli/index.js setup --target opencode --provider lmstudio --direct --opencode-api responses
```

Supported values are:

- `chat`: writes `npm: "@ai-sdk/openai-compatible"` for `/v1/chat/completions`.
- `responses`: writes `npm: "@ai-sdk/openai"` for `/v1/responses`.
- `messages`: writes `npm: "@ai-sdk/anthropic"` for Anthropic-compatible `/v1/messages`.

## Claude Code Setup

Create or update a provider profile and write Claude Code user settings:

```bash
node dist/cli/index.js setup --target claude-code \
  --name "Unsloth Local" \
  --id unsloth \
  --base-url http://localhost:8888/v1
```

Then start the local proxy:

```bash
node dist/cli/index.js proxy up --profile unsloth
```

The Claude Code setup writes gateway environment values to `~/.claude/settings.json`.
Claude Code appends `/v1/messages` itself, so direct Anthropic-compatible provider URLs are written without a trailing `/v1`.
For example, entering `http://localhost:1234/v1` for LM Studio writes `ANTHROPIC_BASE_URL=http://localhost:1234`.
The setup uses `ANTHROPIC_API_KEY` and removes stale `ANTHROPIC_AUTH_TOKEN` values to avoid Claude Code auth conflicts.
Upstream provider keys are stored in `~/.config/model-provider-x/config.jsonc`, not in Claude Code settings.

## Codex Setup

Create or update a provider profile and write Codex user config:

```bash
node dist/cli/index.js setup --target codex \
  --provider lmstudio
```

Then start the local proxy:

```bash
node dist/cli/index.js proxy up --profile lmstudio
```

The Codex setup writes a Responses-compatible provider to `~/.codex/config.toml`.
It also configures command-backed authentication so Codex can fetch the local proxy token automatically.
The proxy currently supports non-streaming `/v1/responses` requests and forwards them to upstream OpenAI-compatible `/v1/chat/completions`.

## Setup Modes

You can also run the unified setup wizard through the explicit setup command:

```bash
node dist/cli/index.js setup --provider lmstudio
```

The wizard asks whether to write the agent config through the local compatibility proxy before choosing the target agent.
Proxy mode gives the broadest compatibility:

- `/v1/responses` for Codex.
- `/v1/chat/completions` and `/v1/completions` passthrough for OpenAI-compatible clients.
- `/v1/messages` for Claude Code.

When proxy mode is selected interactively, the wizard confirms whether to reuse the current proxy token, generate a new one, or enter your own.
Non-interactive `--yes` runs keep the existing token or use the generated default.

You can force either mode non-interactively:

```bash
node dist/cli/index.js setup --target codex --provider lmstudio --proxy
node dist/cli/index.js setup --target opencode --provider lmstudio --direct
```

## Model Metadata Registry

Some OpenAI-compatible providers only return minimal `/v1/models` entries with `id`, `object`, and `owned_by`.
For those providers, `model-provider-x` can enrich model capabilities from registries.

The merge order is:

1. User overrides such as `--modalities`.
2. Provider or native runtime metadata.
3. Project-local registry overrides.
4. Built-in models.dev metadata (5000+ models from 140+ providers).
5. Conservative model-name heuristics.

By default, the CLI reads `model-provider-x.models.jsonc` from the current working directory when it exists.
You can also pass one or more registry files explicitly:

```bash
node dist/cli/index.js setup \
  --provider custom \
  --model-registry ./model-provider-x.models.jsonc
```

Example registry:

```jsonc
{
  "providers": {
    "mimo-pool": {
      "models": {
        "mimo-v2.5-tts": {
          "type": "tts",
          "modalities": {
            "input": ["text"],
            "output": ["audio"]
          },
          "limit": {
            "context": 8192
          }
        }
      }
    }
  }
}
```

### Updating Models.dev Data

The built-in models.dev data is bundled with the package. To update it to the latest version:

```bash
npm run update-models-dev
```

This fetches the latest model metadata from [models.dev](https://models.dev) and updates `src/data/models-dev.json`.

## Commands

```bash
npx @heventure/model-provider-x --help
npx @heventure/model-provider-x setup --target claude-code
npx @heventure/model-provider-x setup --target codex
npx @heventure/model-provider-x proxy --profile <id>
npx @heventure/model-provider-x proxy up --profile <id>
npx @heventure/model-provider-x proxy status
npx @heventure/model-provider-x proxy down
npx @heventure/model-provider-x config print --profile <id>
npx @heventure/model-provider-x config api-key --profile <id>
```

## Development

```bash
npm test
npm run lint
npm run build
```

## License

MIT
