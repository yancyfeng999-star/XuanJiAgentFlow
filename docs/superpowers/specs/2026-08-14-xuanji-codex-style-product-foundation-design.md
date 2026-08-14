# 璇玑 Codex 风格产品基础重构设计规格

**状态：** 已确认方案 A，等待按实施计划执行

**设计日期：** 2026-08-14

**适用基线：** `3232479e7a1e704a9ceddcee137e3ca256e55543` 及其已合并候选能力

**工作模式：** Product

**交付边界：** 本文是设计规格，不代表源码已实现、App 已构建、版本已发布或 GitHub 已更新

## 1. 决策摘要

璇玑保留现有“三栏工作区 + 工作流画布”的产品结构，不改造成 Codex 的外观复制品。重构目标是借鉴 Codex 的信息密度、层级秩序、克制配色、清晰状态和可预测交互，建立属于璇玑的现代 macOS 桌面产品基础。

本次锁定以下产品决策：

1. 保留项目栏、工作流画布、右侧检查器三栏结构；左栏可折叠，右栏可调整宽度并可收起。
2. 移除宋体展示字和过小字号，改用 macOS 系统无衬线字体与统一字阶。
3. “规划器”面向用户统一改名为“思考模型”；支持多个配置，第一阶段适配 OpenAI Responses API，并保留 Chat Completions 兼容模式。
4. 更新改为用户可控的检查、查看详情、下载、验证、安装流程；不再默认静默下载和安装。
5. 工作流卡片只承担快速识别，完整配置进入右侧五个标签页；选中卡片不再发生位移、缩放或滤镜变化。
6. 已审核工作流保持只读，修改必须“创建新修订”，不能悄悄改变审核快照。
7. 复用当前候选基线中已经完成的安全、恢复、审核和运行能力，不重复建设。
8. 所有 P1 改动必须支持中文和英文、浅色/深色/跟随系统、键盘操作、减少动态效果和 200% 放大。

## 2. 背景与问题定义

### 2.1 当前主要体验问题

- 视觉语言混杂：暖纸色、朱红、展示宋体、阴影和密集小字号同时出现，降低了专业感和可读性。
- 字号层级失衡：界面存在大量 9–11px 文本，macOS Retina 下仍显得拥挤，英文和中文混排也不稳定。
- 设置结构混乱：思考模型、语言、更新和反馈平铺在同一页面，用户无法建立清晰的配置心智模型。
- “Planner”语义过于抽象且只有一个配置，无法表达多个模型、默认模型、兼容协议和连接状态。
- 手动“检查更新”实际会继续下载并安装，动作名称与副作用不一致；应用启动还会默认执行静默更新。
- 工作流节点选中时与 React Flow 的画布变换叠加，存在文字发虚风险；当前 CSS 还对节点应用位移动画。
- 右侧检查器把编辑表单、摘要和运行信息连续堆叠，缺乏层级，用户难以判断哪些字段影响调度、哪些字段决定交付。
- 当前任务编辑器虽然已经支持 `writes`、`done_definition`、`verify`、`run_gate`，但没有在同一编辑面清晰提供 `agent_type` 和依赖管理。

### 2.2 目标

- 让新用户在不阅读说明书的情况下完成：选择项目 → 配置思考模型 → 生成/编辑工作流 → 审核 → 运行 → 查看结果。
- 让熟练用户能快速定位设置、节点、思考模型、更新与诊断，不需要在长页面中滚动寻找。
- 让每个按钮的名称、状态和副作用一致；所有长操作均有进度、失败原因和安全重试路径。
- 让工作流卡片在点击、缩放、拖动、深浅主题和 Retina 显示下保持清晰。
- 让右侧检查器完整覆盖当前后端任务合同，并明确保存、校验、只读和修订状态。
- 为更新、反馈、诊断、帮助、数据迁移和恢复建立可扩展的 macOS 产品基础。

### 2.3 非目标

