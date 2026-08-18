# XuanJi Codex-Style Product Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **完成度证据（2026-08-18，实现者自检 / owner self-check）：**
> 见 [`docs/reviews/2026-08-18-final-remediation-verification.md`](../../reviews/2026-08-18-final-remediation-verification.md)。
> 下列 Task 0–13 历史复选框**不**批量改成 `[x]`。独立审核、App 运行与 Release 仍未验证。

### Task 0–13 完成矩阵（2026-08-18）

只用 `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified`。
`tests_passed` 指 2026-08-18 无 App 门禁中的自动化覆盖，不是 VoiceOver / 真实 updater / 已安装包。

| Task | 主题 | 完成度 |
| --- | --- | --- |
| 0 | 基线与无 App 门禁 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 1 | 视觉 token / 字阶 / 主题 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 2 | 工作区骨架 / 导航 / 设置 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 3 | 卡片选中清晰度 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 4 | 五标签检查器 / 任务合同 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 5 | 思考模型领域 / API / 迁移 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 6 | Responses/Chat 适配器 / 快照 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 7 | 思考模型前端 / 默认 / 生成 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 8 | 用户可控更新 / 原生菜单 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 9 | 反馈 / 诊断 / 帮助 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 10 | 迁移备份 / 安全启动恢复 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 11 | 无障碍 / 响应式 / 性能 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 12 | Apache-2.0 文档与治理 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |
| 13 | 浏览器集成 / 证据归档 / 独立审核交接 | `source_present` / `tests_passed` / `runtime_unverified` / `release_unverified` |

**Goal:** 在不推翻现有三栏工作流架构的前提下，完成 Codex 风格产品基础重构、多个思考模型、用户可控更新、完整任务检查器、诊断帮助和开源治理，并保留当前候选基线中已经完成的安全与运行能力。

**Architecture:** 前端继续使用 React + Zustand + React Flow，以统一 token 和 feature service 重组 UI；后端在现有 FastAPI、SQLite `app_config`、`CredentialStore` 和 PlannerService 上增加思考模型注册表与 Responses/Chat 双适配器；Tauri 仅承担原生菜单、Updater 和系统桥接。新能力沿用当前 resource-level pending actions、审核修订、服务端 `allowed_actions`、一次性会话 ticket、Header/Blob 产物下载和 SQLite 备份，不建立平行实现。

**Tech Stack:** React 19、TypeScript 6、Zustand 5、React Flow 12、Vitest、Testing Library、Playwright、FastAPI、Pydantic 2、httpx、SQLite、pytest、Rust、Tauri 2、Apache-2.0。

## Global Constraints

- 执行基线为 `3232479e7a1e704a9ceddcee137e3ca256e55543` 或包含该提交的后续提交；开始每个任务前运行 `git status --short --branch`，不得覆盖其他所有者的未提交内容。
- 用户已经明确要求常规工作不要构建或启动 App，避免 macOS 菜单中出现多个应用实例。禁止运行 `npm run tauri dev`、`npm run build:tauri`、`tauri build`，禁止启动或安装 `.app`。
- 允许浏览器级 Vite build、Vitest、Playwright、pytest 和不启动 GUI 的 Rust 单元测试；所有构建输出放入系统临时目录或现有忽略目录。
- 不发真实 OpenAI 请求。Provider 测试必须使用 `httpx.MockTransport`；“测试连接”只有用户主动点击时才可发请求，并显示可能产生用量的提示。
- 不把 API Key、Authorization、会话 token、SSH 私钥、完整 prompt、项目文件内容或完整用户路径写入日志、SQLite、localStorage、URL、测试快照或诊断摘要。
- 旧 `/api/planner/config` 和 `planner_*` 历史字段保留一个兼容周期；新增用户界面和公共 API 使用“思考模型 / Thinking Model”。
- 工作流运行动作继续使用后端 `allowed_actions`；不要恢复基于前端猜测的 retry/skip/pause 等逻辑。
- 产物下载继续使用 Header 会话认证 + Blob；不要重新引入 query session token。
- 每个任务先写失败测试、观察预期失败，再写最小实现并执行目标测试。不要在同一提交中夹带无关重构。
- 每个任务的提交都只表示本地实现证据，不表示 GitHub 已上传、Release 已创建、签名/公证已完成、App 已安装或用户已验收。

---

## 0. 需求覆盖和阶段门禁

| 用户需求 | 负责任务 | 完成证据 |
|---|---|---|
| Codex 风格主题、字体、字号和整体 UI | Task 1、2、11 | token/组件测试 + 三主题浏览器截图 |
| 检查更新、反馈 | Task 8、9 | 状态机测试 + 菜单桥接测试 + GitHub 模板 |
| Planner 改为多个思考模型 | Task 5、6、7 | API/迁移/provider/UI/工作流快照测试 |
| 点击卡片后文字发虚 | Task 3 | 选中态 CSS 断言 + 2x DPR 截图矩阵 |
| 右侧工具和流程完整性 | Task 4 | 五标签检查器 + 完整任务合同 round-trip |
| macOS 通用基础能力 | Task 9、10、11、12 | 诊断/帮助/迁移/恢复/a11y/文档门禁 |

### 完成层级

1. **Implemented：** 本地代码和目标测试完成。
2. **Integrated candidate：** 所有任务合并到单一候选提交，浏览器/后端/Rust 门禁通过。
3. **Independent review：** 审核者检查需求、回归、安全和证据。
4. **Release candidate：** 版本、变更日志、发布资产和签名策略另行确认。
5. **Released/installed：** GitHub Release、签名/公证、安装和实际运行证据另行授权；本计划不自动进入该层。

---

### Task 0: 冻结当前基线和无 App 构建门禁

**Files:**

- Read: `docs/CURRENT_STATE.md`
- Read: `docs/EVIDENCE_INDEX.md`
- Read: `docs/releases/0.3.4-candidate-acceptance.md`
- Read: `scripts/verify-all.sh`
- Create: `docs/reviews/2026-08-14-codex-style-baseline.md`
- Modify: `docs/EVIDENCE_INDEX.md`

**Interfaces:**

```text
BaselineEvidence:
  source_sha
  branch
  existing_capabilities
  known_gaps
  allowed_validation
  prohibited_app_commands
  release_boundary
```

- [ ] 运行 `git status --short --branch` 和 `git rev-parse HEAD`，确认基线包含 `3232479e7a1e704a9ceddcee137e3ca256e55543`。
- [ ] 在基线文档列出已复用能力：readiness、审核快照/修订、pending actions、真实运行状态、运行历史、一次性 WS ticket、Header/Blob 下载、Keychain 迁移、SQLite 备份和任务交付合同。
- [ ] 将当前缺口限制为本计划列出的 UI、思考模型、更新/反馈、检查器、诊断/帮助、迁移/恢复适配和开源治理。
- [ ] 在基线文档明确禁止的命令和发布边界；说明当前 `0.3.4` 源码元数据不等于已安装/已发布版本。
- [ ] 运行现有不构建 App 的基线门禁：

