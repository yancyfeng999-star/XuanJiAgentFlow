# 璇玑 AgentFlow 2.0 完整交付设计

## 1. 目标与验收边界

将当前原型收敛为 macOS 首发的本地分布式 AI 任务控制台。软件代码、配置界面、自动化测试、Tauri 应用构建和离线多节点闭环必须完成；服务器地址、SSH 用户、私钥路径、模型凭据和 Node Token 由用户在软件内填写，不作为编码前置条件。

真实远程服务器执行属于发布前实机验收。无外部服务器时，使用与正式协议一致的 Fake Node 覆盖多节点、失败、取消、离线、恢复和产物回传。

## 2. 最终架构

### Tauri 桌面层

- 启动、健康检查和停止 PyInstaller Coordinator sidecar。
- 动态选择 Coordinator 端口并注入前端。
- 提供项目目录和 SSH 私钥文件选择。
- 按任务建立 SSH 本地端口转发，任务结束、取消、超时或应用退出时清理。
- 首发只保证 macOS。

### React 单画布

- 创建项目、输入目标、调用 Planner、编辑和审核 DAG。
- 管理 Planner、Hermes 和远程节点配置。
- 首次使用设置主密码，后续启动解锁本地加密凭据文件。
- 通过 REST 加载快照，通过带递增 event_id 的 WebSocket 增量更新运行状态。
- 展示日志、产物、节点状态，并支持暂停、恢复、取消、重试和跳过。
- 新链路通过后删除旧 pages、panels 和旧 API 客户端。

### Local Coordinator

Coordinator 是唯一业务后端，按模块拆分为：

- `planner`：DeepSeek/MiMo OpenAI 兼容调用、结构化解析、DAG 校验和一次自动修复。
- `scheduler`：就绪判断、能力过滤、节点评分、并发限制和状态转换。
- `execution`：后台 Run、幂等派发、轮询、日志同步、取消、重试、产物收集和恢复。
- `nodes`：节点注册、健康检查、协议客户端及临时隧道抽象。
- `artifacts`：安全路径、清单、文件大小和 SHA-256 校验。
- `security`：Argon2id 派生密钥，AES-256-GCM 加密凭据文件；主密码和派生密钥只存在内存。
- `api`：结构化 REST 错误与可补发 WebSocket 事件。

SQLite 只保存项目、工作流、任务、运行、尝试、节点、产物和事件等非敏感元数据。

### Hermes Node Agent

- 远程自动部署只保证 Ubuntu/Debian 和 systemd。
- 服务只监听远程 `127.0.0.1`，不直接暴露公网 API。
- Bearer Token 认证；Token 由加密凭据库保存。
- 封装 Hermes `/v1/runs` 生命周期，持久化任务状态、日志与产物清单。
- 取消只有在 Hermes 确认停止后才能标记为 cancelled；通信失败进入明确错误状态。

## 3. 数据流

1. 用户创建 Project 并提交目标。
2. Planner 生成结构化 Workflow，执行 Schema、依赖和无环校验。
3. 用户编辑并审核，生成不可变 Workflow 版本。
4. Coordinator 创建 Run 和 TaskAttempt，HTTP 请求立即返回。
5. Scheduler 仅选择依赖成功、输入可用且能力匹配的任务。
6. 远程任务派发前建立临时 SSH 隧道；本机任务直接连接本机 Node Agent。
7. Node Agent 使用幂等键创建 Hermes Run，Coordinator 持久化每次状态变化和事件。
8. 完成后获取产物清单与文件，通过安全路径、大小和哈希校验后写入项目目录。
9. 只有产物全部通过验证，任务才能 success 并解锁下游。
10. 所有任务进入终态后生成 `deliverables/manifest.json`，Run 进入终态。

## 4. 状态与恢复

任务状态：

`pending -> ready -> dispatching -> running -> collecting -> success`

异常分支包括 `dispatch_failed`、`failed`、`retry_wait`、`artifact_failed`、`blocked`、`cancelling`、`cancelled` 和 `skipped`。

