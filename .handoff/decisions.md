# Decisions

## Handoff Storage

- Use direct `.handoff/` storage for this save because no handoff config existed and no private handoff repository URL was provided.
- If handoff context should remain private, switch to submodule mode later.

## OpenCode API Type Selection

- OpenCode supports multiple AI SDK provider packages, so `model-provider-x` exposes an explicit API type selector.
- Provider-level API type is currently used rather than per-model API type to keep config output simple and predictable.

## Cache Key Behavior

- OpenCode provider entries enable `options.setCacheKey=true` for OpenAI-style provider configs.
- This improves cache routing but does not guarantee cache read/write display because usage reporting is provider-dependent.

## Claude Code Auth

- Claude Code settings use `ANTHROPIC_API_KEY` only and remove stale `ANTHROPIC_AUTH_TOKEN` to avoid auth conflicts.
- Claude Code direct base URLs remove trailing `/v1` because Claude Code appends `/v1/messages`.

## Publishing

- npm publishing is handled by GitHub Actions Trusted Publishing through `.github/workflows/publish.yml`.
- The workflow uses Node 24 and upgrades npm to latest so npm CLI supports OIDC trusted publishing.

