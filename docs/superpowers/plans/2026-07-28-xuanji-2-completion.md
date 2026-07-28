# 璇玑 AgentFlow 2.0 完整交付实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前原型收敛为 macOS 首发、可离线验证多节点执行闭环的本地分布式 AI 任务控制台。

**Architecture:** Tauri 管理 PyInstaller Coordinator sidecar 与按任务临时 SSH 隧道；Python Coordinator 负责规划、调度、执行、恢复、节点和产物；React 只保留单一无限画布；Node Agent 仅监听远程回环地址并封装 Hermes `/v1/runs`。

**Tech Stack:** Tauri 2、Rust、React 19、TypeScript、Vite 8、ReactFlow、Zustand、Python 3.11+、FastAPI、Pydantic 2、SQLite、Argon2id、AES-256-GCM、pytest、Vitest、Playwright、PyInstaller。

## 全局约束

- 首发桌面平台只保证 macOS；远程自动部署只保证 Ubuntu/Debian + systemd。
- 服务器、SSH 用户、私钥路径、模型凭据和 Node Token 必须由用户在软件内填写。
- 敏感凭据使用应用主密码派生密钥加密到本地文件，不保存明文。
- 远程 Node API 仅绑定 `127.0.0.1`，按任务通过临时 SSH 隧道访问。
- 不允许 Stub 成功冒充真实协议行为。
- 每个任务先写失败测试，再实现，再运行定向测试和当前全量验证。

---

### Task 1：固定隔离验证基线

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `node-agent/pyproject.toml`
- Modify: `app/package.json`
- Modify: `scripts/verify-all.sh`

**Interfaces:**
- Produces: `scripts/verify-all.sh [--skip-e2e] [--skip-tauri-build]`

- [ ] 为后端测试依赖加入 FastAPI、httpx、pytest-asyncio、cryptography、argon2-cffi、pygments。
- [ ] 修改脚本，使其创建或复用项目 `.venv`，不依赖全局 Python 包。
- [ ] 依次运行 backend tests、node-agent tests、前端 test/lint/build、compileall、Cargo test/check；任一失败返回非零。
- [ ] 运行 `bash scripts/verify-all.sh --skip-e2e --skip-tauri-build`，确认基线输出真实反映失败项。
- [ ] 提交：`test: establish isolated verification baseline`。

### Task 2：实现加密凭据库

**Files:**
- Create: `backend/src/xuanji/security/models.py`
- Create: `backend/src/xuanji/security/kdf.py`
- Create: `backend/src/xuanji/security/vault.py`
- Create: `backend/tests/test_security_vault.py`

**Interfaces:**
```python
class CredentialVault:
    def initialize(self, password: str) -> None: ...
    def unlock(self, password: str) -> None: ...
    def lock(self) -> None: ...
    def set(self, key: str, value: str) -> None: ...
    def get(self, key: str) -> str | None: ...
    @property
    def status(self) -> Literal["uninitialized", "locked", "unlocked"]: ...
```

- [ ] 先测试初始化、错误密码、篡改、锁定读取、重新解锁和文件中无明文。
- [ ] 使用 Argon2id 派生 32 字节密钥，AES-256-GCM 加密 JSON 凭据映射。
- [ ] 采用原子写入；文件仅包含版本、KDF 参数、salt、nonce、ciphertext。
- [ ] 运行 `backend/.venv/bin/python -m pytest backend/tests/test_security_vault.py -q`。
- [ ] 提交：`feat: add encrypted credential vault`。

### Task 3：完成 Planner 与一次自动修复

**Files:**
- Create: `backend/src/xuanji/planner/providers.py`
- Create: `backend/src/xuanji/planner/prompts.py`
- Create: `backend/src/xuanji/planner/service.py`
- Create: `backend/tests/test_planner.py`

**Interfaces:**
```python
class PlannerProvider(Protocol):
    async def complete(self, messages: list[dict[str, str]], model: str) -> str: ...

class PlannerService:
    async def plan(self, project_id: str, goal: str, context: str,
                   constraints: dict[str, Any]) -> Workflow: ...
```

