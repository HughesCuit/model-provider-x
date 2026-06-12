# 决策记录

## Handoff 存储

- 继续使用直接 `.handoff/` 存储，因为项目已有 `.handoff.config.json` 配置为 direct 模式。

## models.dev 集成

- 集成 models.dev 作为主要外部模型元数据源
- 通过 API 获取数据并存储为 JSON 在 `src/data/models-dev.json`
- 构建脚本复制数据到 `dist/data/` 用于包分发
- 更新脚本: `npm run update-models-dev`
- 当前: 5244 模型，144 提供商

## 模糊匹配策略

### 迭代后缀剥离
- 迭代剥离常见后缀以处理 `-instruct-gguf` 等组合
- 后缀在循环中逐个剥离直到没有更多后缀匹配
- 这处理了之前遗漏的多部分后缀

### 日期后缀支持
- 添加日期后缀支持，如 `-20241022`、`-20240620`（Anthropic 模型常见）
- 日期后缀是模型名称末尾的 8 位数字
- 搜索词和模型键都检查日期后缀

### 小数参数尺寸
- 添加小数参数尺寸支持，如 `-1.5b`、`-0.6b`
- 正则模式: `-\d+(\.\d+)?[bBmMkKtT]$`
- 处理如 `qwen3-1.5b-instruct` 的模型

### 双向匹配
- 搜索词别名通过剥离后缀生成
- 模型键别名通过剥离日期后缀生成
- 匹配检查任何搜索别名是否匹配任何模型键别名
- 这使得 `claude-3-5-sonnet` 能匹配 `claude-3-5-sonnet-20241022`

## 跨提供商搜索

- 当模型在指定提供商中未找到时，搜索所有提供商
- 这处理了用户提供商托管不同供应商模型的情况

## 提供商预设扩展

- 从 6 个扩展到 20 个提供商
- 按类别分组（本地/云/网关）
- 添加主要云提供商和网关

## 输出限制修复

- 添加 `maxOutputTokens` 字段到 `ModelInfo` 类型
- 修复 OpenCode 验证错误: "Missing key provider.*.models.*.limit.output"
- 现在生成 `limit.context` 和 `limit.output`

## 发布策略

- v0.2.7 提升为 `latest` 标签（稳定版）
- v0.2.8-beta.0 发布为 `next` 标签（开发版）
- GitHub Actions 工作流根据版本后缀自动确定标签
- 版本提升流程: beta → 稳定版 → 新 beta

## AI SDK 说明

- @ai-sdk/openai-compatible 是客户端库，不是元数据源
- models.dev 是模型元数据的正确来源

## MiMo 模型支持

- 9/9 MiMo-pool 模型已识别，具有正确能力
- `mimo-v2.5-asr` 添加到本地注册表覆盖（`model-provider-x.models.jsonc`）
- TTS 模型正确识别为 text → audio 模态
- ASR 模型正确识别为 audio → text 模态

## 本地注册表覆盖

- 本地注册文件: 项目根目录下的 `model-provider-x.models.jsonc`
- 从项目目录运行 CLI 时自动加载
- 也可通过 `--model-registry` CLI 选项指定
- 支持带注释的 JSONC 格式
