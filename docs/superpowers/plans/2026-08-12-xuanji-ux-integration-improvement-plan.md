# 璇玑 0.3.x 用户体验与前后端接入完善 Implementation Plan

> **交付对象：** 负责产品、前端、Coordinator 后端、Node Agent、桌面壳与 QA 的执行人员。
> **执行方式：** 按阶段独立实现；每阶段先补失败测试，再做最小改动，再提交证据。
> **边界：** 本文只规划 `/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow`。不授权清理现有脏内容、提交、推送、发布或修改项目外文件。

**Goal:** 在保留现有“纸墨朱砂”视觉身份和本地优先架构的前提下，把璇玑从“功能链路已具备”补齐为“首次使用可理解、配置可完成、审核有依据、执行状态真实、失败可恢复、产物可安全取得”的桌面产品。

**Architecture:** 继续采用 Tauri 桌面壳 + React 工作台 + 本机 Python Coordinator sidecar + SQLite + Node Agent/Hermes 的分层结构。新增统一 Readiness、工作流审核快照、项目 Run 历史、一次性 WebSocket 票据和凭据存储抽象；不把业务判断复制到前端，前端只呈现服务端真相和可执行修复动作。

**Tech Stack:** React 19、TypeScript、Zustand、React Flow、Tauri 2/Rust、FastAPI、SQLite、Python Node Agent、Vitest、Playwright、Pytest、Cargo。

---

## 1. 2026-08-12 现场基线

### 1.1 当前进度结论

本次结论来自源码、Git 状态和仓库内证据的只读核对，不把历史报告当作当前运行结果。

| 项目 | 当前证据 | 判定 |
| --- | --- | --- |
| 分支 | `main`，HEAD `b67d2f5`，与 `origin/main` 对齐 | 代码基线明确 |
| 近期增量 | 自 2026-08-10 旧基线后新增 29 个提交 | 已进入可交付产品补全阶段 |
| 桌面运行 | Tauri sidecar 监督、状态轮询、启动错误页已存在 | 主链路已接入，恢复操作不足 |
| 核心工作流 | 项目、规划、编辑、校验、审核、运行、暂停/恢复/取消、重试/跳过、日志、产物已贯通 | 功能覆盖较全，审核与状态语义需补齐 |
| 节点 | 节点 CRUD、诊断、部署、远端 Node Agent 契约已存在 | 首次配置和可信主机流程未闭环 |
| 产品体验 | 纸墨朱砂视觉、亮/暗主题、中英双语、状态色、响应式冒烟已落地 | 视觉身份已成形，激活/恢复/可访问性证据不足 |
| 发布 | 仓库文档和标签记录到 `v0.3.3`，并记录两段真实更新测试 | 本次未独立核验远端 Release、安装包或用户实际安装 |
| 自动化 | 本地总验证脚本和 macOS CI 工作流存在 | 本次为规划审查，未在当前脏工作区重跑 |
| 文档 | `release/README.md` 已到 0.3.3；多份产品/状态文档仍停留在 0.3.0 或旧路径 | 当前事实源不一致，必须治理 |

### 1.2 当前工作区脏内容

以下内容在本计划写入前已经存在，不属于本计划交付，任何执行人员不得直接删除、覆盖、暂存或提交：

- 已跟踪修改：`app/src-tauri/binaries/xuanji-coordinator`
- 已跟踪修改：`app/src-tauri/binaries/xuanji-coordinator-aarch64-apple-darwin`
- 未跟踪：`app/src-tauri/src-tauri/`，展开约 3,596 个文件、约 1.2 GB，主要为嵌套 Cargo/Tauri 构建产物
- 未跟踪：`release/xuanji-0.3.1-20260811/`
- 未跟踪：`release/xuanji-0.3.2-20260811/`
- 未跟踪：`release/xuanji-0.3.3-20260811/`

执行前必须由资产所有者逐项确认来源、是否可复现、是否需要归档和哈希；确认前只能避让，不能“顺手清理”。

### 1.3 当前证据边界

- 已确认：源码接线、路由、状态模型、仓库文档、当前 Git 状态和提交历史。
- 仓库记录但本次未重跑：Pytest、Vitest、Playwright、Cargo、Tauri build、升级链路。
- 本次未独立确认：真实 Hermes API 长时任务、真实远端节点、远端 CI、GitHub Release 资产、最终用户安装与验收。
- 因此当前状态应表述为“实现进度较高，但产品级接入和独立验收未闭环”，不能表述为“已经完成上线”。