```bash
bash scripts/verify-all.sh --skip-tauri-build
```

- [ ] 如果门禁存在与本计划无关的失败，在文档中逐项记录命令、错误和范围，不在本任务顺手修复。
- [ ] 校验文档链接：

```bash
rg -n "3232479e7a1e704a9ceddcee137e3ca256e55543|skip-tauri-build|不得构建|不代表发布" docs/reviews/2026-08-14-codex-style-baseline.md
git diff --check
```

- [ ] 提交：`docs: freeze codex-style redesign baseline`

---

### Task 1: 建立视觉 token、字阶和主题回归

**Files:**

- Create: `app/src/styles/tokens.css`
- Modify: `app/src/styles/globals.css`
- Modify: `app/src/app/AppShell.css`
- Modify: `app/src/lib/theme.ts`
- Modify: `app/src/lib/messages.zh-CN.ts`
- Modify: `app/src/lib/messages.en.ts`
- Create: `app/src/styles/__tests__/visual-tokens.test.ts`
- Modify: `app/src/__tests__/AppShell.test.tsx`

**Interfaces:**

```css
:root,
:root[data-theme="light"],
:root[data-theme="dark"] {
  --font-sans: ...;
  --font-mono: ...;
  --text-title: ...;
  --text-section: ...;
  --text-body: ...;
  --text-secondary: ...;
  --surface-canvas: ...;
  --surface-panel: ...;
  --border-subtle: ...;
  --accent: ...;
  --focus-ring: ...;
}
```

- [ ] 写 `visual-tokens.test.ts`，读取最终 CSS 并断言系统 sans、SF Mono、正文 13px、辅助文字不低于 12px、meta 11px，以及不存在产品展示用途的 `Songti SC` 和必要文本的 9/10px。
- [ ] 在 `AppShell.test.tsx` 增加 light/dark/system 状态映射和系统主题变化测试；先运行并确认新测试失败：

```bash
cd app && npm test -- src/styles/__tests__/visual-tokens.test.ts src/__tests__/AppShell.test.tsx
```

- [ ] 创建 `tokens.css`，定义浅色和深色的表面、文字、边框、语义色、焦点环、间距、圆角、控件高度、字阶和动画时长。
- [ ] 在 `globals.css` 引入 token，统一 body、button、input、textarea、select、code、链接、focus-visible 和 reduced-motion 基础样式。
- [ ] 移除大面积暖纸色、宋体展示字、必要信息的 9/10px 和无语义的重阴影；品牌红仅保留主操作和关键状态。
- [ ] 保持 `theme.ts` 现有 light/dark/system 存储合同，补齐系统主题实时变化和减少动态效果 CSS 媒体查询，不另建第二套主题状态。
- [ ] 运行目标测试和静态检查：

```bash
cd app && npm test -- src/styles/__tests__/visual-tokens.test.ts src/__tests__/AppShell.test.tsx
cd app && npm run lint
cd app && npm run build -- --outDir /tmp/xuanji-ui-token-dist
```

- [ ] 人工检查浏览器 build 未包含系统字体文件或新的未授权字体资产。
- [ ] 提交：`style: establish codex-inspired visual tokens`

---

### Task 2: 重组工作区骨架、导航和设置分类

**Files:**

- Modify: `app/src/app/AppShell.tsx`
- Modify: `app/src/app/AppShell.css`
- Modify: `app/src/features/projects/ProjectRail.tsx`
- Modify: `app/src/features/runs/RunBar.tsx`
- Create: `app/src/features/navigation/WorkspaceNav.tsx`
- Create: `app/src/features/navigation/__tests__/WorkspaceNav.test.tsx`
- Create: `app/src/features/settings/SettingsShell.tsx`
- Create: `app/src/features/settings/__tests__/SettingsShell.test.tsx`
- Modify: `app/src/lib/messages.zh-CN.ts`
- Modify: `app/src/lib/messages.en.ts`
- Modify: `app/src/__tests__/AppShell.test.tsx`

**Interfaces:**

```ts
type WorkspaceSection = 'projects' | 'workflow' | 'nodes' | 'thinking_models' | 'settings';
type SettingsSection = 'appearance' | 'thinking_models' | 'execution' | 'updates' | 'support' | 'about';
```

- [ ] 为五个主导航入口、折叠/展开、当前项 `aria-current`、键盘顺序和设置六分类编写失败测试。
- [ ] 在 AppShell 测试中锁定宽屏三栏、小屏折叠和右栏存在时的语义 landmark；运行失败测试：

```bash
cd app && npm test -- src/features/navigation/__tests__/WorkspaceNav.test.tsx src/features/settings/__tests__/SettingsShell.test.tsx src/__tests__/AppShell.test.tsx
```

- [ ] 新建 `WorkspaceNav`，默认 216px，折叠为 52px；折叠状态存入非敏感 localStorage 键 `xuanji.workspace.nav-collapsed`。
- [ ] 将 ProjectRail 变为“项目”分区内容，保留改名、删除、确认、项目目录和当前项目行为，不改项目 API。
- [ ] 精简 RunBar，只保留项目/工作流上下文、准备度、审核和一个当前主操作；次级运行控制放入明确的动作组或运行详情。
- [ ] 新建 SettingsShell，以分类导航承载现有主题、语言、思考模型、更新、反馈和关于信息；本任务先迁移容器，不提前实现 Task 7–9 的业务逻辑。
- [ ] 右侧检查器改为 CSS 可调整宽度 320–520px，并提供收起/恢复按钮；小于 1100px 使用覆盖抽屉，小于 860px 默认折叠左栏。
- [ ] 确保所有图标按钮有中文/英文 `aria-label` 和 tooltip；折叠后仍显示可访问名称。
- [ ] 运行目标测试、lint 和浏览器 build：

```bash
cd app && npm test -- src/features/navigation/__tests__/WorkspaceNav.test.tsx src/features/settings/__tests__/SettingsShell.test.tsx src/__tests__/AppShell.test.tsx
cd app && npm run lint
cd app && npm run build -- --outDir /tmp/xuanji-shell-dist
```

- [ ] 提交：`refactor: organize workspace and settings navigation`

---

### Task 3: 复现并修复工作流卡片选中后文字发虚

**Files:**

- Modify: `app/src/features/canvas/nodes/TaskNode.tsx`
- Modify: `app/src/features/canvas/WorkflowCanvas.tsx`
- Modify: `app/src/app/AppShell.css`
- Create: `app/src/features/canvas/__tests__/TaskNode.test.tsx`
- Modify: `app/src/features/canvas/__tests__/canvas-context-menu.test.tsx`
- Create: `app/e2e/canvas-clarity.spec.ts`
- Create: `app/e2e/fixtures/workflow.ts`