- 不重写调度器、执行引擎、产物管理或 Hermes 节点协议。
- 不新增账号体系、云同步、远程遥测或崩溃上报服务。
- 不自动安装第三方 CLI、模型或节点软件。
- 不导出 API Key、SSH 私钥、会话令牌或 Keychain 内容。
- 不在常规 Pull Request 验证中构建、启动或安装 `.app`。
- 不把代码合并、版本号相等或候选校验通过描述为已发布。

## 3. 当前基线与复用边界

### 3.1 已存在并必须复用

| 能力 | 当前证据 | 本次处理 |
|---|---|---|
| 项目/工作流/节点/运行三栏工作区 | `app/src/app/AppShell.tsx` | 重组视觉和导航，不推翻领域流程 |
| 浅色/深色/跟随系统 | `app/src/lib/theme.ts` | 保留状态模型，重做 token 和组件样式 |
| 准备度与首次引导 | `ReadinessCenter.tsx`、`/api/readiness` | 改名和视觉优化，增加深链接，不另建平行体系 |
| 工作流审核快照与修订 | `ReviewWorkspace.tsx`、workflow review API | 右栏只读和新修订入口复用现有合同 |
| 资源级 pending actions | `workspaceStore.ts` | 新增保存/连接/更新状态时沿用该模式 |
| 服务端运行 `allowed_actions` | `RunControls.tsx`、run API | 保持服务端为动作权限唯一来源 |
| 运行历史和恢复 | `RunHistory.tsx`、`execution/recovery.py` | 在运行详情页呈现，不另造运行状态机 |
| 产物安全下载 | `ArtifactBrowser.tsx` | 保留 Header 会话认证 + Blob，不回退到 URL token |
| 一次性 WebSocket ticket | session ticket API | 不改回长期会话 token |
| Keychain 凭证抽象与迁移 | `backend/src/xuanji/credentials.py` | 思考模型按 profile 使用独立 key |
| SQLite 在线备份/校验/恢复 | `backend/src/xuanji/storage/backup.py` | 用于配置迁移前备份，不重复实现备份引擎 |
| 任务交付合同 | `writes`、`done_definition`、`verify`、`run_gate` | 重做右栏组织和校验，不重新定义合同 |
| 原生菜单和状态栏 | `app/src-tauri/src/lib.rs` | 增加检查更新入口并与 Web UI 共用服务 |
| Tauri updater | `app/src/lib/updater.ts`、`tauri.conf.json` | 从静默安装改造成显式状态机 |

### 3.2 需要新增或重构

- 统一视觉 token、字阶、焦点态、组件密度和三主题回归基线。
- 可折叠左栏、分区导航、可调整/收起的右侧检查器和更安静的顶部运行栏。
- 思考模型注册表、多配置 API、默认模型、测试连接、Responses/Chat 双适配器和旧配置迁移。
- 卡片清晰度修复、选中态重构、节点摘要和浏览器截图测试。
- 五标签检查器、`agent_type`、依赖、匹配节点、保存状态和字段错误。
- 更新状态机、更新详情、原生菜单入口、GitHub Issue 反馈模板和浏览器回退。
- 诊断与帮助中心、脱敏支持摘要、兼容性信息和设置损坏时的安全启动路径。
- 开源文档、Apache-2.0/NOTICE/依赖边界、Issue/PR 模板和文档自动检查。

## 4. 信息架构

### 4.1 主工作区

```text
┌───────────────────────────────────────────────────────────────────────┐
│ 顶部栏：当前项目 / 工作流版本 / 准备度 / 审核 / 运行主操作            │
├──────────────┬──────────────────────────────────────┬─────────────────┤
│ 左侧导航     │ 工作流画布 / 审核工作区 / 节点页面    │ 右侧检查器      │
│ 216px        │ 自适应                               │ 360px 可调整    │
│              │                                      │ 可收起          │
│ 项目         │                                      │                 │
│ 工作流       │                                      │                 │
│ 节点         │                                      │                 │
│ 思考模型     │                                      │                 │
│ 设置         │                                      │                 │
└──────────────┴──────────────────────────────────────┴─────────────────┘
```