## 2. 产品体验判断

### 2.1 应保留的基础

- 纸、墨、朱砂的视觉语言有明确辨识度，不建议重做视觉体系。
- 三栏工作台与“项目—流程—检查器/运行信息”的心智模型一致。
- 亮/暗主题、中英双语、焦点轮廓、React Flow ARIA 标签已经建立可继续扩展的基础。
- Sidecar 由桌面壳管理，业务数据与执行都本地优先，符合产品定位。
- 运行日志、事件回放、产物哈希校验、严格 SSH host key 检查是值得保留的可靠性基础。

### 2.2 当前最影响用户的缺口

| 优先级 | 缺口 | 用户后果 | 处理方向 |
| --- | --- | --- | --- |
| P0 | 前端把 `pending` 映射成 `accepted`、`cancelling` 映射成 `cancelled`、`blocked` 映射成 `failed` | UI 会提前或错误宣告状态 | 删除语义折叠，端到端保留后端枚举 |
| P0 | 没有统一可执行性检查，执行按钮只看 `reviewed` | 用户直到运行后才发现 Planner、节点、凭据或项目目录问题 | 新增 Readiness API 与修复动作中心 |
| P0 | 项目切换后不恢复最近 Run，后端也没有项目 Run 列表 | 重启或切换项目后失去运行上下文 | 新增项目 Run 历史与最近运行恢复 |
| P0 | WebSocket 和产物下载把会话令牌放在 URL query | 令牌可能进入日志、历史或错误报告 | 一次性 WS ticket；产物改为带 header 的 blob 下载 |
| P0 | Node Agent 在 token 为空时放行请求 | 配置错误会变成无认证服务 | 空 token 启动失败并拒绝请求 |
| P1 | 审核是一键从 `draft` 变 `reviewed` | 用户看不到风险、变更摘要和审核依据 | 审核准备页、快照哈希、警告确认、基于修订重开 |
| P1 | 节点表单一次暴露全部字段，SSH 密钥选择命令未接 UI，本地发现 API 未接 UI | 首次节点接入费力且容易填错 | 分步向导、显式本地/远端选择、密钥选择器、本地发现 |
| P1 | 删除任务/边/节点缺少确认或撤销 | 误操作恢复成本高 | 轻量 Undo；高影响删除二次确认 |
| P1 | 全局 `loading` 无法表达具体动作 | 多个控件状态不可信，可能重复提交 | `pendingActions` 按资源和动作建模 |
| P1 | 失败只到全局横幅，启动失败主要只有“重载” | 用户知道失败，但不知道怎样恢复 | 上下文错误、重试、重启 Coordinator、复制诊断信息 |
| P1 | 大量 9–11 px 文本、仅一个响应式断点、无 reduced-motion | 低视力、缩放、键盘/动态敏感用户体验不足 | 字号/密度审计、200% 缩放、键盘/VoiceOver、减弱动态 |
| P2 | 项目创建表单常驻、运行控制拥挤、节点高级配置默认展开 | 视觉密度偏高 | 渐进披露和上下文操作 |
| P2 | 日志缺少搜索/筛选/导出，文档事实源陈旧 | 排障和交接效率低 | 诊断包、日志工具、文档治理 |

### 2.3 目标用户旅程

1. 首次打开：桌面壳启动 Coordinator，失败时用户可重试、重启、复制诊断或退出。
2. 就绪检查：用户看到“项目目录、Planner、节点、凭据、工作流”五项状态，以及每一项的直接修复入口。
3. 创建项目：先命名和选择目录；高级信息按需展开；创建成功后进入空状态引导。
4. 生成与编辑流程：目标、约束和上下文分层输入；生成失败停留在原上下文并可重试。
5. 审核流程：集中查看任务数、依赖、写入范围、验证规则、节点匹配和警告；确认的是一个不可变快照。
6. 执行：按钮只在 Readiness 通过时可用；不能执行时显示明确原因与修复动作。
7. 观察：状态与后端一致；事件、日志、任务和进度互相可定位。
8. 恢复：重启或切换项目后能看到最近 Run；阻塞、失败、暂停、取消中分别有合法动作。
9. 交付：产物下载不暴露会话令牌，展示大小、哈希、来源任务和验证结果。

## 3. 当前前后端接入矩阵

### 3.1 已接通的主链路

