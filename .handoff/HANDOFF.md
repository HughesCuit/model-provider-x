# Handoff: model-provider-x

Saved: 2026-06-12 10:00 CST

## Current State

`model-provider-x` is a TypeScript CLI/TUI package for wiring local and hosted model providers into OpenCode, Codex, and Claude Code.

Current branch is `main` at `fa1031c` (`Release model-provider-x 0.2.6-beta.0`). `main` is aligned with `origin/main`, and the current package version is `0.2.6-beta.0`.

The code working tree is clean relative to HEAD. The only untracked files are handoff/local context artifacts:

- `.handoff.config.json`
- `.handoff/`
- `docs/`

## Completed Work

### models.dev Registry Integration (This Session)

Major feature: integrated models.dev as a comprehensive model metadata source.

Key changes:

- Added `scripts/fetch-models-dev.ts` to fetch and transform models.dev API data
- Created `src/data/models-dev.json` with 5218 models from 142 providers
- Replaced hardcoded single-model registry with full models.dev data
- Added fuzzy matching for model variants (strips `-it`, `-qat`, `-mtp`, `-instruct`, etc.)
- Implemented cross-provider search when model not found in specified provider
- Updated build script to include data directory in dist
- Updated README with models.dev documentation

### Release History

- **v0.2.5 (latest)**: Promoted from beta, includes models.dev integration
- **v0.2.6-beta.0 (next)**: New development version

## Verification Evidence

Verification completed before publishing:

- `npm run build` passed.
- `npm test` passed with 12 files / 96 tests.
- npm publish succeeded for both versions.

Real e2e observations:

- MiMo-pool models: 8/9 auto-identified correctly
  - `mimo-v2-omni`: text,image,audio,pdf → text, reasoning, tool_call
  - `mimo-v2-pro`: text → text, reasoning, tool_call
  - `mimo-v2-tts`: text → audio
  - `mimo-v2.5`: text,image,audio,video → text, reasoning, tool_call
  - `mimo-v2.5-pro`: text → text, reasoning, tool_call
  - `mimo-v2.5-tts`: text → audio
  - `mimo-v2.5-tts-voiceclone`: text → audio
  - `mimo-v2.5-tts-voicedesign`: text → audio
  - `mimo-v2.5-asr`: NOT FOUND (not in models.dev)

- LM Studio models: metadata correctly enriched via native REST API + models.dev fallback
- Fuzzy matching works for variants like `gemma-4-12b-qat` → `gemma-4`

## Important Discussion Outcome

The user correctly identified that @ai-sdk does NOT provide model capability metadata - it's only a client library. The models.dev integration is the correct approach for model capability detection.

Current model capability precedence:
1. User CLI overrides (`--modalities`)
2. Provider/native runtime metadata (LM Studio REST API)
3. Project-local registry overrides (`model-provider-x.models.jsonc`)
4. Built-in models.dev metadata (5218 models)
5. Conservative heuristics (keyword matching)

## Known Risks

- Some local model variants may not match models.dev entries exactly
- ASR model (`mimo-v2.5-asr`) not in models.dev data
- models.dev data may become stale; `npm run update-models-dev` updates it
- Fuzzy matching may occasionally match wrong model variant

## Suggested Next Actions

No immediate implementation work is pending.

Useful follow-ups if work resumes:

1. Add a mimo-pool ASR model entry to local registry override
2. Consider adding more aggressive fuzzy matching for very specific variants
3. Add CLI command to update models.dev data directly
4. Monitor models.dev for schema changes
5. Consider adding a model capability cache for faster lookups