- 顶部栏高度 48–52px，只放全局状态和当前步骤主操作。
- 左栏默认 216px，收起后保留 52px 图标栏；项目列表是“项目”分区内容，不再与全局导航竞争。
- 中央区保持 React Flow 画布；审核时切换为现有 ReviewWorkspace，不创建第二套工作流数据源。
- 右栏默认 360px，可在 320–520px 范围调整；关闭后由顶部图标恢复。
- 小于 1100px 时右栏变为覆盖式抽屉；小于 860px 时左栏默认收起，但不隐藏核心操作。

### 4.2 设置结构

设置页面使用左侧分类 + 右侧详情：

1. 外观：主题、界面密度、减少动态效果、语言。
2. 思考模型：多模型列表、默认模型、测试连接、创建/编辑/删除。
3. 节点与执行：默认调度偏好、节点入口、运行安全说明。
4. 更新：当前版本、检查更新、候选信息、下载/安装状态、后续自动检查选项。
5. 诊断与帮助：系统兼容性、Coordinator 状态、数据库/日志位置、复制支持摘要、打开日志和文档。
6. 关于：版本、许可证、开源仓库、第三方声明。

“思考模型”在主导航有直达入口，同时复用设置中的同一页面和状态，不维护两份模型配置 UI。

## 5. 视觉系统

### 5.1 字体与字阶

```css
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
--font-mono: "SFMono-Regular", "SF Mono", ui-monospace, Menlo, monospace;

--text-title: 18px / 1.35 / 600;
--text-section: 15px / 1.4 / 600;
--text-body: 13px / 1.5 / 400;
--text-control: 13px / 1.2 / 500;
--text-secondary: 12px / 1.45 / 400;
--text-meta: 11px / 1.35 / 500;
```

- 不再使用 `Songti SC` 作为产品标题字体。
- 正文、输入框和按钮不低于 13px；辅助信息不低于 12px；只有短标签和时间戳允许 11px。
- 不使用 9px 或 10px 传达任何必要信息。
- 数字状态和日志片段使用等宽字体；普通中文不使用等宽字体。

### 5.2 色彩

- 中性色采用石墨灰、灰白和低饱和分隔线，浅色主题不使用大面积暖纸色。
- 品牌红只用于主操作、重要选中提示和错误边界，不能同时承担所有层级的强调。
- 成功、警告、错误和信息状态各有语义色，并同时配合图标或文案，不仅依赖颜色。
- 深色主题独立调校表面层级，不能简单反相浅色主题。
- 所有正文与交互控件满足 WCAG AA；焦点环和选中边框在三主题下均清晰。

### 5.3 间距、圆角和阴影

- 基础间距采用 4/8 体系：4、8、12、16、24、32。
- 输入框、按钮和卡片圆角以 6–8px 为主；弹层可使用 10px。
- 默认使用边框和表面色建立层级，阴影仅用于浮层、抽屉和上下文菜单。
- 控件高度 30–34px，主按钮不靠巨大尺寸获取关注。

### 5.4 动效

- 普通状态切换 120–160ms；抽屉 180–220ms。
- 节点选中不使用 `transform`、`scale`、`filter`、模糊或透明度动画。
- 开启“减少动态效果”后禁用非必要位移和缩放，只保留立即状态切换。

## 6. 工作流画布与卡片清晰度

### 6.1 卡片信息合同

卡片只显示：

- 标题；
- 角色（`agent_type`）；
- 单行摘要；
- 状态；
- 输入/输出数量；
- 调度方式或匹配节点提示。

Prompt、完整工具列表、交付判据和验证命令不在卡片展开，统一进入右侧检查器。

### 6.2 选中态

- 默认：中性表面 + 1px 边框。
- 悬停：边框和表面轻微变化，不位移。
- 选中：2px 品牌色内描边或等价 box-shadow，背景轻微强调，不改变几何尺寸。
- 运行中/成功/失败：使用左侧状态条或状态图标，与选中态可同时存在。
- 键盘焦点：独立焦点环，不能与选中态混为一谈。