| 能力 | 前端 | Coordinator API | 后端/外部 | 状态 |
| --- | --- | --- | --- | --- |
| 项目列表/创建/读取 | `client.ts` + `workspaceStore.ts` + ProjectRail | `/api/projects` | SQLite repository | 已接通 |
| 规划与工作流读取/编辑 | Canvas/Inspector/Store | `/api/projects/{id}/plan`、`/api/projects/{id}/workflow`、`/api/workflows/{id}` | Planner + workflow repository | 已接通 |
| 校验与审核 | ReviewGate | `/validate`、`/review` | DAG 校验、状态冻结 | 基础接通，审核语义不足 |
| 运行控制 | RunBar/RunControls | create/start/get/pause/resume/cancel | 调度器 + SQLite | 已接通，状态展示有误 |
| 任务恢复 | RunControls | retry/skip/logs | 调度器 + event/log repository | 已接通，按钮约束不足 |
| 节点管理 | NodeManager | list/create/update/delete/diagnose/provision | SSH、Node Agent、Hermes | 已接通，激活流程不完整 |
| Planner 设置 | Settings | `/api/planner/config` | 加密/凭据配置文件 | 已接通，凭据存储待加强 |
| 事件 | `useRunEvents.ts` | WebSocket + replay | Event repository | 已接通，query token 待替换 |
| 产物 | ArtifactBrowser | list/download | 存储 + 响应前 SHA-256 复核 | 已接通，下载令牌传递不安全 |
| 桌面运行时 | AppShell/runtime | Tauri commands | Sidecar supervision | 已接通，诊断/恢复不足 |
| 主题/语言/更新 | 顶部工具与原生菜单 | Tauri plugins/commands | updater + OS | 已接通，失败解释不足 |

### 3.2 后端已有、前端未接

| 能力 | 已有接口/命令 | 缺失 |
| --- | --- | --- |
| 项目改名/删除 | `PATCH /api/projects/{id}`、`DELETE /api/projects/{id}` | `CoordinatorClient` 方法、项目菜单、删除确认和产物保留说明 |
| 本地节点发现 | `POST /api/nodes/local/discover` | 客户端方法、发现结果 UI、选择/更新动作 |
| SSH 密钥选择 | Tauri `select_ssh_key`，`runtime.ts` 已导出 `selectSshKey()` | NodeManager 按钮与路径回填 |

### 3.3 产品闭环需要新增

| 能力 | 建议契约 | 目的 |
| --- | --- | --- |
| 统一就绪检查 | `GET /api/readiness?project_id=&workflow_id=&mode=local` | 执行前一次看清全部阻塞项 |
| 工作流审核准备 | `POST /api/workflows/{id}/review/prepare` | 返回规范化快照、哈希、阻塞项和警告 |
| 工作流修订 | `POST /api/workflows/{id}/revisions` | 从已审核版本克隆新 draft，不篡改旧快照 |
| 项目 Run 历史 | `GET /api/projects/{id}/runs?limit=&cursor=` | 重启恢复、历史追踪 |
| WS 一次性票据 | `POST /api/session/ws-tickets` | 避免长期会话令牌出现在 URL |
| Host key 确认 | inspect/confirm 两阶段 API | 在严格校验前提下让用户安全确认指纹 |
| 诊断包 | `GET /api/diagnostics/summary` + Tauri 导出命令 | 支持用户自助和可脱敏支持 |
| 人工检查 | task/run `needs_review`、`success_with_warnings` | 真实表达机械验证与人工验收边界 |

### 3.4 尚未形成当前证据的外部链路

- 真实 Hermes API 的多文件工作区执行、取消、失败恢复与长时任务。
- 真实远端 Mac/Linux 节点的 SSH、安装、重连、并发、产物回传。
- GitHub Actions 当前分支结果、GitHub Release 当前资产、签名/公证状态。
- 从旧版本自动更新后的实际 App 运行，以及最终用户安装/验收。

这些必须在独立审核中分层记录，不能用 Fake Node、源码测试或本地 build 替代。

## 4. 实施原则

1. 保留现有视觉体系和三栏信息架构，做增量补全，不进行无关重构。
2. 后端是状态、权限、就绪度和动作合法性的唯一事实源；前端不得猜测或折叠状态。
3. 所有禁用控件必须能回答“为什么不能用”和“下一步去哪修复”。
4. 每个异步动作都有独立 pending、成功、失败、重试和幂等策略。
5. 审核快照、运行记录、事件、产物哈希和验证结果必须可追溯。
6. 凭据、session token、签名 URL 和私有路径不得进入普通 UI DTO、日志或诊断包。
7. Fake/Mock 只证明产品内合同，不证明真实 Hermes、远端节点、发布或用户验收。
8. 每一阶段形成独立提交；提交、推送和发布需要另行授权。

