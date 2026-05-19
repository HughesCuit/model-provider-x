# AGENTS.md — model-provider-x

## Project

OpenCode custom configuration tooling. Generates, validates, and manages `opencode.json` / `opencode.jsonc` setups.

## Environment

- OpenCode global config: `~/.config/opencode/opencode.jsonc`
- OpenCode legacy config: `~/.opencode/`
- Plugin package: `@opencode-ai/plugin`
- Local LLM provider: `unsloth` at `http://localhost:8888/v1`
- Models: Qwen3.6-35B, Qwen3.5-9B, GPT-OSS-20B, Gemma-4-E2B

## Commands

- Use `customize-opencode` skill when editing OpenCode's own config files
- Use `skill` tool to discover available skills
- Restart OpenCode after plugin changes

## Conventions

- Prefer `opencode.jsonc` (with comments) over `opencode.json`
- Plugin specs use git-backed format: `name@git+https://...`
- Verify plugin loads by asking OpenCode to list skills