### 6.3 清晰度约束

- 移除 `.task-node:hover { transform: translateY(...) }` 及节点选中相关 transform/filter。
- 节点内部文本不单独使用 transform；避免在非整数缩放上再嵌套 translateZ 等合成层技巧。
- React Flow 缩放仍允许 0.25–2，但在 100% 和 fitView 常见比例下优先对齐像素边界。
- 通过浏览器截图测试覆盖：默认、悬停、选中、拖动后、0.8/1/1.25 缩放、浅色/深色、模拟 2x DPR。
- 如果截图仍存在模糊，先记录复现比例和浏览器，再调整画布缩放/节点定位；不得用加粗所有文字掩盖问题。

## 7. 右侧检查器

### 7.1 五个标签页

1. **概览**
   - 标题、角色、描述、依赖摘要、输入/输出数量、匹配节点数量。
   - 未匹配节点时给出原因和“前往节点”入口。
2. **提示词与输入**
   - Prompt、上游依赖、上下文来源说明。
   - 依赖通过任务选择器或画布连线编辑，必须阻止自依赖和环。
3. **执行**
   - 调度方式、固定节点/节点组、所需模型/工具/标签、超时和重试。
   - 即时展示匹配节点数量；匹配详情来自现有节点能力和调度就绪结果。
4. **预期产物**
   - `expected_outputs`、`writes`、`done_definition`、`verify`、`run_gate`。
   - 路径必须是相对路径；验证步骤按 `command/file_exists/sha256/manual` 编辑。
5. **运行详情**
   - 当前尝试、节点、运行状态、允许动作、日志、产物和历史。
   - 动作继续完全依据服务端 `allowed_actions`，UI 不自行猜测。

### 7.2 编辑状态

- `clean`：字段与 store 一致。
- `dirty`：显示“未保存”，切换任务或关闭检查器前提示。
- `saving`：仅禁用当前保存动作，不锁住整个应用。
- `saved`：短暂展示时间或成功状态。
- `error`：保留本地输入，显示字段级或表单级错误，可重试。

保存采用显式“保存更改”；不在每个按键后立即写数据库。删除任务维持二次确认。

### 7.3 审核和修订

- `draft` 工作流可编辑。
- `reviewed` 和 `archived` 工作流的检查器只读。
- 只读态显示审核时间、审核人、快照状态和警告摘要。
- “创建新修订”调用现有 revision API，成功后切到新的 draft，再允许编辑。

## 8. 思考模型

### 8.1 用户概念

面向用户只使用“思考模型”，不再显示“Planner/规划器”。代码内部可在兼容期保留 `planner_*` 字段和错误码，但新增公共 API、导航、标题和帮助文档使用 `thinking-model` 术语。

一个思考模型配置代表“协议模式 + 接口地址 + 模型 ID + 独立凭证 + 可选推理参数”。用户可创建多个配置，并选择唯一默认模型。

### 8.2 数据合同

```ts
type ThinkingModelApiMode = 'responses' | 'chat_completions';
type ThinkingModelTestStatus = 'untested' | 'testing' | 'ok' | 'failed';

interface ThinkingModelProfile {
  id: string;
  display_name: string;
  provider_kind: 'openai';
  api_mode: ThinkingModelApiMode;
  base_url: string;
  model_id: string;
  credential_key: string;
  enabled: boolean;
  is_default: boolean;
  reasoning_effort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null;
  credential_configured: boolean;
  last_test_status: ThinkingModelTestStatus;
  last_tested_at: string | null;
}
```

- API 响应永远不返回凭证值。
- `credential_key` 默认生成 `thinking-model.<profile-id>.api-key`。
- `reasoning_effort` 可为空；仅在已知协议/模型支持时发送，不把一个模型的参数强加给所有模型。
- `last_test_status` 是连接测试结果，不代表模型永久可用，也不替代实际规划错误处理。