## 5. 分阶段实施计划

### Task 0：锁定事实源与隔离工作区

**Files:**

- Modify: `docs/CURRENT_STATE.md`
- Modify: `docs/PRODUCT.md`
- Modify: `docs/PRODUCT_DEFINITION.md`
- Modify: `docs/USER_JOURNEY.md`
- Modify: `docs/TECH_SHAPE.md`
- Modify: `docs/OPERATIONS.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/RELEASE_AND_BOUNDARY.md`
- Modify: `README.md`
- Review only: `release/README.md`
- Create: `docs/EVIDENCE_INDEX.md`

**Steps:**

1. 在新的干净 worktree 或明确隔离的候选分支执行，记录起始 SHA；不得在当前脏目录直接清理。
2. 给现有二进制和三个 release 目录生成 SHA-256 清单，由资产所有者确认“保留/归档/可重建/禁止触碰”。
3. 修正文档中的旧产品版本和旧绝对路径；把产品版本、Coordinator API 版本、schema 版本分别命名，避免都叫“版本”。
4. 在 `docs/EVIDENCE_INDEX.md` 记录每项证据的日期、SHA、环境、命令、结果和层级：`source`、`test`、`build`、`package`、`runtime`、`external`、`remote_release`、`installed`、`user_acceptance`。
5. 不把 2026-07-29 的测试数量复制成当前结果；只有重跑后才能更新。

**Verification:**

- `rg -n '0\.3\.0|/Users/yancyfeng/Desktop/XuanJiAgentFlow' README.md docs release/README.md`
- `git status --short`
- 人工确认文档中没有把本地 build 写成发布、把 Release 写成安装、把安装写成验收。

### Task 1：建立统一 Readiness 与首次使用中心

**Files:**

- Create: `backend/src/xuanji/readiness.py`
- Create: `backend/src/xuanji/api/readiness.py`
- Modify: `backend/src/xuanji/api/app.py`
- Modify: `backend/src/xuanji/scheduler/service.py`
- Create: `backend/tests/test_readiness_api.py`
- Modify: `app/src/lib/client.ts`
- Modify: `app/src/store/workspaceStore.ts`
- Create: `app/src/features/onboarding/ReadinessCenter.tsx`
- Create: `app/src/features/onboarding/__tests__/ReadinessCenter.test.tsx`
- Modify: `app/src/app/AppShell.tsx`
- Modify: `app/src/features/runs/RunBar.tsx`
- Modify: `app/src/lib/messages.zh-CN.ts`
- Modify: `app/src/lib/messages.en.ts`
- Create: `app/e2e/onboarding.spec.ts`

**Contract:**

```ts
type ReadinessSeverity = 'blocking' | 'warning' | 'info';

interface ReadinessIssue {
  code: string;
  severity: ReadinessSeverity;
  title: string;
  message: string;
  action: 'open_project' | 'open_planner' | 'open_nodes' | 'open_workflow' | 'retry';
  targetId: string | null;
}

interface ReadinessResult {
  ready: boolean;
  checkedAt: string;
  projectId: string | null;
  workflowId: string | null;
  checks: Record<string, 'ready' | 'blocked' | 'warning' | 'unknown'>;
  issues: ReadinessIssue[];
}
```

**Steps:**

1. 先用后端测试定义项目目录、Planner 配置、workflow 状态/校验、任务契约、可用节点和凭据六类检查。
2. `mode=local` 只能做无付费、无远端副作用检查；需要真实调用的 `mode=deep` 必须由用户显式触发。
3. create/start run 在服务端再次调用同一 readiness service，失败返回稳定错误码和 issue 列表，避免只靠 UI 门禁。
4. 客户端新增 `getReadiness()`；Store 保存结果和最后检查时间，不复制判断规则。
5. App 首次进入、项目/工作流/节点/Planner 变化后刷新；执行按钮旁展示阻塞原因，不使用只有 tooltip 的隐藏说明。
6. 空项目进入 ReadinessCenter；每个问题有直接动作，修复后可原地重试。
7. Playwright 覆盖首次启动、缺 Planner、无节点、未审核、全部就绪五条路径。

**Verification:**

