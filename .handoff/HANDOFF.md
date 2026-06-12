# Handoff: model-provider-x

Saved: 2026-06-12 15:15 CST

## Current State

`model-provider-x` is a TypeScript CLI/TUI package for wiring local and hosted model providers into OpenCode, Codex, and Claude Code.

Current branch is `main` at `b62f2fc` (`Release model-provider-x 0.2.7-beta.0`). `main` is aligned with `origin/main`, and the current package version is `0.2.7-beta.0`.

The code working tree is clean relative to HEAD.

## Completed Work This Session

### 1. models.dev Registry Integration
- Added `scripts/fetch-models-dev.ts` to fetch and transform models.dev API data
- Created `src/data/models-dev.json` with 5218 models from 142 providers
- Replaced hardcoded single-model registry with full models.dev data
- Added fuzzy matching for model variants
- Implemented cross-provider search

### 2. Provider Presets Expansion
- Expanded from 6 to 20 providers
- Added cloud providers: OpenAI, Anthropic, Google, DeepSeek, Mistral, Groq, Together, Fireworks, xAI, Cohere, Alibaba
- Added gateways: OpenRouter, Requesty, SiliconFlow, NVIDIA NIM
- Grouped providers by category (local/cloud/gateway)

### 3. Output Limit Fix
- Added `maxOutputTokens` field to `ModelInfo` type
- Fixed OpenCode validation error: "Missing key provider.*.models.*.limit.output"
- Now generates both `limit.context` and `limit.output`

### 4. Releases
- v0.2.6 (latest): models.dev integration, provider expansion, output limit fix
- v0.2.7-beta.0 (next): development version

## Verification Evidence

- `npm run build` passed.
- `npm test` passed with 12 files / 96 tests.
- npm publish succeeded for both versions.
- OpenCode config generation now includes `limit.output`.

## Model Capability Detection

**Current precedence**:
1. User CLI overrides (`--modalities`)
2. Provider/native runtime metadata (LM Studio REST API)
3. Project-local registry overrides (`model-provider-x.models.jsonc`)
4. Built-in models.dev metadata (5218 models)
5. Conservative heuristics (keyword matching)

**MiMo-pool support**: 8/9 models auto-identified
- mimo-v2-omni: text,image,audio,pdf → text
- mimo-v2-pro: text → text
- mimo-v2-tts: text → audio
- mimo-v2.5: text,image,audio,video → text
- mimo-v2.5-pro: text → text
- mimo-v2.5-tts: text → audio
- mimo-v2.5-tts-voiceclone: text → audio
- mimo-v2.5-tts-voicedesign: text → audio
- mimo-v2.5-asr: NOT FOUND (needs local registry)

## Known Risks

- ASR model (`mimo-v2.5-asr`) not in models.dev data
- models.dev data may become stale; `npm run update-models-dev` updates it
- Fuzzy matching may occasionally match wrong model variant

## Suggested Next Actions

1. Add mimo-pool ASR model entry to local registry override
2. Consider adding more aggressive fuzzy matching
3. Monitor models.dev for schema changes
4. Consider adding a model capability cache for faster lookups
