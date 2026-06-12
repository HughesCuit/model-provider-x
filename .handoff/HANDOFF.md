# Handoff: model-provider-x

Saved: 2026-06-12 16:10 CST

## Current State

`model-provider-x` is a TypeScript CLI/TUI package for wiring local and hosted model providers into OpenCode, Codex, and Claude Code.

Current branch is `main` at `01d37ee` (`Release model-provider-x 0.2.8-beta.0`). `main` is aligned with `origin/main`, and the current package version is `0.2.8-beta.0`.

The code working tree is clean relative to HEAD.

## Completed Work This Session

### 1. MiMo-pool ASR Model Local Registry
- Created `model-provider-x.models.jsonc` with mimo-v2.5-asr metadata
- Type: ASR, modalities: audio → text
- All 9/9 MiMo-pool models now have complete metadata

### 2. Fuzzy Matching Improvements
- Iterative suffix stripping for combinations like `-instruct-gguf`
- Date suffix support for Anthropic models (`-20241022`, `-20240620`)
- Decimal parameter size support (`-1.5b`, `-0.6b`)
- Bidirectional fuzzy matching (search term ↔ model keys)
- Added 8 new unit tests for model aliases
- Total tests: 104 (up from 96)

### 3. models.dev Data Update
- Updated from 5218 → 5244 models
- Updated from 142 → 144 providers
- mimo-v2.5-asr still not in models.dev (covered by local registry)

### 4. Version Releases
- v0.2.7 (latest): promoted from v0.2.7-beta.0
- v0.2.8-beta.0 (next): current development version

## Verification Evidence

- `npm run build` passed.
- `npm test` passed with 12 files / 104 tests.
- Real-world model matching verified:
  - `claude-3-5-sonnet` → matches `claude-3-5-sonnet-20241022`
  - `claude-3-5-sonnet-instruct` → matches `claude-3-5-sonnet-20241022`
  - `gpt-4o-instruct` → matches `gpt-4o`
  - `mimo-v2.5-asr` → loaded from local registry

## Model Capability Detection

**Current precedence**:
1. User CLI overrides (`--modalities`)
2. Provider/native runtime metadata (LM Studio REST API)
3. Project-local registry overrides (`model-provider-x.models.jsonc`)
4. Built-in models.dev metadata (5244 models)
5. Conservative heuristics (keyword matching)

**MiMo-pool support**: 9/9 models identified
- mimo-v2-omni: text,image,audio,pdf → text
- mimo-v2-pro: text → text
- mimo-v2-tts: text → audio
- mimo-v2.5: text,image,audio,video → text
- mimo-v2.5-pro: text → text
- mimo-v2.5-tts: text → audio
- mimo-v2.5-tts-voiceclone: text → audio
- mimo-v2.5-tts-voicedesign: text → audio
- mimo-v2.5-asr: audio → text (from local registry)

## Known Risks

- models.dev data may become stale; `npm run update-models-dev` updates it
- Fuzzy matching may occasionally match wrong model variant
- Some older models (e.g., gemini-1.5-pro-latest) not in models.dev

## Suggested Next Actions

1. **Model Capability Cache**: Add caching for faster lookups
2. **More Fuzzy Matching**: Handle dot notation variants (e.g., `claude-3.5` vs `claude-3-5`)
3. **Registry Validation**: Add JSON schema validation for local registry files
4. **Provider Auto-discovery**: Auto-detect provider from model ID patterns
5. **Batch Model Lookup**: Optimize for multiple model lookups
