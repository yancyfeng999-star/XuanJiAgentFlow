# 璇玑 AgentFlow 3.0 完整收口设计

> 日期：2026-07-29
>
> 状态：待用户审阅
>
> 性质：现有功能完成版，不增加新产品能力

## 1. 目标

璇玑 3.0 不扩展产品范围。它只完成、验证、统一或删除 2.0 已经承诺的能力，将当前“控制面可验证版本”收口为“真实业务闭环可交付版本”。

3.0 的完成定义是：

> 用户通过同一个桌面应用创建项目、规划并审核 DAG，将任务分配给本机或远程 Hermes；上游真实文件可靠传给下游，下游确实读取这些文件；状态、日志、取消、恢复和最终产物均可追溯；应用可以独立安装运行。

## 2. 范围边界

### 2.1 保留并完成

- 创建项目及选择真实项目目录
- Planner 生成结构化 DAG
- 任务编辑、增删、连线、位置保存、审核和版本冻结
- 本机与远程 Hermes 节点保存、诊断、部署和状态更新
- 节点能力匹配、容量控制和多节点调度
- Run 启动、暂停调度、恢复、取消、重试和跳过
- Coordinator 重启恢复和远端状态对账
- 实时事件、真实日志和断线补发
- 上游产物到下游任务的输入传递
- 产物下载、大小与 SHA-256 校验
- 最终交付清单和项目目录
- 本地凭据加密、SSH 主机校验和 Coordinator 本地会话认证
- Tauri sidecar 生命周期、独立 `.app` 和 DMG
- 用户指南、节点部署、排障和真实状态文档

### 2.2 不进入 3.0

- 新执行器或 Codex、WorkBuddy 适配
- 新模型供应商专属功能
- 新画布节点类型
- 工作流模板市场
- 云端控制中心
- 多租户、团队权限和商业计费
- Windows 或 Linux 桌面版本
- Kubernetes、消息队列或运行中跨节点迁移

### 2.3 功能处置规则

每项现有能力必须得到一种明确结论：

1. **完成**：真实实现、自动化测试、真实环境证据和一致文档全部具备。
2. **删除**：删除不再保留的代码、界面、依赖、测试和文档承诺。
3. **外部阻塞**：仅限签名证书、真实账号或真实服务器等仓库外部条件；必须保留本地协议级替代验证。

不允许继续存在“界面可见但行为不真实”“Mock 通过即宣称生产通过”或“文档完成度高于证据”的状态。

## 3. 产品语义

### 3.1 DAG 边必须同时表达顺序和数据依赖

2.0 中的 `dependencies[]` 已能控制执行顺序，但任务派发只发送当前任务 Prompt。3.0 要求每条依赖边同时产生输入引用。

依赖任务成功后，Coordinator 从其已验证产物中生成不可变输入清单。下游任务只有在输入清单完整、文件可访问且哈希一致时才能进入 `ready`。

### 3.2 暂停的准确含义

现有暂停只停止 Coordinator 派发和状态推进，不保证 Hermes 远端进程冻结。3.0 统一将此能力命名为“暂停调度”：

- 不再派发新任务
- 已运行任务继续执行
- Coordinator 可以继续采集必要的终态，避免远端状态丢失
- 恢复后继续派发下游任务

不在 3.0 中增加远端进程冻结能力。

### 3.3 重试语义

- `max_attempts` 是包含首次执行在内的最大尝试次数
- 协议错误和产物校验错误默认需要人工重试
- 短暂连接失败、超时和节点离线允许自动退避重试
- 每次重试产生新的 `TaskAttempt` 和新的幂等键
- 已验证成功的 Attempt 不得被后续失败覆盖

### 3.4 跳过语义

- 只有未成功的任务可跳过
- 下游是否允许继续由工作流审核时确定
- 如果下游声明必须输入来自被跳过任务，则进入 `blocked`
- 跳过不能伪造空产物

## 4. 统一任务输入与输出契约

### 4.1 TaskDispatch

Coordinator 与 Node Agent 的创建任务协议扩展为：

```json
{
  "idempotency_key": "run:task:attempt",
  "instruction": "任务 Prompt",
  "project_id": "project-id",
  "run_id": "run-id",
  "task_id": "task-id",
  "inputs": [
    {
      "source_task_id": "research",
      "path": "inputs/research/report.md",
      "size": 1024,
      "sha256": "..."
    }
  ],
  "output_policy": {
    "mode": "discover",
    "expected": []
  }
}
```

该结构是对现有 `goal + idempotency_key` 的收口，不引入新的用户功能。

### 4.2 输入传输