- [ ] MockTransport 测试成功、非法 JSON、环依赖、一次修复成功/失败、401 与超时。
- [ ] Provider 只从 `CredentialVault` 读取密钥，兼容 DeepSeek/MiMo OpenAI API。
- [ ] 清理 code fence 后构造现有 `Workflow`，利用领域模型完成 Schema 和 DAG 校验。
- [ ] 修复尝试不得超过一次；最终失败返回稳定错误码 `planner_invalid_output`。
- [ ] 运行 `backend/.venv/bin/python -m pytest backend/tests/test_planner.py -q`。
- [ ] 提交：`feat: add validated planner with one repair attempt`。

### Task 4：实现 Scheduler 与节点协议客户端

**Files:**
- Create: `backend/src/xuanji/scheduler/readiness.py`
- Create: `backend/src/xuanji/scheduler/scoring.py`
- Create: `backend/src/xuanji/scheduler/state_machine.py`
- Create: `backend/src/xuanji/scheduler/service.py`
- Create: `backend/src/xuanji/nodes/protocol.py`
- Create: `backend/src/xuanji/nodes/client.py`
- Create: `backend/src/xuanji/nodes/registry.py`
- Create: `backend/tests/test_scheduler.py`

**Interfaces:**
```python
def ready_tasks(workflow: Workflow, attempts: dict[str, TaskAttempt],
                run_status: RunStatus, inputs_ready: Callable[[Task], bool]) -> list[Task]: ...
def score_node(task: Task, node: HermesNode, latency_ms: float) -> float: ...
class SchedulerService:
    def select_node(self, task: Task, nodes: Sequence[HermesNode]) -> HermesNode | None: ...
```

- [ ] 测试依赖就绪、失败阻塞、离线/能力不足、并发上限、稳定并列排序和无 ready 不死锁。
- [ ] 严格能力过滤后按 35/25/20/10/10 权重评分。
- [ ] 实现固定节点、节点组、本机优先、远程优先和自动分配。
- [ ] 实现任务状态合法转换表，非法转换抛结构化领域错误。
- [ ] 运行 `backend/.venv/bin/python -m pytest backend/tests/test_scheduler.py -q`。
- [ ] 提交：`feat: add deterministic capability-aware scheduler`。

### Task 5：补齐 Node Agent 与 Fake Node

**Files:**
- Modify: `node-agent/app.py`
- Modify: `node-agent/executor.py`
- Modify: `node-agent/tests/test_node_api.py`
- Create: `backend/tests/fakes/fake_node.py`

**Interfaces:**
- Produces: `GET /v1/tasks/{task_id}/artifacts/{path:path}`。
- Fake Node modes: `success|failure|delay|offline|bad_hash`。

- [ ] 测试 Bearer 认证、路径穿越、文件流式下载、幂等、取消确认和错误哈希。
- [ ] 取消只有 Hermes 返回 stopped/cancelled 后才标记 cancelled；通信失败进入 `cancel_failed`。
- [ ] 产物下载限定在任务 artifacts 目录，响应包含大小和 SHA-256。
- [ ] 默认服务绑定远程 `127.0.0.1`，部署文档不得暴露 `0.0.0.0`。
- [ ] 运行 `backend/.venv/bin/python -m pytest node-agent/tests -q`。
- [ ] 提交：`feat: complete node lifecycle and artifact transport`。

### Task 6：实现 Execution Manager 与恢复

**Files:**
- Create: `backend/src/xuanji/execution/manager.py`
- Create: `backend/src/xuanji/execution/recovery.py`
- Create: `backend/tests/test_execution_integration.py`
- Modify: `backend/src/xuanji/storage/repositories.py`
- Modify: `backend/src/xuanji/artifacts/manager.py`

**Interfaces:**
```python
class ExecutionManager:
    async def start(self, run_id: str) -> None: ...
    async def pause(self, run_id: str) -> None: ...
    async def resume(self, run_id: str) -> None: ...
    async def cancel(self, run_id: str) -> None: ...
    async def retry_task(self, run_id: str, task_id: str) -> TaskAttempt: ...
    async def skip_task(self, run_id: str, task_id: str) -> None: ...
class RecoveryService:
    async def recover_all(self) -> None: ...
```