- `.venv/bin/python -m pytest -q backend/tests/test_readiness_api.py`
- `cd app && npm test -- ReadinessCenter`
- `cd app && npx playwright test e2e/onboarding.spec.ts`

### Task 2：把全局 loading 改为动作级反馈

**Files:**

- Modify: `app/src/store/workspaceStore.ts`
- Modify: `app/src/app/AppShell.tsx`
- Modify: `app/src/features/projects/ProjectRail.tsx`
- Modify: `app/src/features/workflow/ReviewGate.tsx`
- Modify: `app/src/features/runs/RunBar.tsx`
- Modify: `app/src/features/runs/RunControls.tsx`
- Modify: `app/src/features/nodes/NodeManager.tsx`
- Modify: `app/src/features/settings/PlannerSettings.tsx`
- Modify: related component tests

**Contract:**

```ts
type PendingAction =
  | { kind: 'create_project'; key: 'new' }
  | { kind: 'plan' | 'review' | 'execute'; key: string }
  | { kind: 'pause' | 'resume' | 'cancel'; key: string }
  | { kind: 'retry_task' | 'skip_task'; key: string }
  | { kind: 'save_node' | 'diagnose_node' | 'provision_node' | 'delete_node'; key: string }
  | { kind: 'save_planner'; key: 'planner' };
```

**Steps:**

1. 用测试证明不同动作不会互相误锁，重复点击同一动作会被阻止。
2. Store 使用可查询的 `pendingActions`，并在 `finally` 中只清除对应动作。
3. 操作按钮显示明确进行中标签；成功反馈靠结果变化或轻量 live region，不用无上下文 toast 堆叠。
4. 错误挂在发生动作的组件附近，同时保留全局错误汇总入口。
5. Retry/Skip 依据服务端返回的 `allowed_actions`，不再以“选中了任务”作为唯一条件。

**Verification:**

- `cd app && npm test`
- 键盘连续触发同一按钮时只产生一个请求。

### Task 3：建立有依据的工作流审核与修订

**Files:**

- Modify: `backend/src/xuanji/api/workflows.py`
- Create: `backend/src/xuanji/workflow_review.py`
- Modify: `backend/src/xuanji/domain/models.py`
- Modify: `backend/src/xuanji/storage/migrations.py`
- Modify: `backend/src/xuanji/storage/repositories.py`
- Create: `backend/tests/test_workflow_review_api.py`
- Modify: `app/src/lib/client.ts`
- Modify: `app/src/store/workspaceStore.ts`
- Create: `app/src/features/workflow/ReviewWorkspace.tsx`
- Create: `app/src/features/workflow/__tests__/ReviewWorkspace.test.tsx`
- Replace responsibility of: `app/src/features/workflow/ReviewGate.tsx`
- Create: `app/e2e/review-workflow.spec.ts`

**Steps:**

1. `POST /api/workflows/{id}/review/prepare` 返回规范化 workflow、SHA-256 快照、拓扑顺序、阻塞项、警告、节点匹配和预计写入范围。
2. `POST /api/workflows/{id}/review` 必须提交 snapshot hash；若 workflow 已变化返回 `review_snapshot_stale`。
3. 存储审核者类型、审核时间、快照哈希和警告确认，不存自由文本凭据或私有路径。
4. `POST /api/workflows/{id}/revisions` 从已审核版本克隆新 draft；运行永远指向已审核的不可变版本。
5. ReviewWorkspace 分“结构、执行节点、写入/产物、验证、警告”呈现，默认显示摘要，细节可展开。
6. 审核后编辑入口明确叫“创建修订”，不让用户误以为会原地修改正在运行的版本。

**Verification:**

- `.venv/bin/python -m pytest -q backend/tests/test_workflow_review_api.py`
- `cd app && npm test -- ReviewWorkspace`
- `cd app && npx playwright test e2e/review-workflow.spec.ts`

### Task 4：端到端保留真实运行状态，并恢复历史运行

**Files:**

- Modify: `backend/src/xuanji/api/runs.py`
- Modify: `backend/src/xuanji/domain/enums.py`
- Modify: `backend/src/xuanji/storage/migrations.py`
- Modify: `backend/src/xuanji/storage/repositories.py`
- Create: `backend/tests/test_project_runs_api.py`
- Modify: `app/src/lib/client.ts`
- Modify: `app/src/store/workspaceStore.ts`
- Modify: `app/src/features/runs/runEventState.ts`
- Modify: `app/src/features/runs/useRunEvents.ts`
- Create: `app/src/features/runs/RunHistory.tsx`
- Modify: `app/src/features/runs/RunControls.tsx`
- Modify: `app/src/lib/messages.zh-CN.ts`
- Modify: `app/src/lib/messages.en.ts`
- Modify: `app/e2e/recovery.spec.ts`

