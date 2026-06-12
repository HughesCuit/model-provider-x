# 待处理任务

## 即时任务

- 监控 GitHub Actions 工作流，确认 v0.2.7 (latest) 和 v0.2.8-beta.0 (next) 发布成功
- 验证 npm 包是否正确发布，dist-tags 是否正确

## 下一个功能

### 1. 模型能力缓存
- 添加内存缓存用于模型查询
- 缓存键: providerId + modelId
- 缓存失效: 基于 TTL（如 1 小时）
- 预期改进: 加速重复查询

### 2. 增强模糊匹配
- 处理点号变体（如 `claude-3.5` vs `claude-3-5`）
- 处理版本分隔符（如 `gpt-4o-2024-05-13` vs `gpt-4o`）
- 考虑添加 Levenshtein 距离用于拼写容错
- 添加可配置的匹配严格度级别

### 3. 注册表验证
- 为 `model-provider-x.models.jsonc` 添加 JSON schema 验证
- 提供有用的错误消息
- 支持 JSONC 格式的注释（已使用 jsonc-parser）
- 添加 CLI 命令验证注册文件

### 4. 提供商自动发现
- 根据模型 ID 模式自动检测提供商
- 示例:
  - `gpt-*` → OpenAI
  - `claude-*` → Anthropic
  - `gemini-*` → Google
  - `deepseek-*` → DeepSeek
- 允许用户覆盖自动检测

### 5. 批量模型查询
- 优化多模型查询
- 添加 `resolveMultipleModelRegistryMetadata()` 函数
- 在查询间共享注册表加载
- 预期改进: 加速 CLI 启动

### 6. 注册表合并策略
- 支持合并多个本地注册文件
- 优先级: 最后一个文件优先
- 用例: 团队共享 + 个人覆盖
- CLI: `--model-registry team.jsonc --model-registry personal.jsonc`

## 验证场景

- 真实 LM Studio 在 `localhost:1234`:
  - 验证原生 REST 增强工作正常
  - 验证 models.dev 回退用于未知变体
  - 验证 OpenCode JSON 包含 modalities/tool/reasoning/context/output
- 真实 mimo-pool 在 Docker:
  - 验证 `/v1/models` 发现工作正常
  - 验证 9/9 模型已识别
  - 验证 TTS 模型正确识别为 text → audio
  - 验证多模态模型正确识别
  - 验证 ASR 模型从本地注册表加载
  - 验证 limit.output 已包含
- 注册表覆盖路径:
  - 验证项目本地 `model-provider-x.models.jsonc`
  - 验证可重复的 `--model-registry <path>`
  - 验证 `--modalities` 保持最高优先级

## 技术债务

- 为 `modelAliasesForLookup()` 函数添加单元测试
- 为完整 CLI 工作流添加集成测试
- 在 README 中记录模糊匹配算法
- 添加模型查询性能基准
