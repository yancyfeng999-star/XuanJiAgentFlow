# 璇玑 3.0 既有功能收口实施计划

> 状态：执行中  
> 原则：不扩展产品边界；每个既有入口必须达到“真实可用、可验证、可恢复”，否则删除误导入口或明确标记外部阻塞。

## 1. 完成定义

3.0 只有在以下条件同时满足时才能发布：

1. 用户可创建或打开任意可写项目目录，并持久保存项目与工作流。
2. Planner 生成合法 DAG；非法响应能自动修复或给出可行动错误。
3. 画布可编辑任务、依赖、位置及既有执行/重试/产出策略。
4. 节点保存后会被真实诊断；状态和能力入库，在线节点可被调度。
5. 依赖边不仅控制顺序，还把上游已校验产物作为下游输入。
6. 节点代理执行 Hermes，持续产生日志，并按严格或发现模式返回产物。
7. 超时、重试延迟、暂停调度、取消、重启恢复符合界面承诺。
8. 本地 API 受当前桌面会话保护；敏感凭据不回显、不进入日志和产物。
9. 自动化覆盖单元、集成、桌面 E2E、依赖审计和构建。
10. 使用最新桌面应用，通过 Computer Use 完成一个真实话题的规划、审核、执行、日志与产物查看。

## 2. 实施顺序

### 任务 1：冻结验收矩阵和当前基线

文件：

- `docs/XUANJI_3_ACCEPTANCE.md`
- `docs/CURRENT_STATE.md`
- `scripts/verify-all.sh`

动作：

- 为项目、Planner、工作流、节点、调度、执行、恢复、日志、产物、安全、桌面壳、发布逐项定义证据。
- 记录现有自动化能证明和不能证明的边界。
- 将生产依赖审计和真实协议集成测试加入统一验证入口。

验收：

- 每个模块都有负责人代码路径、测试路径、验收结果和剩余风险。
- 不以 fake-node 测试冒充 Hermes/节点代理真实链路。

### 任务 2：建立稳定的任务派发协议

文件：

- `backend/src/xuanji/nodes/protocol.py`
- `backend/src/xuanji/nodes/client.py`
- `node-agent/app.py`
- `node-agent/executor.py`
- 对应测试

动作：

- 定义 `TaskDispatch`：项目、运行、任务、幂等键、指令、输入清单和输出策略。
- 创建任务时先持久化为 queued；输入逐个上传并校验大小与 SHA-256；输入完成后显式启动。
- 拒绝绝对路径、`..`、符号链接逃逸、重复但内容不同的幂等请求。
- 输入以只读文件进入任务目录；启动后禁止修改。

验收：

- 客户端与节点代理使用同一请求/响应契约。
- 相同幂等请求返回同一任务；不同内容冲突。
- 篡改、截断或越界输入被拒绝。

### 任务 3：让依赖边传递真实内容

文件：

- `backend/src/xuanji/execution/manager.py`
- `backend/src/xuanji/artifacts/manager.py`
- `backend/tests/test_execution_integration.py`

动作：

- 调度下游任务前，收集所有直接依赖的成功产物。
- 从本地可信产物库读取并重新校验大小与哈希，再上传到目标节点。
- 为输入保留来源任务 ID 和稳定相对路径，避免同名覆盖。
- 输入上传或校验失败时进入明确的 artifact/input failure 状态，不启动 Hermes。

验收：

- 上游生成一个未出现在下游 prompt 中的唯一标记；下游结果必须包含该标记。
- 两个上游同名文件不会互相覆盖。
- 任何损坏输入都会阻止下游执行并产生可理解错误。

### 任务 4：统一真实输出契约和日志

文件：

- `node-agent/executor.py`
- `node-agent/app.py`
- `backend/src/xuanji/execution/manager.py`
- `backend/src/xuanji/api/runs.py`

动作：

- strict 模式只接受声明产出；discover 模式收集节点工作区中的安全普通文件。
- Hermes 文本输出规范化为 `result.md`，同时兼容工作流声明的单一 Markdown 产出。
- 从 Hermes 事件/SSE 或轮询状态持续写入 `logs.jsonl`，保留 offset 分页语义。
- Coordinator 拉取节点日志，写入项目运行日志，并通过现有事件流推送界面。

验收：

- 运行中可在 UI 看到递增日志；刷新后历史仍在。
- 成功任务的清单、文件大小和哈希一致；缺失严格产出导致 `artifact_failed`。

### 任务 5：完成节点生命周期

文件：

- `backend/src/xuanji/api/nodes.py`
- `backend/src/xuanji/storage/repositories.py`
- `backend/src/xuanji/provisioning/ssh.py`
- `app/src/features/nodes/NodeManager.tsx`

动作：

- 保存节点后自动诊断；诊断结果更新 status、capabilities、last_seen。
- 提供显式“重新诊断”，显示错误原因和最后诊断时间。
- 远程部署同时安装 Hermes、节点代理、运行目录与 systemd 服务。
- 部署完成后检查 8642、8765、鉴权和能力；失败步骤可安全重试。