**Steps:**

1. 删除 `toRunStatus()` 和 `mapRunStatus()` 的语义替换；类型直接覆盖 `pending/running/paused/cancelling/cancelled/success/failed/blocked`。
2. 文案必须逐一对应：`pending=等待调度`、`cancelling=取消中`、`blocked=已阻塞`，不能写成已接受、已取消或失败。
3. 后端提供 `GET /api/projects/{project_id}/runs?limit=20&cursor=...`，按创建时间稳定分页，返回 workflow version 和汇总计数。
4. `loadProject()` 恢复最近非终态 Run；若只有终态 Run，则在 RunHistory 中显示但不抢占工作台。
5. 每个 run/task 响应返回 `allowed_actions`，前端按此渲染暂停、恢复、取消、重试、跳过。
6. 在确有人工检查需求后，通过 additive migration 增加 `needs_review` 和 `success_with_warnings`，同时更新调度器、事件、恢复、UI 和测试；不得只加前端颜色。
7. WebSocket 断线后从 `lastEventId` 回放，并以 GET Run 快照收敛；UI 明示“正在重连/已恢复/回放不完整”。

**Verification:**

- `.venv/bin/python -m pytest -q backend/tests/test_project_runs_api.py backend/tests/test_execution_integration.py`
- `cd app && npm test -- runEventState events`
- `cd app && npx playwright test e2e/recovery.spec.ts`

### Task 5：补齐项目与节点接入体验

**Files:**

- Modify: `app/src/lib/client.ts`
- Modify: `app/src/lib/runtime.ts`
- Modify: `app/src/features/projects/ProjectRail.tsx`
- Modify: `app/src/features/nodes/NodeManager.tsx`
- Create: `app/src/features/nodes/NodeSetupWizard.tsx`
- Create: `app/src/features/nodes/__tests__/NodeSetupWizard.test.tsx`
- Modify: `backend/src/xuanji/api/nodes.py`
- Modify: `backend/src/xuanji/provisioning/ssh.py`
- Create: `backend/tests/test_host_key_api.py`
- Create: `app/e2e/node-setup.spec.ts`

**Steps:**

1. 前端接入项目 PATCH/DELETE；项目创建表单改为按需展开，项目菜单提供改名和删除。
2. 删除项目时明确说明“项目记录会删除、运行产物按当前后端策略保留”，要求输入项目名或二次确认；不得暗示磁盘项目目录会被删除。
3. NodeSetupWizard 第一步显式选择“本机/远端”，本机优先调用 `/api/nodes/local/discover`，远端再展示 SSH 字段。
4. SSH key 输入旁接 `selectSshKey()`；只显示用户可识别的路径，日志和诊断包脱敏 home 目录。
5. 增加 `POST /api/nodes/{id}/host-key/inspect`，返回算法、指纹、主机和已知状态；`confirm` 必须回传相同指纹，服务端再写 known_hosts。
6. 诊断结果分 DNS、TCP、SSH、Node Agent、Hermes 五步，逐步显示失败位置和可重试动作。
7. 节点删除、重新部署等高影响动作必须确认；普通表单更改支持取消。

**Verification:**

- `.venv/bin/python -m pytest -q backend/tests/test_host_key_api.py backend/tests/test_api.py`
- `cd app && npm test -- NodeSetupWizard`
- `cd app && npx playwright test e2e/node-setup.spec.ts`

### Task 6：关闭会话与凭据安全缺口

**Files:**

- Create: `backend/src/xuanji/session_tickets.py`
- Modify: `backend/src/xuanji/credentials.py`
- Modify: `backend/pyproject.toml`
- Modify: `backend/src/xuanji/api/app.py`
- Modify: `backend/src/xuanji/api/events.py`
- Modify: `backend/src/xuanji/api/artifacts.py`
- Modify: `backend/src/xuanji/api/planner.py`
- Modify: `backend/src/xuanji/api/nodes.py`
- Create: `backend/tests/test_session_security.py`
- Modify: `node-agent/app.py`
- Create: `node-agent/tests/test_auth_fail_closed.py`
- Modify: `app/src/lib/client.ts`
- Modify: `app/src/features/runs/useRunEvents.ts`
- Modify: `app/src/features/artifacts/ArtifactBrowser.tsx`

