# 思考模型

璇玑支持多个思考模型配置。第一阶段提供 OpenAI Responses 与 Chat Completions。

- 凭证按 profile 独立存储，API 只返回 `credential_configured`
- 旧 `planner` 配置会迁移为默认 Chat profile，并复用原 credential key
- 「测试连接」只有用户点击时才会发请求，并可能产生用量
- 历史工作流保留 provider/model/`thinking_model_id` 快照
