# Decisions

## Handoff Storage

- Continue using direct `.handoff/` storage because the project already has `.handoff.config.json` with direct mode.

## models.dev Integration

- Integrated models.dev as the primary external model metadata source.
- Fetches data via API and stores as JSON in `src/data/models-dev.json`.
- Build script copies data to `dist/data/` for package distribution.
- Update script available via `npm run update-models-dev`.

## Fuzzy Matching Strategy

- Strip common suffixes for better model variant matching:
  - Quantization: `-qat`, `-gguf`, `-gptq`, `-awq`, `-4bit`, `-8bit`
  - Variants: `-it`, `-instruct`, `-chat`, `-base`
  - Architecture: `-mtp`, `-moe`, `-a17b`, `-a22b`
  - Size: `-small`, `-large`, `-mini`, `-nano`, `-pro`, `-plus`
- Also strip parameter size suffixes like `-12b`, `-7b`, `-70b`.

## Cross-Provider Search

- When model not found in specified provider, search across all providers.
- This handles cases where user's provider hosts models from different vendors.

## Provider Presets Expansion

- Expanded from 6 to 20 providers.
- Grouped providers by category (local/cloud/gateway).
- Added major cloud providers and gateways.

## Output Limit Fix

- Added `maxOutputTokens` field to `ModelInfo` type.
- Fixed OpenCode validation error: "Missing key provider.*.models.*.limit.output".
- Now generates both `limit.context` and `limit.output`.

## Release Strategy

- v0.2.6 promoted to `latest` tag (stable release).
- v0.2.7-beta.0 published as `next` tag (development version).
- GitHub Actions workflow automatically determines tag based on version suffix.

## AI SDK Clarification

- @ai-sdk/openai-compatible is a client library, NOT a metadata source.
- models.dev is the correct source for model metadata.

## MiMo Model Support

- 8/9 MiMo-pool models auto-identified via models.dev.
- `mimo-v2.5-asr` not found in models.dev; needs local registry override.
- TTS models correctly identified with text → audio modalities.