- Coordinator 保存所有上游产物的权威副本
- 派发前为目标节点建立任务工作目录
- 本机和远程节点使用同一上传协议
- Node Agent 先写入临时文件，完成大小和哈希验证后原子替换
- 输入目录只读，Hermes 工作目录与输入目录分离
- 输入失败时任务不得启动

不允许在 Prompt 中只写一个 Coordinator 本机绝对路径来冒充跨节点传输。

### 4.3 输出策略

保留现有 `expected_outputs`，但明确两种既有使用方式：

- `strict`：实际文件集合必须和声明一致
- `discover`：必须存在标准主产物 `result.md`，并允许收集任务工作目录中的其他安全文件

Planner 默认生成 `discover` 任务。固定交付文件的任务可以使用 `strict`。

Node Agent 不再只保存 `hermes-output.md`。Hermes 最终文本统一写入 `result.md`，并扫描允许的工作目录文件形成清单。

### 4.4 内容级验收

3.0 必须有一条固定验收：

1. 上游任务生成随机验收标识
2. 标识只存在于上游产物中，不写入下游 Prompt
3. 下游任务读取输入文件并在最终结果中引用该标识
4. 测试断言最终文件包含该标识

该验收用于证明数据依赖，不只是执行顺序。

## 5. Planner 收口

### 5.1 结构化输出

- 将完整 Workflow JSON Schema 提供给 Planner
- 支持 OpenAI 兼容 `response_format` 时使用 JSON Schema
- 不支持时在系统提示中嵌入最小完整字段说明
- 保留最多一次自动修复
- 修复请求必须包含明确校验错误，而不是只说“输出无效”

### 5.2 规范化

Planner 输出进入数据库前执行：

- ID 安全字符规范化
- Workflow 和 Task 绑定修正
- DAG 缺失依赖和环检查
- UI 默认位置生成
- 输出策略默认值补全
- 执行策略和重试策略边界检查

规范化不能静默删除任务或依赖。

### 5.3 真实 Provider 验收

自动化测试继续使用 MockTransport；发布验收使用用户提供的真实 DeepSeek 或 MiMo 账号完成：

- 正常规划
- 非法输出修复
- 401
- 超时
- 空响应
- 大型但在限制内的工作流

真实账号未提供时，只能标记为外部验收阻塞。

## 6. Node Agent 与节点生命周期收口

### 6.1 固定协议边界

端口和职责统一为：

```text
Hermes API Server    127.0.0.1:8642
Xuanji Node Agent    127.0.0.1:8765
Coordinator          通过本机连接或 SSH 隧道访问 Node Agent
```

Coordinator 永远不直接把 Hermes `/v1/runs` 当作 Node Agent `/v1/tasks` 使用。

### 6.2 远程部署

现有 Provisioning 流程补齐为：

1. SSH 主机指纹确认
2. 系统和 Python 版本检查
3. Hermes 安装或版本检查
4. Hermes API 配置及健康检查
5. Node Agent 包上传
6. 隔离虚拟环境安装
7. systemd 用户或系统服务安装
8. Node Agent 仅绑定 `127.0.0.1`
9. Token 通过安全输入或权限受限配置写入
10. 经临时隧道验证 `/v1/health`、`/v1/capabilities` 和最小任务

任一步失败都返回结构化步骤结果，不继续宣称部署成功。

### 6.3 节点状态

节点状态由系统诊断产生，不要求用户手工填写：

```text
unknown → diagnosing → online
                    ↘ degraded
                    ↘ offline
```

诊断成功后持久化：

- status
- models、tools、tags
- max_concurrency
- last_seen_at
- latency

调度器只能使用最近健康检查仍有效的 `online` 节点。

### 6.4 Hermes 生命周期限制

Node Agent 持久保存 Xuanji Task 与 Hermes Run 映射。Hermes 重启或内存态 Run 丢失时：

- 已有完整产物：重新校验后恢复成功
- 没有终态证据：进入明确的 `orphaned`/映射错误表示
- 不允许凭 Node Agent 本地旧状态直接伪造成功

如果现有状态枚举无法表达该情况，使用结构化错误保持 `blocked`，不增加用户可见的新功能。

## 7. Execution Manager 收口

### 7.1 派发前置条件

任务进入 `ready` 必须满足：

- 工作流已审核
- 所有依赖满足成功或允许跳过条件
- 输入清单生成完毕
- 输入文件仍通过大小和哈希验证
- 至少一个节点在线且能力匹配
- Run 未取消

### 7.2 自动超时与重试

- 使用持久化时间戳计算超时，不依赖单进程内计时器
- Coordinator 重启后继续计算剩余时间
- 到期先请求真实取消
- 取消确认后才创建下一 Attempt
- 自动重试使用 `delay_seconds` 退避
- 达到最大尝试次数后 Run 进入可解释的 `blocked`

