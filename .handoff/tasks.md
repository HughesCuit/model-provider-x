# Pending Tasks

## Immediate

- No immediate implementation task is pending.
- models.dev registry integration is complete and published.
- v0.2.5 (latest) and v0.2.6-beta.0 (next) both published successfully.

## Optional Follow-ups

- Add mimo-pool ASR model entry to local registry override file.
- Consider adding more aggressive fuzzy matching for very specific model variants.
- Add CLI command to update models.dev data directly (currently via npm script).
- Monitor models.dev API for schema changes.
- Consider adding a model capability cache for faster lookups.
- Add more models.dev data sources or alternative registries.

## Validation Scenarios To Keep

- Real LM Studio on `localhost:1234`:
  - verify native REST enrichment works
  - verify models.dev fallback for unknown variants
  - verify OpenCode JSON includes modalities/tool/reasoning/context
- Real mimo-pool on Docker:
  - verify `/v1/models` discovery works
  - verify 8/9 models auto-identified
  - verify TTS models correctly identified as text → audio
  - verify multimodal models correctly identified
- Registry override path:
  - verify project-local `model-provider-x.models.jsonc`
  - verify repeatable `--model-registry <path>`
  - verify `--modalities` remains highest priority