**Steps:**

1. Node Agent 启动时若 token 为空直接失败；所有 `/v1/tasks*` 请求无合法 token 均返回 401，只有 `/v1/health` 的暴露范围由明确策略决定。
2. 新增 header 认证的 `POST /api/session/ws-tickets`；票据绑定 session/run、30 秒过期、单次消费，WebSocket URL 只携带短期票据。
3. ArtifactBrowser 使用 `fetch` + `X-Xuanji-Session` 取得 Blob，再创建临时 object URL；服务端移除长期 `session_token` query 支持。
4. 将现有 `LocalCredentialStore` 抽象成接口，macOS sidecar 通过受测的 Keychain backend 保存 Planner 和节点 secret；SQLite/JSON 只保存不可逆的 credential reference，单元测试使用内存实现。
5. 迁移旧凭据时先检测、导入、验证，再原子删除旧 secret；失败保留旧数据并提示用户，不能静默丢失。
6. 所有错误 envelope、日志、事件和诊断摘要增加 secret redaction 测试。

**Verification:**

- `.venv/bin/python -m pytest -q backend/tests/test_session_security.py node-agent/tests/test_auth_fail_closed.py`
- `cd app && npm test -- ArtifactBrowser events`
- 人工检查浏览器/代理日志中不存在长期 session token、Planner key、节点 token 和 SSH 私钥内容。

### Task 7：补齐任务交付合同与验证语义

**Files:**

- Modify: `backend/src/xuanji/domain/models.py`
- Modify: `backend/src/xuanji/storage/migrations.py`
- Modify: `backend/src/xuanji/planner/prompts.py`
- Modify: `backend/src/xuanji/planner/service.py`
- Modify: `backend/src/xuanji/execution/manager.py`
- Modify: `backend/src/xuanji/nodes/protocol.py`
- Modify: `node-agent/app.py`
- Modify: `node-agent/executor.py`
- Modify: `app/src/lib/client.ts`
- Modify: `app/src/features/inspector/TaskEditor.tsx`
- Modify after Task 3: `app/src/features/workflow/ReviewWorkspace.tsx`
- Add/modify: matching backend, Node Agent and frontend tests

**Contract additions:**

```ts
interface WorkflowTask {
  writes: string[];
  done_definition: string[];
  verify: Array<{ kind: 'command' | 'file_exists' | 'sha256' | 'manual'; value: string }>;
  run_gate: 'auto' | 'review_before_start' | 'review_before_complete';
}
```

**Steps:**

1. 通过 additive schema migration 增加字段并给旧 workflow 明确默认值；旧数据读取、备份恢复和降级说明必须有测试。
2. Planner 输出 schema、API DTO、前端类型、审核摘要、Node Agent `CreateTaskRequest` 同步更新，禁止只改一层。
3. Dispatcher 在派发前校验写入范围与依赖产物；Node Agent 在隔离工作区执行，并返回逐条验证结果。
4. `command/file_exists/sha256` 可机械判定；`manual` 必须进入 `needs_review`，不能伪装成 success。
5. ReviewWorkspace 展示写入范围、完成定义和验证命令，高风险命令需要醒目标记和人工确认。

**Verification:**

- migration upgrade/restore 测试
- Planner contract 测试
- Coordinator ↔ Node Agent contract 测试
- Fake Node E2E 证明合同；真实 Hermes 验收单独记录为 external evidence。

### Task 8：可访问性、响应式与错误恢复收口

**Files:**

- Modify: `app/src/app/AppShell.css`
- Modify: `app/src/app/AppShell.tsx`
- Modify: all touched interactive components
- Create: `app/e2e/accessibility.spec.ts`
- Modify: `app/e2e/responsive.spec.ts`
- Create: `docs/ACCESSIBILITY_CHECKLIST.md`

**Steps:**

1. 将主要正文和可操作标签提升到可读字号；9–11 px 只允许非关键、非交互性辅助信息。
2. 在 900、980、1280、1440、1920 px 及 200% 浏览器缩放下核对三栏；必要时让右栏变为抽屉，不能只验证“无横向溢出”。
3. 增加 `prefers-reduced-motion: reduce`；进度条避免 `transition: width`，改用 transform 或关闭动态。
4. 完成键盘顺序、焦点回归、对话框焦点陷阱、Escape、屏幕阅读器名称和 live region。
5. 启动失败页增加“重试启动、重启 Coordinator、复制脱敏诊断、退出”；普通错误保留用户输入和当前位置。
6. 日志增加级别/任务筛选、搜索和脱敏导出；诊断包默认排除 session、凭据、私钥、完整 home 路径和产物正文。
7. 人工使用 VoiceOver 完成“创建项目—配置—审核—执行—查看产物”主路径并保存录屏/记录。