### 7.3 日志

- Node Agent 接入 Hermes SSE 事件
- 原始事件写入任务 `logs.jsonl`
- Coordinator 按 offset 拉取并追加本地副本
- WebSocket 只推送已持久化事件
- UI 断线后通过 `event_id` 和日志 offset 补发
- 日志必须脱敏，不记录 Token、API Key 或完整认证头

### 7.4 恢复

恢复覆盖：

- Coordinator 重启
- Node Agent 重启
- Hermes 重启
- SSH 隧道中断
- 文件下载中断
- 产物已下载但数据库事务未提交

恢复原则是向真实节点对账；无法证明成功时进入 `blocked`，不推断成功。

## 8. 桌面端和 UI 收口

### 8.1 画布

- 节点拖动后保存 `ui_position`
- 增删任务和连线继续使用现有 Workflow 更新接口
- 审核后禁止修改节点、边和位置
- 画布只显示真实 Task，不增加新节点类型

### 8.2 任务编辑器

补齐现有领域字段的编辑能力：

- agent_type
- execution_policy
- retry_policy
- expected_outputs / output mode
- 依赖仍通过画布连线维护

这是完成现有模型，不是增加产品功能。

### 8.3 节点管理

- 保存节点后自动诊断
- 展示真实状态、能力、最后在线时间和并发
- Provision 完成后重新诊断并更新节点
- 未知 SSH 指纹展示确认信息，不自动接受
- 只有在线节点计入顶部栏

### 8.4 运行和产物

- UI 发起的同一个 Run 必须贯穿监控和产物展示
- 按任务显示 Attempt、节点、真实日志、错误和产物
- “暂停”统一改为“暂停调度”
- 无效的控制按钮按真实状态禁用
- 产物下载失败显示结构化原因

### 8.5 启动与本地认证

- Tauri 每次启动生成高熵会话 Token
- Token 仅传给本次 Coordinator 和 WebView
- REST 与 WebSocket 都要求会话认证
- 浏览器开发模式使用明确的开发 Token
- Coordinator 继续只绑定 `127.0.0.1`

不在 3.0 中引入用户账号体系。

## 9. 测试与验收

### 9.1 自动化层级

| 层级 | 必须证明 |
|---|---|
| 单元测试 | Schema、状态机、路径、哈希、重试、超时、脱敏 |
| 协议测试 | Coordinator ↔ Node Agent 请求响应兼容 |
| 集成测试 | Fake Hermes + 真实 Node Agent + Coordinator |
| E2E | 同一个 UI Run 完成规划、审核、执行、日志和产物 |
| 本机实测 | 真实 Planner + 真实本机 Hermes |
| 远程实测 | 全新 Ubuntu/Debian 节点部署、重启和执行 |
| 桌面验证 | `.app` 和 DMG 在无开发环境条件下运行 |

### 9.2 必须新增的回归场景

- 上游唯一内容被下游读取
- 输入上传中断和哈希错误
- Planner 声明输出与 Node 输出策略一致
- UI 新建节点自动转为 online
- Provision 安装的是 Node Agent，不是只启动 Hermes
- 两台节点各执行至少一个任务
- UI 发起的 Run 就是最终断言的 Run
- Hermes、Node Agent、Coordinator 分别重启
- 自动超时后真实取消和重试
- 本地未认证请求被拒绝
- 日志不含测试注入的秘密值

### 9.3 统一门禁

`scripts/verify-all.sh` 最终必须运行：

- Python 隔离环境建立
- Backend tests
- Node Agent tests
- 前端 tests、lint、TypeScript 和 Vite build
- Coordinator/Node Agent 协议集成
- Playwright E2E
- Cargo test/check
- Sidecar 构建和校验
- Tauri `.app`/DMG 构建或明确的签名外部阻塞
- 生产依赖漏洞门禁
- Git 状态和构建产物清单

跳过项必须显示 `SKIPPED`，不得输出全量通过结论。

## 10. 发布与仓库收口

### 10.1 依赖和遗留清理

- 删除未被当前 AppShell 使用的旧 Sidebar、TopBar 和 Router 依赖
- 清除高危生产依赖漏洞
- 删除死代码、废弃错误枚举和误导性文档
- 不做与本计划无关的重构

### 10.2 构建产物

每个发布候选记录：

- Git commit
- 应用版本
- 架构
- Sidecar SHA-256
- `.app` SHA-256
- DMG SHA-256
- 测试摘要
- 签名、公证和 Staple 状态
- 真实 Planner/Hermes/远程节点验收状态

构建目录和安装包不作为源代码提交，发布清单保存其校验信息。

### 10.3 文档唯一事实源

