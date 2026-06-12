# 交接: model-provider-x

保存时间: 2026-06-12 19:55 CST

## 当前状态

`model-provider-x` 是一个 TypeScript CLI/TUI 包，用于将本地和托管模型提供商接入 OpenCode、Codex 和 Claude Code。

当前分支为 `main`，位于 `027cc5b`（`docs: update handoff with v0.2.8-beta.0 context and next TODOs`）。`main` 与 `origin/main` 同步，当前包版本为 `0.2.8-beta.0`。

代码工作树相对于 HEAD 是干净的。

## 本次会话完成的工作

### 1. MiMo-pool ASR 模型本地注册表
- 创建 `model-provider-x.models.jsonc`，定义 mimo-v2.5-asr 元数据
- 类型: ASR，模态: audio → text
- 所有 9/9 MiMo-pool 模型现在都有完整元数据

### 2. 模糊匹配改进
- 迭代后缀剥离，处理 `-instruct-gguf` 等组合后缀
- 日期后缀支持（Anthropic 模型：`-20241022`、`-20240620`）
- 小数参数尺寸支持（`-1.5b`、`-0.6b`）
- 双向模糊匹配（搜索词 ↔ 模型键）
- 新增 8 个单元测试
- 总测试数: 104（原 96）

### 3. models.dev 数据更新
- 模型数: 5218 → 5244
- 提供商数: 142 → 144
- mimo-v2.5-asr 仍未收录（由本地注册表覆盖）

### 4. 版本发布
- v0.2.7 (latest): 从 v0.2.7-beta.0 提升为正式版
- v0.2.8-beta.0 (next): 当前开发版本

### 5. Handoff 协议更新
- 更新到 v1.2.0
- 新增 `--lang` 语言控制
- 新增 `--verbosity` 详细级别控制

## 验证证据

- `npm run build` 通过
- `npm test` 通过：12 文件 / 104 测试
- 真实模型匹配验证：
  - `claude-3-5-sonnet` → 匹配 `claude-3-5-sonnet-20241022`
  - `claude-3-5-sonnet-instruct` → 匹配 `claude-3-5-sonnet-20241022`
  - `gpt-4o-instruct` → 匹配 `gpt-4o`
  - `mimo-v2.5-asr` → 从本地注册表加载

## 模型能力检测

**当前优先级**:
1. 用户 CLI 覆盖（`--modalities`）
2. 提供商/原生运行时元数据（LM Studio REST API）
3. 项目本地注册表覆盖（`model-provider-x.models.jsonc`）
4. 内置 models.dev 元数据（5244 模型）
5. 保守启发式（关键词匹配）

**MiMo-pool 支持**: 9/9 模型已识别
- mimo-v2-omni: text,image,audio,pdf → text
- mimo-v2-pro: text → text
- mimo-v2-tts: text → audio
- mimo-v2.5: text,image,audio,video → text
- mimo-v2.5-pro: text → text
- mimo-v2.5-tts: text → audio
- mimo-v2.5-tts-voiceclone: text → audio
- mimo-v2.5-tts-voicedesign: text → audio
- mimo-v2.5-asr: audio → text（来自本地注册表）

## 已知风险

- models.dev 数据可能过期；`npm run update-models-dev` 可更新
- 模糊匹配可能偶尔匹配错误的模型变体
- 某些旧模型（如 gemini-1.5-pro-latest）不在 models.dev 中

## 建议的下一步行动

1. **模型能力缓存**: 添加内存缓存加速重复查询
2. **增强模糊匹配**: 处理点号变体（`claude-3.5` vs `claude-3-5`）
3. **注册表验证**: 添加 JSON schema 验证本地注册文件
4. **提供商自动发现**: 根据模型 ID 自动检测提供商
5. **批量模型查询**: 优化多模型查询性能