### 8.3 API

```text
GET    /api/thinking-models
POST   /api/thinking-models
PATCH  /api/thinking-models/{id}
DELETE /api/thinking-models/{id}
PUT    /api/thinking-models/{id}/default
POST   /api/thinking-models/{id}/test
```

约束：

- 至多一个默认模型；设置新默认值在同一事务内取消旧默认值。
- 默认模型不能直接删除；必须先选择替代默认模型或明确进入无默认状态。
- 删除 profile 同时删除对应凭证，但不改变历史工作流中的模型快照。
- 测试连接必须由用户点击触发，界面提示可能产生提供商请求或费用；自动化测试使用 mock transport，不发真实请求。
- `POST /api/workflows/plan` 增加可选 `thinking_model_id`；未传时使用默认模型。

### 8.4 OpenAI 协议适配

- 协议选择依据 OpenAI 官方当前模型指南：复杂推理、工具调用和多轮工作优先采用 Responses API；官方参考：[Latest model guide](https://developers.openai.com/api/docs/guides/latest-model)。
- `responses`：第一优先模式，调用 `<base_url>/responses`，使用结构化输出并从响应中提取最终 JSON 文本。
- `chat_completions`：兼容当前实现和 OpenAI-compatible 服务，调用 `<base_url>/chat/completions`。
- 两种适配器共享超时、鉴权、错误归一、响应校验、日志脱敏和 mock 测试。
- 不把 API Key、Authorization header 或完整提示词写入应用日志。

### 8.5 旧配置迁移

应用首次读取新注册表时：

1. 如果 `thinking_models` 已存在，直接使用，不重复迁移。
2. 如果仅存在旧 `app_config["planner"]`，创建一个名为“默认思考模型”的 profile。
3. 保留旧 `base_url`、`model` 和 `credential_key`，默认 `api_mode=chat_completions`，因此用户不需重新输入 Key。
4. 在迁移前调用现有 SQLite 备份能力并验证备份。
5. 迁移成功后写入迁移标记；兼容期内旧 `/api/planner/config` 映射到默认 profile。
6. 迁移失败时保持旧配置可读，进入诊断状态，不删除旧配置或凭证。

### 8.6 历史可追溯性

工作流继续保存 `planner_provider` 和 `planner_model` 快照，并新增可空 `thinking_model_id`。profile 后续被改名、修改或删除时，历史工作流仍显示生成当时的 provider/model 快照，不回写历史版本。

## 9. 更新与反馈

### 9.1 更新状态机

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
```

`UpdateCandidate` 至少包含版本、发布日期、发布说明、下载大小（可用时）、最低 macOS 版本（可用时）和下载来源。

### 9.2 用户流程

```text
点击“检查更新”
  → 只检查，不下载
  → 已是最新版：显示检查时间
  → 有新版本：显示版本、日期、说明、大小、系统要求
  → 用户点击“下载更新”
  → 下载 + 验证
  → 用户点击“安装并重新启动”
  → 安装结果/失败恢复
```

- 删除应用启动时默认静默下载/安装行为。
- P1 只提供用户主动检查与安装。
- P2 可加入“自动检查”开关，默认关闭且只能检查，不能静默下载或安装。
- 原生“璇玑”菜单增加“检查更新…”；设置页按钮和菜单项调用同一 update service。
- 更新期间退出或网络中断必须有明确状态，不留下无法识别的临时包。

### 9.3 反馈

- “报告问题”打开 GitHub Bug Report 模板。
- “提出建议”打开 GitHub Feature Request 模板。
- 诊断中心可复制脱敏支持摘要；用户自行决定是否粘贴到 Issue。
- 打开浏览器失败时显示可复制 URL；不能让按钮无反馈。
- 模板禁止用户提交 API Key、Token、Cookie、SSH 私钥、完整本机用户名路径和未脱敏日志。

## 10. 诊断、帮助与 macOS 通用能力

### 10.1 P1

| 能力 | 设计 |
|---|---|
| 诊断中心 | 检查应用版本、macOS/架构、Coordinator、数据库、项目目录、思考模型配置、Keychain 可用性、节点摘要和更新服务；输出脱敏结果 |
| 支持摘要 | 仅含版本、系统、错误码、功能状态和脱敏路径；不含凭证、会话 token、完整 prompt、项目内容 |
| 帮助中心 | 首次使用、思考模型、节点、审核、运行、产物、更新和故障排除的项目内文档入口 |
| 兼容性 | 展示当前 macOS、架构、应用支持范围和不满足项；不声称未经验证的系统支持 |
| 设置迁移 | 思考模型注册表迁移前备份、校验、失败回滚或保留旧配置 |
| 安全启动 | 仅覆盖 Coordinator 连续启动失败或配置 JSON 损坏；提供打开诊断、恢复最近备份、重置非敏感 UI 状态，不删除项目/凭证 |
| 性能保护 | 画布节点 memo、稳定 selectors、避免全局 loading；更新检查不阻塞启动；日志和长列表采用上限/分页 |
| 无障碍 | 完整键盘路径、焦点可见、语义标签、200% 放大、减少动态效果、颜色非唯一表达 |

### 10.2 P2

- Beta 更新通道。
- 自动检查更新，默认关闭且仅检查。
- 只有在存在服务端、隐私政策、数据最小化方案和用户明确同意后，才讨论崩溃报告或匿名遥测；默认保持本地日志。

### 10.3 明确不做

- 云同步和账号系统。
- 自动安装第三方 CLI。
- 自动上传日志或诊断。
- 凭证/私钥导出。
- 静默更新或后台静默安装。

## 11. 数据流与错误处理

### 11.1 思考模型生成工作流

```text
用户选择 profile（或默认）
  → 前端 POST /api/workflows/plan + thinking_model_id
  → 后端读取 profile，不返回凭证
  → CredentialStore 读取该 profile 的 Key
  → Responses 或 Chat adapter 发出请求
  → PlannerService 校验并修复结构化结果
  → Workflow 保存 provider/model/id 快照
  → 前端进入 draft + review 流程
```

错误必须归一为稳定代码：未配置、凭证缺失、未授权、超时、网络失败、不支持参数、无效输出和服务端限流。界面展示用户可采取的下一步，不展示原始 Authorization 或上游完整响应。

### 11.2 任务编辑

```text
选中卡片
  → 检查器加载任务快照
  → 用户编辑形成本地 dirty draft
  → 前端字段校验
  → 保存到现有 workflow update API
  → 后端领域校验（路径、依赖、环、验证合同）
  → 成功刷新 store / 失败保留本地草稿
```

### 11.3 更新

前端 update service 是唯一状态源；设置页和原生菜单只发送命令。Updater 插件负责检查、下载和安装，服务层负责动作分段、状态转换、错误归一和 UI 通知。

## 12. 安全、隐私与开源约束

- 保持 Apache-2.0 许可证；审计 `LICENSE`、`NOTICE`、README、贡献指南和第三方素材来源是否一致。
- Logo、字体、图标和截图必须记录来源和再分发边界；系统字体不打包进仓库。
- 所有模型凭证只通过 `CredentialStore`，不能写入 SQLite、localStorage、日志、URL 或诊断摘要。
- 删除思考模型配置时只删除该 profile 的 credential key，不影响其他 profile。
- GitHub Issue 模板显著提示脱敏；安全漏洞走 `SECURITY.md` 指定渠道，不在公开 Issue 暴露秘密。
- 浏览器 E2E、单元测试和 CI 使用 fake credential 与 mock transport，不调用真实 OpenAI API。
- 本地实现、测试通过、候选、GitHub 合并、Release、签名/公证、安装和用户验收必须分开报告。

## 13. 测试与验收证据

### 13.1 自动化层级

1. 前端单元/组件测试：token、导航、检查器、思考模型、更新状态、诊断脱敏。
2. 后端单元/API 测试：profile CRUD、唯一默认、迁移、凭证隔离、Responses/Chat adapter、工作流快照。
3. Rust 单元测试：菜单命令和 update event bridge，不启动 App。
4. 浏览器 E2E：首次路径、模型配置、画布清晰度、检查器保存/错误、审核只读、更新/反馈回退。
5. 现有全量门禁：`scripts/verify-all.sh --skip-tauri-build`。

### 13.2 P1 验收标准

- 中文和英文中不再出现用户可见的“Planner/规划器”，兼容 API 和历史字段除外。
- 可创建至少两个思考模型 profile、切换唯一默认值并分别管理凭证。
- 旧 planner 配置迁移后不要求重新输入 API Key；迁移失败不丢失旧配置。
- Responses 和 Chat 两种模式均有 mock 成功、鉴权失败、超时和无效输出测试。
- “检查更新”不会下载或安装；只有用户第二次确认后才下载，安装前再次确认。
- App 启动不会默认静默下载/安装更新。
- 原生菜单和设置页使用同一更新状态源。
- 卡片选中前后文字在浏览器 2x DPR 截图中无由节点自身 transform/filter 引起的模糊或位移。
- 检查器五个标签页覆盖任务完整合同，包括 `agent_type`、依赖和交付验证字段。
- 已审核工作流只读，创建新修订后才允许编辑。
- 诊断摘要不包含测试中的 secret、session token、API Key、完整项目路径或 prompt。
- 浅色、深色、跟随系统、键盘导航、减少动态效果和 200% 放大通过既定测试。
- 开源文档检查通过，Apache-2.0 和 NOTICE 边界一致。
- 所有常规验证均未构建、启动或安装 `.app`。

## 14. 实施顺序

1. 冻结当前候选基线与浏览器验证边界。
2. 建立视觉 token 和工作区骨架。
3. 修复卡片清晰度并建立截图回归。
4. 完成五标签检查器和完整任务合同。
5. 完成思考模型后端注册表、迁移和双协议适配。
6. 完成思考模型 UI 与工作流选择。
7. 重构更新/反馈状态机与原生菜单桥接。
8. 补齐诊断、帮助、兼容性和安全启动。
9. 完成可访问性、响应式、性能和开源文档。
10. 执行浏览器级集成验证并交给独立审核；App 构建/签名/发布另行授权。

## 15. 风险与控制

| 风险 | 控制 |
|---|---|
| 大范围 CSS 重构引发隐藏回归 | 先建 token 和截图基线，分页面替换，禁止无关组件重写 |
| React Flow 模糊不是单一 CSS 原因 | 记录缩放/DPR复现矩阵，分别验证节点样式、画布缩放和定位 |
| 多模型迁移导致 Key 丢失 | 复用原 credential key，迁移前备份，迁移幂等，旧 API 保留一版 |
| Responses 与兼容服务差异 | 适配器隔离，Chat 模式不伪装 Responses，错误统一但保留协议上下文 |
| 更新动作意外安装 | 状态机把 check/download/install 分开，默认无启动更新，动作级测试 |
| 设置页面继续膨胀 | 分类路由 + 独立 feature/service，不把所有逻辑留在单个组件 |
| 文档把候选当上线 | 每项证据分层，发布/安装必须单独授权和验证 |

## 16. 已锁定、无需执行者再决定的事项

- 采用方案 A，不重做产品架构。
- 系统无衬线字体，移除宋体展示风格。
- 三栏工作区，左栏可折叠，右栏可调整/收起。
- 思考模型支持多个 profile；OpenAI Responses 优先，Chat Completions 兼容。
- 更新 P1 手动、分步、用户确认；不默认自动下载或安装。
- 卡片选中不使用 transform/filter/scale。
- 检查器固定五个标签页并覆盖完整任务合同。
- 复用当前候选的安全、审核、运行恢复、备份和 pending action 能力。
- P1 不接云同步、账号、遥测、自动 CLI 安装或凭证导出。
- 常规验证不构建或启动 `.app`；发布工作另行授权。