**Interfaces:**

```ts
interface TaskNodeVisualState {
  selected: boolean;
  focused: boolean;
  runStatus: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed';
  matchingNodeCount: number;
}
```

- [ ] 在组件测试中断言卡片只显示标题、角色、单行摘要、状态、输入/输出数量和调度/匹配摘要，不展开 prompt 或完整工具列表。
- [ ] 加入 CSS 合同测试，断言 `.task-node:hover`、`.task-node.is-selected` 和内部文本选中态不包含 `transform`、`scale`、`filter`、`translateZ` 或透明度动画。
- [ ] 在 Playwright 测试中截取默认、hover、selected、拖动后，以及 0.8/1/1.25 画布缩放；项目配置分别使用 light/dark 和 `deviceScaleFactor: 2`。
- [ ] 先运行组件测试并确认选中/hover transform 合同失败：

```bash
cd app && npm test -- src/features/canvas/__tests__/TaskNode.test.tsx src/features/canvas/__tests__/canvas-context-menu.test.tsx
```

- [ ] 移除节点 hover 的 `translateY(-1px)` 和所有选中几何变换；使用不改变布局尺寸的内描边/box-shadow 表达选中。
- [ ] 将运行状态、选中态和键盘焦点分离；每种状态同时具有非颜色信号。
- [ ] 对 `TaskNode` 使用稳定 props 和 `memo`，避免选择一个节点导致所有节点无意义重绘；不得改变 React Flow 的领域数据合同。
- [ ] 运行组件测试、启动浏览器测试栈并生成/比对截图：

```bash
cd app && npm test -- src/features/canvas/__tests__/TaskNode.test.tsx src/features/canvas/__tests__/canvas-context-menu.test.tsx
python3 scripts/e2e_stack.py --help
cd app && npm run test:e2e -- e2e/canvas-clarity.spec.ts
```

- [ ] 如果 `e2e_stack.py` 的实际参数与帮助不同，按脚本帮助使用仓库已有启动方式；只能启动浏览器前端和本地测试后端，不能启动 Tauri App。
- [ ] 在测试说明记录浏览器、DPR、缩放比和截图路径；视觉差异必须由审核者明确接受后更新基线。
- [ ] 提交：`fix: keep workflow node text crisp when selected`

---

### Task 4: 建立五标签检查器和完整任务编辑合同

**Files:**

- Modify: `app/src/features/inspector/Inspector.tsx`
- Modify: `app/src/features/inspector/TaskEditor.tsx`
- Modify: `app/src/features/inspector/ChoicePicker.tsx`
- Create: `app/src/features/inspector/InspectorTabs.tsx`
- Create: `app/src/features/inspector/TaskOverviewTab.tsx`
- Create: `app/src/features/inspector/TaskPromptTab.tsx`
- Create: `app/src/features/inspector/TaskExecutionTab.tsx`
- Create: `app/src/features/inspector/TaskOutputsTab.tsx`
- Create: `app/src/features/inspector/TaskRunDetailsTab.tsx`
- Create: `app/src/features/inspector/taskDraft.ts`
- Create: `app/src/features/inspector/__tests__/Inspector.test.tsx`
- Create: `app/src/features/inspector/__tests__/taskDraft.test.ts`
- Modify: `app/src/store/workspaceStore.ts`
- Modify: `app/src/store/__tests__/workspaceStore.test.ts`
- Modify: `app/src/lib/messages.zh-CN.ts`
- Modify: `app/src/lib/messages.en.ts`

**Interfaces:**

```ts
type InspectorTab = 'overview' | 'prompt_inputs' | 'execution' | 'outputs' | 'run_details';
type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

interface TaskDraft {
  title: string;
  description: string;
  prompt: string;
  agent_type: string;
  dependencies: string[];
  execution_policy: ExecutionPolicy;
  retry_policy: RetryPolicy;
  expected_outputs: ExpectedOutput[];
  writes: string[];
  done_definition: string[];
  verify: VerifyStep[];
  run_gate: RunGate;
}
```

- [ ] 为五个标签、键盘切换、保存状态、字段错误、任务切换 dirty 确认、审核只读和“创建新修订”编写失败组件测试。
- [ ] 为 `taskDraft` 编写 round-trip 测试，覆盖 `agent_type`、依赖、执行策略、重试、产物、writes、done definition、verify 和 run gate；断言无字段丢失。
- [ ] 在 store 测试中加入依赖编辑：阻止自依赖、环和未知任务；合法变更与画布边同步。
- [ ] 先运行并确认失败：

```bash
cd app && npm test -- src/features/inspector/__tests__/Inspector.test.tsx src/features/inspector/__tests__/taskDraft.test.ts src/store/__tests__/workspaceStore.test.ts
```

- [ ] 将现有单页 TaskEditor 拆为五个标签组件，但保留一个 TaskDraft 和一个显式保存入口，避免标签页各自保存造成覆盖。
- [ ] 概览展示角色、依赖、I/O、匹配节点数和未匹配原因；提供“前往节点”动作。
- [ ] Prompt 与输入页可编辑 `agent_type`、prompt 和 dependencies；依赖选择与画布连线共用 store 校验。
- [ ] 执行页保留 mode、固定节点/节点组、required models/tools/tags、timeout、retry；实时计算匹配节点摘要。
- [ ] 预期产物页覆盖 `expected_outputs`、`writes`、`done_definition`、`verify`、`run_gate`；相对路径和数字范围提供字段级错误。
- [ ] 运行详情页复用 RunHistory、TaskLog、ArtifactBrowser 和服务端 allowed actions；不复制运行状态和下载实现。
- [ ] `draft` 可编辑；`reviewed/archived` 只读并显示审核摘要，创建新修订调用现有 revision action 后再编辑。
- [ ] 保存失败时保留本地 TaskDraft；只有当前任务的保存按钮进入 saving，其他区域可继续查看。
- [ ] 运行测试、lint 和 browser build：

```bash
cd app && npm test -- src/features/inspector/__tests__/Inspector.test.tsx src/features/inspector/__tests__/taskDraft.test.ts src/store/__tests__/workspaceStore.test.ts src/features/workflow/__tests__/workflow-edit.test.tsx
cd app && npm run lint
cd app && npm run build -- --outDir /tmp/xuanji-inspector-dist
```

- [ ] 提交：`feat: complete tabbed workflow task inspector`

---

### Task 5: 增加思考模型领域、注册表 API 和旧配置迁移

**Files:**

