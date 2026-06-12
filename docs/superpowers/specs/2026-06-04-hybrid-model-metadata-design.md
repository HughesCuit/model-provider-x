# Hybrid Model Metadata Design

## Goal

Improve model setup so users do less manual capability confirmation and always know which model they are editing. The first layer must stay generic for OpenAI-compatible and adjacent providers. LM Studio gets a second, targeted enrichment path because its native REST API and TypeScript SDK expose richer local-model metadata.

## Architecture

Model discovery keeps `/v1/models` as the required baseline. Each raw model is normalized into `ModelInfo`, which grows from only `id` and `modalities` into a richer metadata record:

- `type`, `architecture`, `quantization`, `parameterSize`, and `state` for display and filtering.
- `contextLength` for OpenCode `limit.context`.
- `capabilities.toolCall`, `capabilities.reasoning`, and inferred modalities for OpenCode model flags.
- `metadataSources` to explain whether data came from `/models`, a native REST endpoint, static heuristics, user overrides, or the LM Studio SDK.

The generic REST layer parses common shapes returned by OpenAI-compatible gateways, Models.dev-like metadata, OpenRouter-style records, and LM Studio native REST records. For LM Studio presets or localhost base URLs that look like LM Studio, discovery also probes the native REST base derived from the `/v1` URL, such as `http://localhost:1234/api/v1/models` and `http://localhost:1234/api/v0/models`.

The optional SDK layer attempts a dynamic import of `@lmstudio/sdk` only for the LM Studio preset or detected LM Studio endpoints. If the package or server is unavailable, setup continues with REST metadata. SDK results are merged by model id and path-like aliases, and only strengthen confidence; they never remove explicit user overrides.

## CLI/TUI Flow

Model selection choices should show useful hints, for example `llm, 32k ctx, Q4_K_M, vision, tools`. Embedding-only models remain unchecked by default, and non-loaded LM Studio models can be hinted as unavailable or unloaded when the native endpoint reports state.

Capability confirmation is only shown when no source can infer a useful answer. The TUI titles must include the model id, for example `Input modalities: qwen2.5-vl-7b-instruct`, so users are never editing an anonymous capability page. Non-TUI prompts already print the model id and should keep doing so.

## OpenCode Output

When metadata supports it, generated OpenCode model config includes:

- `modalities` from user override, API/SDK data, or known heuristics.
- `tool_call: true` when the provider reports tool support.
- `reasoning: true` when the model metadata indicates reasoning support.
- `limit.context` when context length is known.

Unknown values are omitted rather than guessed.

## Testing

Add failing tests first for:

- Parsing LM Studio native REST model metadata.
- Merging richer metadata into `validateAndFetchModels`.
- Rendering model choice hints from `ModelInfo`.
- Including the current model id in modality TUI titles.
- Emitting OpenCode `tool_call`, `reasoning`, and `limit.context` from enriched metadata.

Network-dependent SDK behavior is tested through injected loaders or no-op fallbacks, not by requiring a live LM Studio server.