完成后更新：

- `README.md`
- `docs/CURRENT_STATE.md`
- `docs/USER_GUIDE.md`
- `docs/NODE_DEPLOYMENT.md`
- `docs/TROUBLESHOOTING.md`
- `docs/HERMES_INTEGRATION.md`

根目录 01–09 历史设计文档明确标记历史属性。完成度只以 `CURRENT_STATE`、验收矩阵和发布清单为准。

## 11. 六条收口主线

### 主线 A：功能账本和证据矩阵

建立一张现有功能清单，逐项记录 UI、API、领域模型、实现、测试、真实验收和文档状态。它是 3.0 范围控制工具，不是新功能。

### 主线 B：Planner 与 Workflow 契约

完成真实结构化规划、规范化、输出策略和审核冻结。

### 主线 C：输入、执行、日志和产物

完成真正的数据依赖、跨节点输入、自动超时重试、SSE 日志和内容级验收。

### 主线 D：Node Agent 与真实节点

统一端口与协议，完成 Node Agent 部署、节点自动诊断、能力更新和远程实机验收。

### 主线 E：桌面、安全和 UI

补齐现有字段编辑、画布位置、同 Run 监控、本地认证和准确状态语义。

### 主线 F：发布与文档

清理遗留依赖，生成可追溯安装包，完成真实状态文档和外部阻塞清单。

## 12. 阶段门槛

### Phase 0：基线冻结

- 建立功能验收矩阵
- 记录当前测试和安装包证据
- 确认所有 3.0 项均来自现有功能

退出条件：不存在未归类的现有功能。

### Phase 1：协议和语义

- 完成 TaskDispatch、输入上传、输出策略
- 完成 Planner Schema
- 完成内容级 Fake Hermes 集成

退出条件：下游能读取上游唯一内容。

### Phase 2：执行可靠性

- 完成日志、超时、重试和恢复
- 覆盖三类进程重启

退出条件：故障后状态可解释且不伪造成功。

### Phase 3：节点闭环

- 完成 Node Agent 安装和自动诊断
- 完成本机真实 Hermes
- 完成一台远程 Ubuntu/Debian

退出条件：UI 可从零接入并执行真实节点。

### Phase 4：桌面收口

- 完成画布、编辑器、运行监控和本地认证
- 同一个 UI Run 完成最终验收

退出条件：不通过 API 辅助创建第二个 Run。

### Phase 5：发布候选

- 清理遗留代码和依赖漏洞
- 全量门禁
- 独立 `.app` 和 DMG
- 文档一致性审查

退出条件：除签名、公证或外部账号外无未完成项。

## 13. 最终验收场景

发布候选必须完成一次录屏或结构化记录：

1. 安装并启动应用
2. 初始化并解锁凭据库
3. 配置真实 Planner
4. 添加并诊断本机节点
5. 添加一台远程节点并完成 Provision
6. 创建真实项目目录
7. Planner 生成至少三任务 DAG
8. 编辑、连线、移动并审核
9. 执行同一个 Run
10. 两个节点均承担任务
11. 上游唯一内容出现在下游最终产物
12. 查看真实日志和产物
13. 中途重启 Coordinator 并恢复
14. 验证最终 `deliverables/manifest.json`
15. 验证文件大小和 SHA-256

任一步失败，3.0 不得标记完成。

## 14. 风险与控制

| 风险 | 控制 |
|---|---|
| 把协议完善误变成新功能 | 只完善现有 UI/API/模型承诺 |
| Fake 环境掩盖真实集成错误 | 增加 Fake Hermes + 真 Node Agent 和实机验收 |
| 跨节点文件传输扩大攻击面 | 任务级目录、原子写入、大小和哈希校验 |
| 自动重试造成重复执行 | Attempt 幂等键和远端状态对账 |
| SSH 指纹流程阻塞自动部署 | 明确用户确认步骤，不降低校验 |
| 本地 API 被其他进程调用 | Tauri 会话 Token + loopback |
| 文档再次高于完成度 | 验收矩阵和发布清单作为唯一证据 |

## 15. 3.0 完成定义

只有同时满足以下条件才能发布 3.0：

- 所有保留功能在验收矩阵中为完成
- 无未解释的半实现代码或按钮
- 自动化门禁全部通过
- 本机真实 Planner/Hermes 内容级闭环通过
- 一台真实远程节点部署与执行通过
- 三类进程重启和恢复通过
- UI 同 Run 验收通过
- 真实日志、输入和产物链可追溯
- 本地 API 有会话认证
- 无高危生产依赖漏洞
- `.app` 和 DMG 可独立运行
- 文档与证据完全一致
- Apple 签名、公证等外部项有明确状态，不伪造完成