- Create: `backend/src/xuanji/thinking_models/__init__.py`
- Create: `backend/src/xuanji/thinking_models/models.py`
- Create: `backend/src/xuanji/thinking_models/repository.py`
- Create: `backend/src/xuanji/thinking_models/service.py`
- Create: `backend/src/xuanji/api/thinking_models.py`
- Modify: `backend/src/xuanji/api/app.py`
- Modify: `backend/src/xuanji/api/planner.py`
- Modify: `backend/src/xuanji/api/errors.py`
- Modify: `backend/src/xuanji/storage/repositories.py`
- Modify: `backend/src/xuanji/storage/migrations.py`
- Modify: `backend/src/xuanji/storage/backup.py`
- Modify: `backend/src/xuanji/credentials.py`
- Create: `backend/tests/test_thinking_models_api.py`
- Create: `backend/tests/test_thinking_models_migration.py`
- Modify: `backend/tests/test_planner.py`
- Modify: `backend/tests/test_storage.py`
- Modify: `backend/tests/test_backup.py`

**Interfaces:**

```py
class ThinkingModelProfile(BaseModel):
    id: str
    display_name: str
    provider_kind: Literal["openai"]
    api_mode: Literal["responses", "chat_completions"]
    base_url: HttpUrl
    model_id: str
    credential_key: str
    enabled: bool = True
    is_default: bool = False
    reasoning_effort: Literal["none", "low", "medium", "high", "xhigh"] | None = None
    last_test_status: Literal["untested", "ok", "failed"] = "untested"
    last_tested_at: datetime | None = None
```

```text
GET    /api/thinking-models
POST   /api/thinking-models
PATCH  /api/thinking-models/{id}
DELETE /api/thinking-models/{id}
PUT    /api/thinking-models/{id}/default
POST   /api/thinking-models/{id}/test
```

- [ ] 编写 API 失败测试：空列表、创建、更新、删除、唯一默认、默认删除冲突、凭证 redaction、独立 credential key、无效 URL/模式/effort 和不存在 profile。
- [ ] 编写迁移失败测试：只有旧 planner 配置、已有新注册表、重复启动幂等、备份失败、写入失败和凭证 key 保留。
- [ ] 迁移测试断言旧 Key 不需要读取明文或重新保存；只复用 `credential_key` 引用。
- [ ] 先运行并确认失败：

```bash
cd backend && .venv/bin/python -m pytest tests/test_thinking_models_api.py tests/test_thinking_models_migration.py tests/test_planner.py tests/test_storage.py tests/test_backup.py -q
```

- [ ] 使用 SQLite 表建立注册表，不把 profile 数组作为无约束 JSON 塞回单一配置：新增 schema version 6 和 `thinking_model_profiles` 表，字段对应接口，`is_default` 用事务和唯一约束保证。
- [ ] repository 提供 list/get/create/update/delete/set_default 和 legacy migration；所有写操作在事务内完成。
- [ ] 迁移前调用现有 `backup_database`/校验能力；如果备份或新表写入失败，旧 `app_config["planner"]` 和 credential key 保持不变。
- [ ] 旧配置迁移为“默认思考模型”，`api_mode=chat_completions`，保留旧 base URL/model/credential key；写入单独迁移标记，重复启动不重复创建。
- [ ] 新 API 永不返回 credential；只返回 `credential_configured`。新建 profile 默认 credential key 为 `thinking-model.<uuid>.api-key`。
- [ ] 设置默认 profile 时在单一事务取消旧默认；删除 profile 时先处理默认冲突，成功删除后只删除该 profile 的 credential key。
- [ ] 兼容 `/api/planner/config`：GET 映射默认 profile；PUT 更新/创建默认 Chat profile，并返回现有旧格式。记录弃用响应 header，不移除旧测试。
- [ ] 将 readiness 中用户文案改为思考模型，但兼容错误码可以保留 `planner_not_configured` 一个周期。
- [ ] 运行目标和回归测试：

```bash
cd backend && .venv/bin/python -m pytest tests/test_thinking_models_api.py tests/test_thinking_models_migration.py tests/test_planner.py tests/test_storage.py tests/test_backup.py tests/test_readiness_api.py -q
```

- [ ] 提交：`feat: add thinking model registry and migration`

---

### Task 6: 实现 OpenAI Responses/Chat 适配器和工作流模型快照

