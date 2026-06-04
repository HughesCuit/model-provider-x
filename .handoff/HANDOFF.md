# Handoff: model-provider-x

Saved: 2026-06-04 00:00 Asia/Shanghai

## Current State

`model-provider-x` is a TypeScript CLI/TUI package for wiring local and hosted model providers into OpenCode, Codex, and Claude Code.

The working tree was clean at save time. Latest package version in `package.json` is `0.2.4`.

Recent commits:

- `305a4fe` feat: add model modalities support for OpenCode config
- `759623c` Release model-provider-x 0.2.3
- `ed76fde` Release model-provider-x 0.2.2
- `5918367` Fix npm trusted publishing workflow
- `e7ef985` Release model-provider-x 0.2.1

## Implemented Capabilities

- Unified setup wizard: provider -> models -> target platform -> direct/proxy -> target-specific config.
- Built-in provider presets for common local/online providers.
- Model discovery filters typed embedding-only models and defaults suspicious embedding models to unchecked in the TUI.
- OpenCode config generation and JSONC merge.
- OpenCode direct API type selection:
  - `chat` -> `@ai-sdk/openai-compatible`
  - `responses` -> `@ai-sdk/openai`
  - `messages` -> `@ai-sdk/anthropic`
- OpenCode provider config includes `options.setCacheKey=true` for OpenAI-style providers.
- Codex config writer for Responses-compatible providers with command-backed auth.
- Claude Code settings writer with API key conflict cleanup, base URL normalization, model mapping, and optional role-specific Opus/Sonnet/Haiku mapping.
- Local compatibility proxy:
  - `/v1/responses` -> upstream `/chat/completions`
  - `/v1/messages` -> upstream `/chat/completions`
  - `/v1/chat/completions` and `/v1/completions` passthrough
  - background process lifecycle via `proxy up/down/status/token`
- Proxy token handling prompts interactively to reuse, generate, or enter a token; `--yes` keeps existing/default behavior.
- GitHub Actions Trusted Publishing workflow is configured in `.github/workflows/publish.yml`.

## Verification Snapshot

Most recent known verification before this save:

- `npm test` passed with 61 tests at version `0.2.3`.
- `npm pack --dry-run` passed for `0.2.3`.
- `0.2.3` published successfully through GitHub Actions Trusted Publishing.

At save time no new uncommitted changes were present.

## Operational Notes

- Use PowerShell/Git for Windows for GitHub push if WSL git lacks credentials.
- npm Trusted Publishing requires GitHub Actions with `id-token: write` and npm CLI `11.5.1+`; the workflow uses Node 24 and upgrades npm to latest.
- For Claude Code direct Anthropic-compatible providers, `ANTHROPIC_BASE_URL` is written without trailing `/v1` because Claude Code appends `/v1/messages`.
- For LM Studio + OpenCode cache tests, prefer `--opencode-api responses` when direct mode is desired.

## Known Risks

- OpenCode cache read/write display still depends on what the provider returns in usage metadata.
- The local proxy's Responses conversion is intentionally minimal and non-streaming; streaming Responses support is not implemented.
- Direct Anthropic Messages support for local providers should be validated provider-by-provider because shape and base URL semantics vary.