**Verification:**

- `cd app && npm run lint && npm test && npm run build`
- `cd app && npx playwright test e2e/accessibility.spec.ts e2e/responsive.spec.ts`
- VoiceOver、键盘-only、200% 缩放人工记录齐全。

### Task 9：集成、打包与交付证据

**Files:**

- Modify: `scripts/verify-all.sh` only if new gates require it
- Modify: `.github/workflows/verify.yml`
- Modify after Task 0: `docs/EVIDENCE_INDEX.md`
- Modify: `docs/CURRENT_STATE.md`
- Modify: `docs/USER_GUIDE.md`
- Create: `docs/releases/<candidate-version>-acceptance.md`

**Steps:**

1. 在干净候选 SHA 上运行完整验证；不要在含当前未知脏内容的目录里生成“通过”证据。
2. 本地 gate：backend、Node Agent、frontend unit、audit、lint、build、Playwright、compileall、Cargo test/check、Tauri build。
3. 运行备份恢复时，使用 SQLite online backup API，或先停写并 checkpoint；不能在数据库活动时直接复制 `db/-wal/-shm` 后宣称一致性。
4. Fake Node 通过后，再执行一个真实本机 Hermes 任务和一个真实远端节点任务，记录输入、输出、耗时、取消/恢复和产物哈希。
5. 生成候选安装包后单独验证签名、公证、Gatekeeper、冷启动、Sidecar、旧数据迁移和升级回滚。
6. 远端 CI、Release 资产、应用内更新、实际安装、用户验收逐层登记；前一层通过不自动代表后一层通过。
7. 只有独立审核计划全部通过，且得到明确发布授权，才允许推送标签或发布。

**Verification commands:**

```bash
bash scripts/verify-all.sh
git status --short
```

完整验证脚本会安装依赖并生成构建/测试产物，执行人员必须在隔离的干净 worktree 中运行。

## 6. 建议的提交切片

每个切片应能独立回滚，顺序如下：

1. `docs: reconcile current state and evidence taxonomy`
2. `feat: add unified readiness contract and onboarding`
3. `refactor: track pending actions without global loading`
4. `feat: add review snapshots and workflow revisions`
5. `fix: preserve run states and restore project run history`
6. `feat: complete project and node setup journeys`
7. `security: close session and credential transport gaps`
8. `feat: add task delivery and verification contract`
9. `a11y: complete responsive and recovery workflows`
10. `test: record candidate integration and delivery evidence`

提交信息只是建议，不构成提交、推送或发布授权。

## 7. 完成定义

满足以下全部条件，才可把本计划标记为“实现完成”：

- 首次用户不看文档也能完成项目、Planner、节点、规划、审核、运行和产物取得。
- 所有运行/任务状态与 Coordinator 原始状态一致，没有前端语义折叠。
- 重启、断线和切换项目后能恢复最近运行与事件上下文。
- 审核绑定不可变快照，变更通过新修订完成。
- 执行门禁由统一 Readiness 决定，前后端使用同一判断服务。
- 本地发现、SSH key 选择、host key 确认和节点诊断完整可用。
- 长期会话令牌不出现在 URL；Node Agent token 空值 fail closed；凭据不落普通 JSON/SQLite 明文。
- 任务写入范围、完成定义、机械验证和人工检查端到端贯通。
- 键盘、VoiceOver、200% 缩放、reduced-motion 与启动/运行失败恢复通过。
- 当前文档、测试、构建、包、真实 Hermes、远端节点、Release、安装和用户验收证据分别登记，且没有跨层夸大。
- 独立审核没有未解决的 P0/P1；P2 有明确接受人、理由和后续版本。

## 8. 明确不在本轮默认范围内

- 重做纸墨朱砂品牌与整套 UI。
- 更换 React、Tauri、FastAPI、SQLite 或 Zustand。
- 把 Coordinator 服务改造成公网多租户服务。
- 未经授权清理、暂存或提交现有二进制与 release 目录。
- 未经授权推送、创建 GitHub Release、签名、公证或部署远端节点。
- 用 Mock/Fake 结果替代真实 Hermes、真实远端、升级或用户验收。