**Protocol reference:** OpenAI 官方当前模型指南建议复杂推理、工具调用和多轮工作优先采用 Responses API：[Latest model guide](https://developers.openai.com/api/docs/guides/latest-model)。Chat Completions 在本计划中作为现有配置和 OpenAI-compatible 服务的显式兼容模式。

**Files:**

- Create: `backend/src/xuanji/thinking_models/providers.py`
- Modify: `backend/src/xuanji/planner/providers.py`
- Modify: `backend/src/xuanji/planner/service.py`
- Modify: `backend/src/xuanji/api/app.py`
- Modify: `backend/src/xuanji/api/workflows.py`
- Modify: `backend/src/xuanji/domain/models.py`
- Modify: `backend/src/xuanji/storage/migrations.py`
- Modify: `backend/src/xuanji/storage/repositories.py`
- Create: `backend/tests/test_openai_responses_provider.py`
- Modify: `backend/tests/test_planner.py`
- Modify: `backend/tests/test_api.py`
- Modify: `backend/tests/test_workflow_validation.py`

**Interfaces:**

```py
class ThinkingModelProvider(Protocol):
    async def complete(self, messages: list[dict[str, str]], model: str, *, reasoning_effort: str | None) -> str: ...

class OpenAIResponsesProvider: ...
class OpenAIChatCompletionsProvider: ...
```

```py
class PlanWorkflowRequest(BaseModel):
    project_id: str
    goal: str
    thinking_model_id: str | None = None
```

- [ ] 使用 `httpx.MockTransport` 编写 Responses 成功提取、结构化输出、401、429、超时、网络失败、无效 JSON、缺失 output 和不支持 reasoning 参数测试。
- [ ] 扩充 Chat adapter 测试，确保现有 OpenAI-compatible 行为和错误码不回退。
- [ ] 写 API 测试：显式 profile、默认 profile、禁用 profile、缺失 profile、无默认 profile，以及工作流快照包含 `planner_provider`、`planner_model` 和 `thinking_model_id`。
- [ ] 先运行失败测试：

```bash
cd backend && .venv/bin/python -m pytest tests/test_openai_responses_provider.py tests/test_planner.py tests/test_api.py tests/test_workflow_validation.py -q
```

- [ ] 将 provider 构造从单一 `services.planner` 改为按 profile 解析的 service/factory；不得把 API Key 放入 profile 对象或全局日志。
- [ ] Responses 调用 `<base_url>/responses`，请求使用结构化 JSON 输出；解析逻辑只提取最终文本/结构化内容并交给 PlannerService 现有校验修复流程。
- [ ] Chat 调用 `<base_url>/chat/completions`；共享鉴权、超时、429、错误归一和脱敏逻辑。
- [ ] `reasoning_effort` 为空时不发送；只有明确支持的模式才发送。上游返回 unsupported parameter 时映射稳定错误并给出关闭该参数的建议。
- [ ] workflow schema version 7 新增可空 `thinking_model_id`；历史行保持可读。repository 保存 profile id 和原有 provider/model 快照。
- [ ] profile 后续修改或删除时，历史 workflow 的 provider/model 快照保持不变；API 显示已删除配置时使用快照而非 404 覆盖历史。
- [ ] “测试连接”走同一 adapter，但使用最小、无项目内容的测试输入；端点只在用户显式调用时执行，并更新 last test 状态。
- [ ] 运行目标和工作流回归：

```bash
cd backend && .venv/bin/python -m pytest tests/test_openai_responses_provider.py tests/test_planner.py tests/test_api.py tests/test_workflow_validation.py tests/test_workflow_review_api.py -q
```

- [ ] 提交：`feat: support OpenAI thinking model modes`

---

### Task 7: 完成思考模型前端、默认选择和工作流生成接入

**Files:**

- Create: `app/src/features/thinking-models/ThinkingModelList.tsx`
- Create: `app/src/features/thinking-models/ThinkingModelEditor.tsx`
- Create: `app/src/features/thinking-models/ThinkingModelStatus.tsx`
- Create: `app/src/features/thinking-models/__tests__/ThinkingModels.test.tsx`
- Modify: `app/src/features/settings/PlannerSettings.tsx`
- Modify: `app/src/features/settings/SettingsShell.tsx`
- Modify: `app/src/features/onboarding/ReadinessCenter.tsx`
- Modify: `app/src/features/onboarding/__tests__/ReadinessCenter.test.tsx`
- Modify: `app/src/features/runs/RunBar.tsx`
- Modify: `app/src/lib/client.ts`
- Modify: `app/src/store/workspaceStore.ts`
- Modify: `app/src/store/__tests__/workspaceStore.test.ts`
- Modify: `app/src/lib/messages.zh-CN.ts`
- Modify: `app/src/lib/messages.en.ts`
- Modify: `app/src/features/workflow/__tests__/workflow-edit.test.tsx`

**Interfaces:**

```ts
interface ThinkingModelProfile {
  id: string;
  display_name: string;
  provider_kind: 'openai';
  api_mode: 'responses' | 'chat_completions';
  base_url: string;
  model_id: string;
  credential_key: string;
  enabled: boolean;
  is_default: boolean;
  reasoning_effort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null;
  credential_configured: boolean;
  last_test_status: 'untested' | 'testing' | 'ok' | 'failed';
  last_tested_at: string | null;
}
```

- [ ] 写失败测试：空状态、旧配置迁移后的默认卡、创建第二个 profile、唯一默认、编辑但不回显 Key、删除确认、默认删除阻止、测试连接 loading/success/failure 和模型生成选择。
- [ ] readiness 测试改为用户可见“思考模型”，并断言 `open_thinking_models` 深链接进入同一设置页面。
- [ ] store 测试覆盖 resource-level `pendingActions`，保存 profile 不能锁住项目/节点；测试连接也只锁对应 profile。
- [ ] 先运行失败测试：

```bash
cd app && npm test -- src/features/thinking-models/__tests__/ThinkingModels.test.tsx src/features/onboarding/__tests__/ReadinessCenter.test.tsx src/store/__tests__/workspaceStore.test.ts src/features/workflow/__tests__/workflow-edit.test.tsx
```

- [ ] 将 PlannerSettings 的单一表单替换为 ThinkingModelList + Editor；可继续保留文件一版作为兼容 re-export，但用户界面不显示 Planner 文案。
- [ ] 列表项显示名称、协议、base host、model id、默认标记、凭证状态和最近测试状态；不显示完整 credential key 或秘密。
- [ ] Editor 支持显示名、Responses/Chat 模式、base URL、model id、可选 reasoning effort、enabled 和新 Key 输入；留空 Key 表示保留现有凭证。
- [ ] “测试连接”按钮旁显示可能产生一次提供商请求/费用；未经点击不发请求。
- [ ] 工作流生成入口提供 profile 选择器，默认选择唯一默认 profile；请求发送 `thinking_model_id`，失败保留目标描述。
- [ ] 历史工作流显示 provider/model 快照；profile 删除后不把历史界面改为空。
- [ ] 全局搜索用户可见文案并逐项替换，允许兼容代码标识保留：

```bash
rg -n "Planner|规划器" app/src --glob '!**/*.test.*' --glob '!lib/client.ts' --glob '!store/workspaceStore.ts'
```

- [ ] 运行目标测试、lint 和 browser build：

```bash
cd app && npm test -- src/features/thinking-models/__tests__/ThinkingModels.test.tsx src/features/onboarding/__tests__/ReadinessCenter.test.tsx src/store/__tests__/workspaceStore.test.ts src/features/workflow/__tests__/workflow-edit.test.tsx
cd app && npm run lint
cd app && npm run build -- --outDir /tmp/xuanji-thinking-models-dist
```

- [ ] 提交：`feat: add multi thinking model experience`

---

### Task 8: 重构更新为用户可控状态机并接入原生菜单

**Files:**

- Rewrite: `app/src/lib/updater.ts`
- Create: `app/src/lib/__tests__/updater.test.ts`
- Create: `app/src/features/settings/UpdateSettings.tsx`
- Create: `app/src/features/settings/__tests__/UpdateSettings.test.tsx`
- Modify: `app/src/features/settings/SettingsShell.tsx`
- Modify: `app/src/app/AppShell.tsx`
- Modify: `app/src-tauri/src/lib.rs`
- Create: `app/src-tauri/src/update_menu.rs`
- Modify: `app/src-tauri/Cargo.toml`
- Modify: `app/src/lib/messages.zh-CN.ts`
- Modify: `app/src/lib/messages.en.ts`

**Interfaces:**

```ts
type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up_to_date'; checkedAt: string }
  | { kind: 'available'; candidate: UpdateCandidate }
  | { kind: 'downloading'; candidate: UpdateCandidate; progress: number | null }
  | { kind: 'verifying'; candidate: UpdateCandidate }
  | { kind: 'ready_to_install'; candidate: UpdateCandidate }
  | { kind: 'installing'; candidate: UpdateCandidate }
  | { kind: 'restart_required'; candidate: UpdateCandidate }
  | { kind: 'failed'; stage: string; code: string; message: string; retryable: boolean };

interface UpdateService {
  getState(): UpdateState;
  subscribe(listener: (state: UpdateState) => void): () => void;
  check(): Promise<void>;
  download(): Promise<void>;
  installAndRestart(): Promise<void>;
  reset(): void;
}
```

- [ ] 用 mock updater 写失败测试：check 不下载、最新版、可用版本详情、下载进度、验证、安装确认、各阶段失败、并发动作去重和重试。
- [ ] 设置页测试断言版本、发布日期、发布说明、大小/未知大小、最低系统要求、检查时间和动作按钮与状态一致。
- [ ] Rust 单元测试覆盖中文/英文菜单标签、稳定菜单 ID 和菜单事件发出 `xuanji://check-for-updates`，不启动 Tauri App。
- [ ] 先运行失败测试：

```bash
cd app && npm test -- src/lib/__tests__/updater.test.ts src/features/settings/__tests__/UpdateSettings.test.tsx
cargo test --manifest-path app/src-tauri/Cargo.toml --target-dir /tmp/xuanji-tauri-tests update_menu
```

- [ ] 删除 AppShell 启动时 `runSilentUpdate()`；删除或停用默认开启的自动下载/安装 localStorage 行为。
- [ ] 将 updater 分成 `check`、`download`、`installAndRestart`，每一步只有对应用户动作可以触发；异常归一为可展示错误码和阶段。
- [ ] UpdateSettings 展示候选详情，并在下载和安装前分别要求用户点击；P1 不出现默认自动安装开关。
- [ ] 在原生“璇玑”菜单加入“检查更新…”并使用稳定 ID；事件发送给前端后调用同一 `UpdateService.check()`，如果设置页未打开则导航到更新分类。
- [ ] 同一时刻菜单和设置按钮共享状态，重复点击不启动第二个检查或下载。
- [ ] 浏览器环境/插件不可用时显示“仅桌面版可检查更新”，测试和 Vite 浏览器 build 不报错。
- [ ] 运行测试、lint、browser build 和 Rust 单测：

```bash
cd app && npm test -- src/lib/__tests__/updater.test.ts src/features/settings/__tests__/UpdateSettings.test.tsx src/__tests__/AppShell.test.tsx
cd app && npm run lint
cd app && npm run build -- --outDir /tmp/xuanji-update-dist
cargo test --manifest-path app/src-tauri/Cargo.toml --target-dir /tmp/xuanji-tauri-tests update_menu
```

- [ ] 明确检查未运行任何 Tauri dev/build/App 启动命令。
- [ ] 提交：`feat: make desktop updates explicit and user controlled`

---

### Task 9: 完成反馈、诊断、帮助和兼容性中心

**Files:**

- Create: `app/src/features/support/FeedbackActions.tsx`
- Create: `app/src/features/support/DiagnosticsCenter.tsx`
- Create: `app/src/features/support/HelpCenter.tsx`
- Create: `app/src/features/support/CompatibilityPanel.tsx`
- Create: `app/src/features/support/supportSummary.ts`
- Create: `app/src/features/support/__tests__/SupportCenter.test.tsx`
- Create: `app/src/features/support/__tests__/supportSummary.test.ts`
- Modify: `app/src/features/settings/SettingsShell.tsx`
- Modify: `app/src/lib/runtime.ts`
- Modify: `app/src/lib/client.ts`
- Modify: `backend/src/xuanji/api/readiness.py`
- Create: `backend/src/xuanji/api/diagnostics.py`
- Create: `backend/src/xuanji/diagnostics.py`
- Modify: `backend/src/xuanji/api/app.py`
- Create: `backend/tests/test_diagnostics_api.py`
- Modify: `app/src/lib/messages.zh-CN.ts`
- Modify: `app/src/lib/messages.en.ts`
- Create: `.github/ISSUE_TEMPLATE/bug-report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature-request.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`

**Interfaces:**

```ts
interface DiagnosticSummary {
  appVersion: string;
  osVersion: string;
  architecture: string;
  coordinator: 'ready' | 'degraded' | 'offline';
  database: 'ready' | 'needs_attention';
  thinkingModels: { total: number; enabled: number; defaultConfigured: boolean };
  nodes: { total: number; online: number };
  updateService: 'available' | 'unavailable';
  errorCodes: string[];
}
```

- [ ] 写后端失败测试，覆盖 Coordinator/数据库/项目/思考模型/节点摘要和错误码；构造 secret、token、完整路径和 prompt，断言 API 输出不包含它们。
- [ ] 写前端失败测试：运行诊断、复制摘要、打开日志、打开帮助、Bug/Feature 链接、opener 失败时回退 URL、中文/英文和无桌面 bridge 状态。
- [ ] `supportSummary.test.ts` 使用敏感字符串矩阵，断言脱敏用户名、home 路径、Authorization、API key、session token、query token 和 prompt 内容。
- [ ] 先运行失败测试：

```bash
cd backend && .venv/bin/python -m pytest tests/test_diagnostics_api.py tests/test_readiness_api.py -q
cd app && npm test -- src/features/support/__tests__/SupportCenter.test.tsx src/features/support/__tests__/supportSummary.test.ts
```

- [ ] 后端 diagnostics 只返回版本、系统、状态、计数、脱敏路径标签和稳定错误码；不返回原始配置 JSON、credential key、项目内容或日志正文。
- [ ] DiagnosticsCenter 展示检查结果、建议动作、重新检查、复制脱敏摘要、打开日志目录和故障排除文档。
- [ ] CompatibilityPanel 展示当前 macOS、架构、应用声明的最低版本和不满足项；未知支持状态显示“未验证”，不能写成支持。
- [ ] HelpCenter 深链接到项目内用户指南、思考模型、节点、审核、运行、产物、更新和排障章节。
- [ ] FeedbackActions 使用仓库 GitHub Issue URL 和模板 query；opener 失败时显示可复制链接和明确错误。
- [ ] Issue 模板要求版本、macOS、复现步骤、预期/实际结果和脱敏日志；显著禁止粘贴 API Key、Token、Cookie、SSH key 和隐私数据。
- [ ] 运行目标测试和回归：

```bash
cd backend && .venv/bin/python -m pytest tests/test_diagnostics_api.py tests/test_readiness_api.py tests/test_session_security.py -q
cd app && npm test -- src/features/support/__tests__/SupportCenter.test.tsx src/features/support/__tests__/supportSummary.test.ts src/features/runs/__tests__/redaction.test.ts
cd app && npm run lint
cd app && npm run build -- --outDir /tmp/xuanji-support-dist
```

- [ ] 提交：`feat: add diagnostics help and feedback center`

---

### Task 10: 加固思考模型迁移备份和安全启动恢复

**Files:**

- Modify: `backend/src/xuanji/storage/backup.py`
- Modify: `backend/src/xuanji/storage/migrations.py`
- Modify: `backend/src/xuanji/api/app.py`
- Create: `backend/src/xuanji/recovery.py`
- Create: `backend/src/xuanji/api/recovery.py`
- Create: `backend/tests/test_config_recovery.py`
- Modify: `backend/tests/test_backup.py`
- Modify: `backend/tests/test_storage.py`
- Create: `app/src/features/support/RecoveryPanel.tsx`
- Create: `app/src/features/support/__tests__/RecoveryPanel.test.tsx`
- Modify: `app/src/features/settings/SettingsShell.tsx`
- Modify: `app/src/lib/client.ts`

**Interfaces:**

```py
class RecoveryState(BaseModel):
    safe_mode: bool
    reason_code: str | None
    latest_verified_backup: str | None
    available_actions: list[Literal["open_diagnostics", "restore_backup", "reset_ui_state"]]
```

- [ ] 写失败测试：schema 5→6→7 前生成并验证备份、备份失败停止迁移、迁移中断保持旧数据、损坏配置进入 safe mode、恢复最近验证备份、恢复失败不覆盖当前 DB。
- [ ] 前端测试断言安全模式只允许后端返回的动作，重置 UI 状态不删除项目、工作流、节点、凭证或数据库。
- [ ] 先运行失败测试：

```bash
cd backend && .venv/bin/python -m pytest tests/test_config_recovery.py tests/test_backup.py tests/test_storage.py -q
cd app && npm test -- src/features/support/__tests__/RecoveryPanel.test.tsx
```

- [ ] 在 schema 6/7 迁移前调用一致性备份并校验；备份文件使用应用数据目录内受控文件名和数量上限，不接受用户输入路径。
- [ ] 迁移事务失败时不推进 schema version；保留旧表、旧 app_config 和 credential 引用。
- [ ] 连续 Coordinator 启动失败或数据库配置损坏时暴露 recovery state；不要把一次普通网络失败当作 safe mode。
- [ ] 恢复动作先验证备份、再创建当前 DB 的保护副本、最后原子替换；失败时回到原 DB。
- [ ] UI 提供打开诊断、恢复最近验证备份和重置非敏感 UI 状态；所有破坏性动作二次确认并说明不会处理 Keychain。
- [ ] 运行目标及现有恢复/执行回归：

```bash
cd backend && .venv/bin/python -m pytest tests/test_config_recovery.py tests/test_backup.py tests/test_storage.py tests/test_execution_integration.py tests/test_project_runs_api.py -q
cd app && npm test -- src/features/support/__tests__/RecoveryPanel.test.tsx src/features/runs/__tests__/events.test.tsx
```

- [ ] 提交：`feat: protect configuration migrations and recovery`

---

### Task 11: 完成无障碍、响应式和性能保护

**Files:**

- Modify: `app/src/app/AppShell.css`
- Modify: `app/src/styles/globals.css`
- Modify: `app/src/app/AppShell.tsx`
- Modify: `app/src/features/canvas/WorkflowCanvas.tsx`
- Modify: `app/src/features/canvas/nodes/TaskNode.tsx`
- Modify: `app/src/features/inspector/Inspector.tsx`
- Modify: `app/src/features/runs/TaskLog.tsx`
- Modify: `app/src/store/workspaceStore.ts`
- Create: `app/e2e/product-foundation-a11y.spec.ts`
- Create: `app/e2e/product-foundation-responsive.spec.ts`
- Create: `app/src/__tests__/render-performance.test.tsx`
- Modify: `docs/ACCESSIBILITY_CHECKLIST.md`

**Interfaces:**

```text
Breakpoints:
  >= 1100px: three panes
  860px–1099px: collapsed navigation + inspector drawer
  < 860px: single primary content + overlay navigation/inspector

Accessibility states:
  keyboard-only
  reduced-motion
  200-percent zoom
  light/dark/system
```

- [ ] 写浏览器失败测试：从项目到思考模型、工作流卡片、五标签检查器、审核、运行详情、更新和诊断的键盘路径；检查焦点可见和抽屉 focus return。
- [ ] 写响应式测试覆盖 1440×900、1100×800、860×760 和 768×720；断言主操作不被裁切，左右栏可恢复。
- [ ] 写 render 性能测试：选择一个任务时未变化的 TaskNode 不重复渲染；思考模型保存不触发整个工作流状态重载；更新检查不阻塞初始 AppShell 渲染。
- [ ] 先运行组件性能测试并确认失败：

```bash
cd app && npm test -- src/__tests__/render-performance.test.tsx
```

- [ ] 使用 Zustand 精确 selector、memo 和稳定 callback 限制重绘；不要用全局 `loading` 取代当前 pending actions。
- [ ] TaskLog 为长日志设置显示上限/增量渲染，保留完整数据的安全获取路径，不把全部日志同时塞入 DOM。
- [ ] 实现抽屉焦点陷阱、Escape 关闭和触发按钮焦点恢复；tablist 使用正确 aria role 和键盘左右切换。
- [ ] reduced-motion 下禁用画布非必要过渡；200% 放大时不出现必须横向滚动才能保存的表单。
- [ ] 更新 ACCESSIBILITY_CHECKLIST，记录自动化覆盖和仍需真实 App 验证的 VoiceOver/菜单项，不伪造运行证据。
- [ ] 运行测试、lint 和浏览器 E2E：

```bash
cd app && npm test -- src/__tests__/render-performance.test.tsx src/__tests__/AppShell.test.tsx
cd app && npm run lint
cd app && npm run build -- --outDir /tmp/xuanji-a11y-dist
cd app && npm run test:e2e -- e2e/product-foundation-a11y.spec.ts e2e/product-foundation-responsive.spec.ts e2e/canvas-clarity.spec.ts
```

- [ ] 将必须依赖真实 Tauri/App 的 VoiceOver、原生菜单和更新安装验证登记为 release-owner 后续证据，不在本任务构建 App。
- [ ] 提交：`perf: harden accessibility responsive layout and rendering`

---

### Task 12: 补齐 Apache-2.0 开源文档和自动治理

**Files:**

- Modify: `README.md`
- Modify: `LICENSE`
- Modify: `NOTICE`
- Modify: `SECURITY.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/OPEN_SOURCE.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/TROUBLESHOOTING.md`
- Modify: `docs/PRODUCT.md`
- Modify: `docs/NAMING.md`
- Modify: `docs/RELEASE_AND_BOUNDARY.md`
- Modify: `docs/EVIDENCE_INDEX.md`
- Create: `docs/THINKING_MODELS.md`
- Create: `docs/UPDATES_AND_FEEDBACK.md`
- Create: `docs/DIAGNOSTICS_AND_RECOVERY.md`
- Modify: `.github/ISSUE_TEMPLATE/bug-report.yml`
- Modify: `.github/ISSUE_TEMPLATE/feature-request.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `scripts/check-open-source-docs.sh`
- Modify: `.github/workflows/verify.yml`

**Interfaces:**

```text
Required public entries:
  README.md
  LICENSE
  NOTICE
  SECURITY.md
  CONTRIBUTING.md
  docs/OPEN_SOURCE.md
  issue templates
  pull request template
```

- [ ] 先写 `check-open-source-docs.sh` 的失败断言清单：必需文件、Apache-2.0 标识、README 链接、NOTICE 依赖来源、版本来源、禁止秘密模式和文档相对链接。
- [ ] 运行脚本并记录当前失败：

```bash
bash scripts/check-open-source-docs.sh
```

- [ ] 审计 LICENSE 为完整 Apache License 2.0 正文，README/package/backend/Tauri 元数据与其一致；不引入额外商业限制或未定义 CLA。
- [ ] NOTICE 列出实际分发依赖、Logo/图标/素材来源和商标边界；系统字体只记录使用，不作为打包资产列出。
- [ ] README 增加产品定位、最低环境、快速开始、隐私边界、思考模型、更新方式、贡献、安全、许可证和发布边界。
- [ ] THINKING_MODELS 说明 Responses/Chat、多个 profile、凭证存储、测试连接用量提示、旧配置迁移和不支持范围。
- [ ] UPDATES_AND_FEEDBACK 说明检查/下载/安装分步行为、无默认静默更新、反馈和脱敏要求。
- [ ] DIAGNOSTICS_AND_RECOVERY 说明诊断范围、支持摘要、备份恢复和不上传日志。
- [ ] SECURITY 明确本机数据、网络出口、凭证、日志、公开 Issue 与私密漏洞报告边界；不承诺没有证据支持的安全结论。
- [ ] CONTRIBUTING 和 PR 模板加入目标测试、隐私、依赖许可、文档同步、无 App 构建常规门禁和证据分层要求。
- [ ] verify workflow 在现有测试前运行 `scripts/check-open-source-docs.sh`；不在普通 PR 工作流新增 Tauri App build。
- [ ] 运行文档脚本和链接/敏感模式检查：

```bash
bash scripts/check-open-source-docs.sh
rg -n "API[_ -]?KEY|Authorization: Bearer|session_token=|BEGIN .*PRIVATE KEY" README.md NOTICE SECURITY.md CONTRIBUTING.md docs .github --glob '*.md' --glob '*.yml'
git diff --check
```

- [ ] 对敏感模式扫描结果逐条判断：模板中的禁止示例允许保留，但不得出现真实值。
- [ ] 提交：`docs: complete Apache-2.0 product and support guidance`

---

### Task 13: 浏览器级集成验证、证据归档和独立审核交接

**Files:**

- Create: `app/e2e/product-foundation-journey.spec.ts`
- Modify: `scripts/e2e_stack.py`
- Modify: `scripts/verify-all.sh`
- Create: `docs/reviews/2026-08-14-codex-style-implementation-review.md`
- Modify: `docs/EVIDENCE_INDEX.md`
- Modify: `docs/CURRENT_STATE.md`

**End-to-end journey:**

```text
启动浏览器测试栈
  → 选择/创建项目
  → readiness 引导到思考模型
  → 创建两个 profile 并设置默认
  → mock 测试连接
  → 生成工作流并保留模型快照
  → 选中卡片，五标签编辑完整任务合同
  → 审核并进入只读
  → 创建新修订
  → 启动 mock run，观察 allowed actions/日志/产物
  → 检查更新但不下载
  → 打开诊断和反馈回退
```

- [ ] 编写 journey 失败测试，使用 fake credentials、mock providers、mock update candidate 和本地 fake node；不访问真实 OpenAI/GitHub Release 安装端点。
- [ ] 确保 `e2e_stack.py` 支持确定性 fixture，并在退出时关闭浏览器前端和测试后端；不得启动 Tauri App。
- [ ] 在 `verify-all.sh --skip-tauri-build` 中加入新前端/后端/文档测试，但保持参数真的跳过 Tauri App build。
- [ ] 运行目标 journey：

```bash
cd app && npm run test:e2e -- e2e/product-foundation-journey.spec.ts e2e/canvas-clarity.spec.ts e2e/product-foundation-a11y.spec.ts e2e/product-foundation-responsive.spec.ts
```

- [ ] 运行完整后端测试：

```bash
cd backend && .venv/bin/python -m pytest -q
```

- [ ] 运行完整前端测试、lint 和浏览器 build：

```bash
cd app && npm test
cd app && npm run lint
cd app && npm run build -- --outDir /tmp/xuanji-product-foundation-dist
```

- [ ] 运行 Rust 单元测试到临时目录，不构建 bundle：

```bash
cargo test --manifest-path app/src-tauri/Cargo.toml --target-dir /tmp/xuanji-tauri-tests
```

- [ ] 运行总门禁和文档检查：

```bash
bash scripts/check-open-source-docs.sh
bash scripts/verify-all.sh --skip-tauri-build
git diff --check
git status --short --branch
```

- [ ] 在 implementation review 中按需求逐项列出测试命令、结果、提交 SHA、截图路径、未验证的真实 App 项和风险；不得写“全部上线”或“已发布”。
- [ ] 独立审核者检查：UI 一致性、卡片清晰度、任务合同无丢失、模型迁移、凭证隔离、更新副作用、诊断脱敏、a11y、开源文件和发布边界。
- [ ] 独立审核未通过时仅登记修复项并回到对应 Task；不要在审核文档中用“可忽略”掩盖阻断问题。
- [ ] 通过后提交：`test: verify codex-style product foundation candidate`

---

## 14. 真实 App 与发布后续门禁（本计划不执行）

只有用户单独授权构建/发布后，Release Owner 才能执行以下工作：

1. 在隔离环境构建唯一 `.app` 候选，不启动多个副本。
2. 验证原生菜单“检查更新…”、状态栏菜单、窗口恢复、VoiceOver、Keychain 和真实 updater UI。
3. 验证签名、公证、Sparkle/Tauri updater 签名和 Release 资产。
4. 安装到明确目标并验证旧版本迁移、启动、更新和卸载。
5. 由用户完成一次最终体验验收。
6. 经授权后再更新版本、提交、推送 GitHub、创建 Release；每层证据分别报告。

这些步骤未执行时，最终状态只能写“本地实现/测试候选”或“独立审核通过”，不能写“已上线”“已发布”或“已安装”。

## 15. 最终交付清单

- [ ] 所有 Task 0–13 各自有单一职责提交。
- [ ] 两种思考模型协议均仅用 mock 测试，不产生真实模型费用。
- [ ] 旧 planner 配置和 Key 引用迁移无损且幂等。
- [ ] 更新检查、下载、安装为三个用户可控动作，启动无静默安装。
- [ ] 工作流卡片选中无自身 transform/filter，清晰度截图矩阵已归档。
- [ ] 五标签检查器覆盖完整任务合同和审核修订流程。
- [ ] 诊断/反馈摘要通过敏感信息矩阵测试。
- [ ] 浅色/深色/system、键盘、reduced-motion、200% 和响应式测试完成。
- [ ] Apache-2.0、NOTICE、README、SECURITY、CONTRIBUTING 和模板检查通过。
- [ ] `bash scripts/verify-all.sh --skip-tauri-build` 通过或所有非本计划失败有明确证据和所有者。
- [ ] 没有构建、启动或安装 `.app`。
- [ ] 没有自动上传 GitHub、创建 Release 或宣称已发布。