- [ ] 集成测试覆盖 Fake 多节点并行、失败重试、暂停、真实取消、离线 blocked、坏产物、重启恢复和重复 start 幂等。
- [ ] 派发键固定为 `run_id:task_id:attempt`，每次状态变化和事件持久化。
- [ ] 产物全部完成路径、大小、哈希验证后才能 success。
- [ ] 所有任务完成时生成 `deliverables/manifest.json`。
- [ ] Coordinator 启动扫描非终态 Run 并对账远端真实状态。
- [ ] 运行 `backend/.venv/bin/python -m pytest backend/tests/test_execution_integration.py -q`。
- [ ] 提交：`feat: add recoverable execution manager`。

### Task 7：拆分并完成 Coordinator API

**Files:**
- Create: `backend/src/xuanji/api/app.py`
- Create: `backend/src/xuanji/api/errors.py`
- Create: `backend/src/xuanji/api/projects.py`
- Create: `backend/src/xuanji/api/workflows.py`
- Create: `backend/src/xuanji/api/runs.py`
- Create: `backend/src/xuanji/api/nodes.py`
- Create: `backend/src/xuanji/api/security.py`
- Create: `backend/src/xuanji/api/artifacts.py`
- Create: `backend/src/xuanji/api/events.py`
- Create: `backend/tests/test_api.py`

**Interfaces:**
- Error envelope: `{"error":{"code":str,"message":str,"details":dict}}`。
- Run start returns HTTP 202 and does not await completion。

- [ ] 测试项目、规划、工作流编辑/审核、Run 控制、任务重试/跳过、节点 CRUD/诊断、安全 API、Artifact 下载和 WS 补发。
- [ ] `lifespan` 初始化依赖、执行恢复，并在退出时关闭后台任务和数据库。
- [ ] 完成所有设计规格 REST 接口，替换 `coordinator.py` 中占位逻辑。
- [ ] WebSocket 按 `last_event_id` 补发，事件 ID 严格递增。
- [ ] 运行 `backend/.venv/bin/python -m pytest backend/tests/test_api.py -q`。
- [ ] 提交：`feat: expose complete coordinator API`。

### Task 8：接入 React 项目、规划、编辑和安全配置

**Files:**
- Create: `app/src/lib/client.ts`
- Modify: `app/src/store/workspaceStore.ts`
- Create/Modify: `app/src/features/projects/**/*.tsx`
- Create: `app/src/features/workflow/ReviewGate.tsx`
- Create: `app/src/features/inspector/TaskEditor.tsx`
- Create: `app/src/features/nodes/NodeManager.tsx`
- Create: `app/src/features/nodes/ProvisionWizard.tsx`
- Create: `app/src/features/settings/SecuritySettings.tsx`
- Create: `app/src/features/workflow/__tests__/workflow-edit.test.tsx`

**Interfaces:**
- `createApiClient(baseUrl: string): CoordinatorClient`。
- Store actions: `loadProject`, `plan`, `updateTask`, `connectTasks`, `disconnectTasks`, `reviewWorkflow`。

- [ ] 测试项目加载、DAG 增删改/连线、环提示、审核冻结、执行门禁、主密码初始化/解锁和节点配置。
- [ ] 移除硬编码 `initialWorkspace` 业务数据，使用服务端快照。
- [ ] 配置表单不回读敏感值，只展示“已配置”。
- [ ] 所有失败展示服务端结构化错误，不静默吞错。
- [ ] 运行 `npm --prefix app test -- workflow-edit` 和 `npm --prefix app run build`。
- [ ] 提交：`feat: connect editable workspace and secure settings`。

### Task 9：完成实时监控、日志和产物 UI

**Files:**
- Create: `app/src/features/runs/useRunEvents.ts`
- Create: `app/src/features/runs/TaskLog.tsx`
- Create: `app/src/features/runs/RunControls.tsx`
- Create: `app/src/features/artifacts/ArtifactBrowser.tsx`
- Create: `app/src/features/runs/__tests__/events.test.tsx`

**Interfaces:**
- `useRunEvents(runId: string | null): { lastEventId: number; connected: boolean }`。