验收：

- 新节点从 unknown 变为 online/degraded/offline，调度器只使用真实 online 节点。
- provision 成功后的 API 与 Coordinator 协议一致，不把 Hermes API 当节点代理 API。

### 任务 6：兑现调度与运行控制策略

文件：

- `backend/src/xuanji/execution/manager.py`
- `backend/src/xuanji/scheduler/*`
- 对应测试

动作：

- 运行超时从 attempt started_at 计算，超时先取消远程任务，再按策略失败/重试。
- `delay_seconds` 控制下一次派发时间，重启后仍有效。
- 暂停定义为“停止派发新任务”；运行中远程任务继续归并结果，界面明确该语义。
- 重启恢复 running/collecting/cancelling 任务；重复 reconcile 不重复派发。

验收：

- 时间可控测试覆盖超时、退避、暂停、取消和重启。
- 每个幂等键最多创建一个远程任务。

### 任务 7：收口 Planner 契约

文件：

- `backend/src/xuanji/planner/*`
- `backend/src/xuanji/api/workflows.py`
- 对应测试

动作：

- 对支持结构化输出的 provider 发送 JSON schema/response format。
- 不支持时执行一次带具体校验错误的修复请求。
- 对任务 ID、依赖、路径、策略和 DAG 做统一校验。
- provider/model/凭据缺失时返回明确配置错误，不回退伪造规划。

验收：

- 合法响应一次通过；可修复响应二次通过；非法或成环响应稳定失败。

### 任务 8：完成工作流编辑体验

文件：

- `app/src/features/canvas/WorkflowCanvas.tsx`
- `app/src/features/workflow/TaskEditor.tsx`
- `app/src/store/workspaceStore.ts`
- 对应测试

动作：

- 接入节点移动事件，并在 drag stop 后持久保存位置。
- 编辑器覆盖既有执行节点/组、能力要求、超时、重试、产出路径和媒体类型。
- 所有草稿修改走服务端校验；已审核工作流保持只读。

验收：

- 拖动、刷新后位置不变。
- 政策字段编辑、保存、刷新一致；非法路径/依赖在 UI 明确报错。

### 任务 9：桌面会话与依赖安全

文件：

- `backend/src/xuanji/api/app.py`
- `app/src/lib/client.ts`
- `app/src-tauri/src/*`
- `app/package.json`

动作：

- Coordinator 启动时生成一次性会话 token，通过 sidecar 握手交给桌面壳。
- 除健康/握手外的本地 API 要求 token；限制 loopback 和可信 Origin。
- 删除未使用的路由组件与 `react-router-dom`，消除当前高危生产依赖。
- 对日志、错误、快照执行敏感字段回归检查。

验收：

- 无 token 请求 401；桌面应用正常工作；token 不持久化到项目。
- `npm audit --omit=dev` 无 high/critical。

### 任务 10：真实链路集成测试

文件：

- `scripts/e2e_stack.py`
- `scripts/verify-all.sh`
- 新增真实节点代理集成测试

动作：

- 启动 Coordinator、真实 Node Agent 和协议兼容 fake Hermes。
- 运行两层 DAG，验证唯一标记通过文件输入进入下游结果。
- 两个节点各执行至少一个任务，验证并发、日志、产物、取消与重启。
- UI E2E 必须检查同一个由界面启动的 run，不另建 API run 替代断言。

验收：

- 全套测试一次命令通过，报告明确列出各层证据。

### 任务 11：文档、构建与 Computer Use 终验

文件：

- `docs/USER_GUIDE.md`
- `docs/NODE_DEPLOYMENT.md`
- `docs/TROUBLESHOOTING.md`
- `docs/CURRENT_STATE.md`

动作：

- 更新真实端口、节点代理、暂停语义、产出模式和恢复指南。
- 构建 sidecar、Tauri `.app` 与 DMG，不覆盖用户未提交产物。
- 使用 Computer Use 打开最新应用，以一个话题完成：创建项目 → 规划 → 编辑/审核 → 节点诊断 → 执行 → 观察日志 → 检查产物 → 重开验证持久化。

验收：

- 自动化、桌面操作、项目目录产物和日志四类证据相互对应。
- 任何缺少真实凭据/远程主机导致的项，只能标记为外部阻塞，不能宣称完成。

## 3. 发布门禁

以下任一项失败，3.0 不得标记完成：

- 下游未读取上游真实产物。
- fake-node 通过但真实 Node Agent 协议失败。
- 界面显示成功但产物清单/哈希不一致。
- UI E2E 断言的不是同一个 UI 创建的运行。
- 节点部署后仍只暴露 Hermes API。
- 高危生产依赖未清零。
- 最新 `.app` 未经 Computer Use 完整操作。

## 4. 提交策略

- 每个任务形成独立、可回滚提交。
- 不纳入现有未提交二进制、`build/`、`.app` 和 DMG。
- 每次提交前运行该模块最小测试；阶段完成后运行 `scripts/verify-all.sh`。
- 最终报告分别列出：已修复、验证证据、外部阻塞、仍不承诺的功能边界。