恢复规则：

- Coordinator 启动时扫描所有非终态 Run。
- 对存在远端 Run ID 的 Attempt 重新建立临时隧道并查询真实状态。
- 无法连接的节点使任务进入 blocked，不伪造失败或成功。
- 派发使用 `(run_id, task_id, attempt)` 幂等键。
- WebSocket 客户端用 `last_event_id` 补发中断期间事件。
- 隧道和子进程必须有所有权记录，异常退出后清理孤儿资源。

## 5. 安全设计

- 首次启动设置应用主密码。
- 使用 Argon2id 加随机盐派生 256 位密钥，凭据使用 AES-256-GCM 和独立 nonce 加密。
- 加密文件记录格式版本、KDF 参数、盐、nonce 和密文，不记录明文凭据或密码验证答案。
- 主密码错误通过 AEAD 验证失败判断；不回显敏感内容。
- SSH 启用 known_hosts 校验，不使用 `StrictHostKeyChecking=no`。
- 所有远程参数以 argv 或安全转义传递，禁止拼接 Token 到日志或可见命令。
- SSH 私钥只保存本机路径。
- Node Agent 仅绑定远程回环地址，通过按任务临时 SSH 隧道访问。

## 6. API 边界

Coordinator 提供：

- 项目与工作流创建、规划、更新、校验和审核；
- Run 创建、查询、开始、暂停、恢复、取消；
- Task 重试和跳过；
- 节点创建、更新、删除、发现、诊断和部署；
- 主密码初始化、解锁、锁定和凭据更新；
- Artifact 列表和安全下载；
- 带 `event_id` 的运行 WebSocket。

所有错误使用稳定错误码、用户可读消息和可选 details，不返回裸字符串。

## 7. 测试和交付门槛

### 后端

- 领域模型、DAG、状态机、节点评分、规划器解析、安全凭据库、SQLite 和 Artifact 单元测试。
- Fake Node 覆盖成功、失败、延迟、取消、离线、幂等和错误产物。
- 集成测试覆盖多节点并行、重试、暂停恢复、Coordinator 重启和事件补发。

### 前端

- Shell、DAG 编辑、审核门禁、配置表单、主密码解锁、事件更新、日志和 Artifact 浏览测试。
- Playwright 跑通输入、规划、编辑、审核、执行、取消、重试和最终产物。

### 桌面端

- `cargo check`、Tauri build 和 sidecar 启停测试。
- 生成可启动的 macOS `.app`；无签名证书时允许本地未签名构建，但必须明确记录。
- DMG、代码签名、公证和真实远程服务器验收若缺少外部凭据，只能列为外部发布阻塞，不得伪造通过。

### 统一验证

`scripts/verify-all.sh` 必须创建或使用项目隔离环境，依次运行后端、Node Agent、前端、E2E、Python 编译、Cargo 和生产构建检查，并在任何失败时返回非零退出码。

## 8. 迁移与清理

- 先建立新闭环，再删除 `backend/main.py` 及旧 planner、scheduler、executor、monitor、collector、storage。
- 删除前端旧 pages、panels、旧 API 客户端及无效样式。
- 修正 `.gitignore`，只忽略明确的运行产物目录，不误伤源码目录。
- README、CURRENT_STATE、用户指南、节点部署和故障排除文档只记录经测试验证的能力。

## 9. 实施顺序

1. 修复测试环境与统一验证基线。
2. 完成安全凭据库、Planner、Scheduler 和 Node 协议。
3. 完成 Execution Manager、恢复、产物回传和完整 Coordinator API。
4. 完成前端真实数据接入、工作流编辑、配置、监控和产物界面。
5. 完成 Tauri sidecar 与按任务临时 SSH 隧道。
6. 完成 E2E、生产构建、旧代码清理和文档。

每阶段以自动化测试通过为进入下一阶段的条件；不得用 Stub 成功替代真实协议行为。