- [ ] Mock WebSocket 测试快照+增量、重连补发、事件去重/乱序、日志分页和 Artifact 错误。
- [ ] reducer 只接受大于当前 `lastEventId` 的事件。
- [ ] 实现暂停、恢复、取消、重试、跳过及服务器错误展示。
- [ ] 点击任务展示执行节点、Attempt、实时日志和真实产物。
- [ ] 运行 `npm --prefix app test -- events` 和前端全测。
- [ ] 提交：`feat: add resumable run monitoring`。

### Task 10：完成 PyInstaller sidecar 与动态端口

**Files:**
- Create: `backend/xuanji-coordinator.spec`
- Create: `backend/src/xuanji/__main__.py`
- Create: `app/src-tauri/src/coordinator.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src-tauri/tauri.conf.json`
- Create: `app/src/lib/runtime.ts`

**Interfaces:**
- CLI: `xuanji-coordinator --port 0 --data-dir PATH`。
- Tauri commands: `coordinator_status() -> RuntimeInfo`、`select_project_dir()`、`select_ssh_key()`。

- [ ] Rust 测试空闲端口、启动失败、健康超时、重复启动和关闭。
- [ ] sidecar 启动后输出实际端口，健康成功后前端才加载工作区。
- [ ] 生产包只执行 sidecar，不调用源码 Python。
- [ ] 退出应用优雅终止 Coordinator。
- [ ] 运行 `cargo test --manifest-path app/src-tauri/Cargo.toml` 与 `cargo check`。
- [ ] 提交：`feat: package and supervise coordinator sidecar`。

### Task 11：实现按任务临时 SSH 隧道

**Files:**
- Create: `backend/src/xuanji/nodes/tunnels.py`
- Create: `backend/tests/test_tunnels.py`
- Create: `app/src-tauri/src/tunnel.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `backend/src/xuanji/provisioning/ssh.py`

**Interfaces:**
```python
class TunnelProvider(Protocol):
    async def open(self, owner_id: str, node: HermesNode) -> TunnelEndpoint: ...
    async def close(self, owner_id: str) -> None: ...
    async def close_all(self) -> None: ...
```

- [ ] Fake process 测试建立失败、完成/取消/超时关闭、恢复重建、应用退出和孤儿清理。
- [ ] SSH argv 使用 `-N -L local:127.0.0.1:remote -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=yes`。
- [ ] 使用独立 known_hosts 文件；首次未知主机返回可确认的指纹错误，不自动绕过校验。
- [ ] Token 不进入命令 argv 或日志。
- [ ] 执行定向 Python 与 Cargo 测试。
- [ ] 提交：`feat: add owned per-task SSH tunnels`。

### Task 12：E2E、生产构建、清理与文档收口

**Files:**
- Create: `app/playwright.config.ts`
- Create: `app/e2e/local-workflow.spec.ts`
- Create: `app/e2e/recovery.spec.ts`
- Modify: `scripts/verify-all.sh`
- Modify: `.gitignore`
- Modify: `README.md`
- Rewrite: `docs/CURRENT_STATE.md`
- Create: `docs/USER_GUIDE.md`
- Create: `docs/NODE_DEPLOYMENT.md`
- Create: `docs/TROUBLESHOOTING.md`
- Delete: `backend/main.py`, `backend/planner.py`, `backend/scheduler.py`, `backend/executor.py`, `backend/monitor.py`, `backend/collector.py`, `backend/storage.py`, `backend/model_config.py`
- Delete: `app/src/pages/*`, `app/src/panels/*`, `app/src/lib/api.ts`

**Interfaces:**
- Final gate: `bash scripts/verify-all.sh` returns 0。

- [ ] Playwright 覆盖规划→编辑→审核→Fake 多节点执行→产物，以及取消、重试、离线和 API 重启补发。
- [ ] 删除旧代码后搜索确认无旧 import、sessionStorage、占位成功和 `StrictHostKeyChecking=no`。
- [ ] 修正 `.gitignore`，不得用宽泛 `projects/` 误忽略源码。
- [ ] 生成可启动的未签名 macOS `.app`；记录实际路径与大小。
- [ ] README 和文档只写经测试验证的能力；签名、公证、DMG 和真实服务器标记为外部发布验收。
- [ ] 运行完整 `bash scripts/verify-all.sh`，保存所有关键结果。
- [ ] 提交：`chore: remove legacy paths and document verified release`。
