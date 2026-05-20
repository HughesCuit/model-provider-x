# model-provider-x

`model-provider-x` is a TypeScript CLI/TUI tool for wiring custom model providers into local AI coding tools.

It currently supports:

- OpenCode provider config generation and JSONC merge.
- Claude Code setup through a local Anthropic Messages-compatible proxy.
- OpenAI-compatible `/v1/models` discovery.
- Anthropic Messages API to OpenAI Chat Completions API conversion.
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

## OpenCode Setup

Run the TUI wizard:

```bash
node dist/cli/index.js
```

Or print a config fragment without writing files:

```bash
node dist/cli/index.js \
  --name "Unsloth Local" \
  --id unsloth \
  --base-url http://localhost:8888/v1 \
  --models qwen,gemma \
  --print
```

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
node dist/cli/index.js proxy --profile unsloth
```

The Claude Code setup writes gateway environment values to `~/.claude/settings.json`.
Upstream provider keys are stored in `~/.config/model-provider-x/config.jsonc`, not in Claude Code settings.

## Commands

```bash
npx @heventure/model-provider-x --help
npx @heventure/model-provider-x setup --target claude-code
npx @heventure/model-provider-x proxy --profile <id>
npx @heventure/model-provider-x config print --profile <id>
```

## Development

```bash
npm test
npm run lint
npm run build
```

## License

MIT
