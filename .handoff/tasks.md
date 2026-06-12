# Pending Tasks

## Immediate

- Monitor GitHub Actions workflow for v0.2.7 (latest) and v0.2.8-beta.0 (next) publish
- Verify npm packages are published correctly with correct dist-tags

## Next Features

### 1. Model Capability Cache
- Add in-memory cache for model lookups
- Cache key: providerId + modelId
- Cache invalidation: TTL-based (e.g., 1 hour)
- Expected improvement: faster repeated lookups

### 2. Enhanced Fuzzy Matching
- Handle dot notation variants (e.g., `claude-3.5` vs `claude-3-5`)
- Handle version separators (e.g., `gpt-4o-2024-05-13` vs `gpt-4o`)
- Consider adding Levenshtein distance for typo tolerance
- Add configurable matching strictness levels

### 3. Registry Validation
- Add JSON schema validation for `model-provider-x.models.jsonc`
- Provide helpful error messages for invalid entries
- Support comments in JSONC (already using jsonc-parser)
- Add CLI command to validate registry files

### 4. Provider Auto-discovery
- Auto-detect provider from model ID patterns
- Examples:
  - `gpt-*` → OpenAI
  - `claude-*` → Anthropic
  - `gemini-*` → Google
  - `deepseek-*` → DeepSeek
- Allow user to override auto-detection

### 5. Batch Model Lookup
- Optimize for multiple model lookups
- Add `resolveMultipleModelRegistryMetadata()` function
- Share registry loading across lookups
- Expected improvement: faster CLI startup

### 6. Registry Merge Strategy
- Support merging multiple local registry files
- Priority: last file wins
- Use case: team-shared + personal overrides
- CLI: `--model-registry team.jsonc --model-registry personal.jsonc`

## Validation Scenarios To Keep

- Real LM Studio on `localhost:1234`:
  - verify native REST enrichment works
  - verify models.dev fallback for unknown variants
  - verify OpenCode JSON includes modalities/tool/reasoning/context/output
- Real mimo-pool on Docker:
  - verify `/v1/models` discovery works
  - verify 9/9 models identified
  - verify TTS models correctly identified as text → audio
  - verify multimodal models correctly identified
  - verify ASR model loaded from local registry
  - verify limit.output is included
- Registry override path:
  - verify project-local `model-provider-x.models.jsonc`
  - verify repeatable `--model-registry <path>`
  - verify `--modalities` remains highest priority

## Technical Debt

- Add unit tests for `modelAliasesForLookup()` function
- Add integration tests for full CLI workflow
- Document fuzzy matching algorithm in README
- Add performance benchmarks for model lookups
