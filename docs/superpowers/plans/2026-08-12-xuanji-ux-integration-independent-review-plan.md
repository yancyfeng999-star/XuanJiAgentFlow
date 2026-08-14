# 璇玑 0.3.x 用户体验与接入独立审核 Plan

> **审核对象：** `2026-08-12-xuanji-ux-integration-improvement-plan.md` 的候选实现。
> **审核原则：** 审核人与实现人分离；审核人只验证、记录和给出裁决，不直接修改候选代码。
> **权限边界：** 本文不授权清理现有脏内容、提交、推送、发布、部署远端节点或修改项目外文件。

**Goal:** 用一套可复现、分层、不会夸大证据的独立门禁，确认璇玑的用户体验、前后端合同、数据与安全边界、运行恢复和 Mac 交付链路是否真正闭环。

**Review architecture:** 审核以一个固定候选 SHA 为中心，从用户界面一路追踪到客户端、Coordinator API、服务/领域、SQLite、Node Agent/Hermes、事件与产物，再回到界面；源码、测试、构建、包、运行、真实外部链路、远端发布和用户验收分别裁决。

---

## 1. 审核职责与独立性

### 1.1 最小角色划分

| 角色 | 职责 | 禁止事项 |
| --- | --- | --- |
| 实现负责人 | 提供候选 SHA、变更说明、迁移说明、已知风险和自测证据 | 不得给自己的实现签独立通过 |
| 独立 Reviewer/QA | 执行本文门禁、复现主旅程、追踪合同、出 finding 和最终裁决 | 不得一边审核一边直接修候选代码 |
| 资产/发布负责人 | 确认脏资产、安装包、签名、公证、Release 与升级证据 | 不得用“文件存在”替代实际安装/升级 |

一个人可以兼任独立 Reviewer 与 QA，但不能同时是本批候选的主要实现人。若只有一个执行者，审核结论只能记为“自检”，不能写“独立通过”。

### 1.2 审核循环

1. 实现负责人交付固定候选 SHA 和自测材料。
2. Reviewer 在新的干净 worktree 检出该 SHA，记录环境和基线。
3. Reviewer 执行静态合同审查、自动化门禁和人工旅程。
4. 有 finding 时只提交审核记录，不在审核 worktree 修复。
5. 实现负责人用新的提交修复并提供新 SHA。
6. Reviewer 对新 SHA 重跑受影响门禁和最小回归；最终裁决只绑定最后一个 SHA。

## 2. 本次审核的已知基线

### 2.1 计划编写时的主干状态

- 日期：2026-08-12
- 分支：`main`
- HEAD：`b67d2f566b92549d91334d257c3b3a94fa2782c3`
- 远端关系：计划编写时与 `origin/main` 对齐
- 应用版本：源码声明为 0.3.3
- 当前文档中多处仍停留在 0.3.0 或旧绝对路径

该 SHA 只是计划基线，不自动是待审核候选。Reviewer 必须从实际交付材料读取完整候选 SHA，不得默认审核当前目录。

### 2.2 计划编写前已存在的脏内容

以下是所有者资产/生成物，不是本计划创建的实现变更：

- `M app/src-tauri/binaries/xuanji-coordinator`
- `M app/src-tauri/binaries/xuanji-coordinator-aarch64-apple-darwin`
- `?? app/src-tauri/src-tauri/`
- `?? release/xuanji-0.3.1-20260811/`
- `?? release/xuanji-0.3.2-20260811/`
- `?? release/xuanji-0.3.3-20260811/`

Reviewer 不得运行 `git clean`、`git reset --hard`、`git checkout --` 或递归删除命令处理它们。应在新的 worktree 审核；如候选必须包含二进制，资产负责人需提供来源命令、SHA-256、架构和版本对应关系。

### 2.3 候选必须显式回答的已知问题

Reviewer 不预设这些问题已修复，必须逐项找到实现和证据：

1. 前端是否仍把 `pending→accepted`、`cancelling→cancelled`、`blocked→failed`。
2. 是否已有后端统一 Readiness，且 create/start run 服务端也执行门禁。
3. 项目切换或重启后能否恢复最近 Run，是否有项目 Run 历史 API。
4. WebSocket/产物下载 URL 是否仍携带长期 session token。
5. Node Agent token 为空时是否仍放行。
6. 审核是否仍是一键改状态，还是绑定了可核对的不可变快照。
7. 本地节点发现和 SSH key 选择是否真正进入用户界面。
8. SSH 严格 host key 校验是否有可理解且安全的指纹确认流程。
9. Store 是否仍用一个全局 `loading` 表示所有操作。
10. Retry/Skip 等动作是否由后端合法动作决定，而不是只看是否选中任务。
11. 关键正文/控件是否仍大量使用 9–11 px；是否支持 200% 缩放和 reduced-motion。
12. 活动 SQLite 的备份是否仍依赖直接复制 db/WAL/SHM 并宣称一致。
13. 文档是否仍把旧测试计数、0.3.0、旧绝对路径当作当前事实。
14. `CoordinatorClient` 是否仍有重复 `validateWorkflow` 声明。

## 3. 入场门禁

任一项不满足，结论为 `NOT READY FOR REVIEW`，停止破坏性/昂贵测试并退回实现负责人：

- [ ] 提供 40 位完整候选 commit SHA，且审核 worktree 的 `git rev-parse HEAD` 完全一致。
- [ ] 提供从计划 Task 到 commit/test 的追踪表。
- [ ] 候选 worktree 在安装依赖和运行测试前是干净的。
- [ ] 所有 schema migration 有升级、旧数据读取、备份恢复和失败回滚说明。
- [ ] 凭据迁移有不丢失旧数据的策略。
- [ ] 实现负责人列出所有新增/修改 API、状态枚举、事件和持久化字段。
- [ ] 中英双语、主题、macOS 13 最低版本和现有数据兼容范围已声明。
- [ ] 自动化证据包含命令、时间、环境、退出码和候选 SHA，不能只有截图或“已通过”文字。
- [ ] 真实 Hermes、真实远端、签名/公证、Release、升级和用户验收若未做，明确写 `not_verified`，不能留空。

建议初始化审核 worktree：

```bash
git rev-parse --show-toplevel
git rev-parse HEAD
git status --short --branch
git diff --stat <accepted-base-sha>...HEAD
git diff --name-status <accepted-base-sha>...HEAD
```

`<accepted-base-sha>` 必须由实现交付单给出实际值；Reviewer 不得自己猜测基线。

## 4. Finding 等级与裁决规则

| 等级 | 定义 | 示例 | 发布裁决 |
| --- | --- | --- | --- |
| P0 | 安全/凭据暴露、数据丢失、越权、状态造假、主链路不可用、不可逆错误 | token 出现在 URL；空 token 放行；UI 显示已取消但后端仍 cancelling | 必须修复并全量复审 |
| P1 | 关键旅程、恢复、迁移、可访问性或合同有实质缺口 | 重启后找不到运行；审核快照可漂移；200% 缩放无法操作 | 必须修复并复审相关门禁 |
| P2 | 不阻断目标用户完成任务的可用性/一致性问题 | 次要文案、间距、低频日志筛选问题 | 可修复或由产品负责人书面接受 |

最终结果只有四种：

- `PASS`：无未解决 P0/P1，P2 已修复或有明确接受记录，所有要求证据齐全。
- `PASS WITH ACCEPTED P2`：仅剩书面接受的 P2；必须列入下一版本。
- `FAIL`：存在 P0/P1，或关键自动化/人工旅程失败。
- `NOT READY FOR REVIEW`：入场材料、候选身份或工作区隔离不合格。

## 5. 审核阶段 A：候选身份、范围与脏内容

### A1. Git 与范围

- [ ] 完整 SHA、分支、基线 SHA 和差异范围一致。
- [ ] 只有实施计划直接要求的文件发生变化；大规模格式化、依赖升级或视觉重写有单独授权。
- [ ] 当前所有者二进制和 release 资产未被悄悄重建、删除或纳入提交。
- [ ] 新生成目录、数据库、日志、测试报告和密钥没有进入候选提交。
- [ ] `.gitignore` 的新增规则不会掩盖应提交源码或迁移。

### A2. 文档事实源

- [ ] `README.md`、`docs/CURRENT_STATE.md`、`docs/PRODUCT.md`、`docs/USER_GUIDE.md`、`docs/OPERATIONS.md`、`docs/RELEASE_AND_BOUNDARY.md` 与 `release/README.md` 对版本和证据层级一致。
- [ ] 当前真实项目路径已更新，没有用旧路径作为可执行命令。
- [ ] 产品版本、Coordinator API 版本、schema 版本分别说明。
- [ ] 历史验证报告保留日期和 SHA，不被改写成当前测试结果。
- [ ] 没有“代码完成=发布完成”“Release=用户已安装”“Mock=真实 Hermes”的表述。

## 6. 审核阶段 B：前后端合同全链路

Reviewer 对每个能力建立以下可追踪链路，任一层缺失就记录 finding：

```text
用户动作 → React 组件 → Zustand action → CoordinatorClient
→ FastAPI route → service/domain rule → repository/migration
→ Node Agent/Hermes/OS（如适用）→ event/log/artifact
→ API/WS 返回 → Store 收敛 → 用户可理解反馈
```

### B1. 项目与规划

| 检查 | 通过条件 |
| --- | --- |
| 创建/读取/改名/删除项目 | UI、client、API、repository 均存在；删除语义与磁盘目录/产物保留策略一致 |
| 规划 | 失败保留输入；Planner 凭据不进入响应、事件或日志 |
| 工作流编辑 | draft 可编辑，reviewed 不可原地篡改；修订生成新版本 |
| 校验 | DAG、任务合同、写入范围、节点匹配均由后端判定 |

### B2. 审核与执行

- [ ] `review/prepare` 生成规范化快照、哈希、阻塞项和警告。
- [ ] 审核提交相同哈希；中途修改得到稳定 stale 错误。
- [ ] Run 持久关联被审核的 workflow version/hash。
- [ ] Readiness UI 和 create/start run 复用同一后端 service。
- [ ] 禁用执行时有可见原因和修复入口。
- [ ] 并发点击执行只创建一个合法 Run，幂等/冲突响应有测试。

### B3. 运行、事件与恢复

- [ ] 前端完整保留后端状态，不做语义替换。
- [ ] API、WebSocket、Store、颜色、文案和允许动作使用同一状态表。
- [ ] `cancelling` 不显示“已取消”，`blocked` 不显示“失败”，`pending` 不显示“已接受”。
- [ ] 项目 Run 列表稳定分页；最近非终态 Run 在重启/切换后恢复。
- [ ] WS 断线从 last event id 回放，再用 Run snapshot 收敛。
- [ ] replay 缺口、重连中和恢复完成对用户可见。
- [ ] Retry/Skip 只在服务端 `allowed_actions` 允许时可用；竞态下服务端仍拒绝非法动作。

### B4. 节点、Node Agent 与 Hermes

- [ ] 本地/远端在向导第一步显式选择，不靠是否填写 SSH host 猜测。
- [ ] 本地发现 API 有 client 和 UI；发现结果不会自动覆盖用户配置。
- [ ] SSH key 文件选择器接入，取消选择不会清空已有路径。
- [ ] host key inspect 显示 host、算法、指纹；confirm 绑定同一指纹且能检测竞态变化。
- [ ] 诊断分 DNS/TCP/SSH/Node Agent/Hermes，失败定位准确。
- [ ] Node Agent 空 token 启动失败，受保护端点无 token/错 token 为 401。
- [ ] Coordinator 与 Node Agent 的 Task DTO 同步包含 writes、done definition、verify、run gate。
- [ ] 输入文件路径逃逸、符号链接、大小、SHA-256 和产物路径均有负向测试。
- [ ] Hermes 调用失败、超时、取消和重试不会重复或丢失最终事件。

### B5. 产物、日志和诊断

- [ ] 产物列表展示来源任务、大小、media type、hash 和验证状态。
- [ ] 下载使用 header 会话认证和 Blob，不把长期 session token 放 URL。
- [ ] 服务端响应前重新验证产物 hash；篡改文件下载失败并记录稳定错误码。
- [ ] 日志分页、筛选、搜索和导出不会泄露 token、凭据、私钥或完整敏感路径。
- [ ] 诊断包默认脱敏，且用户能预览将要导出的内容。

## 7. 审核阶段 C：数据、迁移、备份与并发

### C1. Schema migration

- [ ] 新 migration 只做 additive 或有明确兼容窗口；schema 版本单调递增。
- [ ] 从项目支持的最老数据库升级到候选版本通过。
- [ ] 已审核 workflow、历史 Run、事件、产物和节点数据升级后仍可读取。
- [ ] migration 中途失败时，原数据库可恢复，不出现“版本已升但字段未完整”的半状态。
- [ ] 旧客户端若不再兼容，启动时给明确错误，不静默写坏数据。

### C2. 凭据迁移

- [ ] Keychain 写入成功并可读回后，才删除旧明文 secret。
- [ ] Keychain 被拒绝、锁定或不可用时提示重新授权，不丢失原配置。
- [ ] 数据库和普通 JSON 只保留 credential reference/配置状态。
- [ ] 账户/项目删除时凭据清理边界明确，不能误删其他节点共用 secret。

### C3. 备份恢复

- [ ] 使用 SQLite online backup API，或停写 + checkpoint + 原子复制流程。
- [ ] 不接受在活跃写入时直接复制 db/WAL/SHM 后只做文件存在检查。
- [ ] 恢复到新 data dir 后验证项目、workflow、run、事件、产物索引和凭据引用。
- [ ] 包含 migration 前备份、migration 后恢复、损坏备份拒绝三条测试。

### C4. 并发与崩溃恢复

- [ ] 双击执行、暂停/取消竞态、retry/skip 竞态有确定结果。
- [ ] Coordinator 崩溃重启后，running attempt 被安全恢复或明确标记，不会重复派发未幂等任务。
- [ ] Node Agent 断线后任务不会被同时分配给两个节点。
- [ ] cancellation 与 artifact finalization 的竞态不会把未完成产物标为成功。

## 8. 审核阶段 D：用户体验人工旅程

自动化不能替代以下人工检查。每条旅程必须保存候选 SHA、macOS 版本、窗口/缩放、语言、主题、步骤、结果和截图/录屏索引。

### D1. 首次使用者

角色：不了解 Coordinator、Planner、Node Agent、Hermes 术语的新用户。

1. 冷启动 App。
2. 创建项目并通过原生目录选择器选目录。
3. 从 Readiness 发现 Planner 未配置并跳转修复。
4. 发现本机节点或创建远端节点。
5. 输入目标、生成流程、修改一个任务。
6. 在审核摘要中理解任务数、依赖、写入、验证与警告。
7. 执行并下载产物。

通过条件：全程无需打开终端或阅读开发文档；任何禁用动作都有可理解原因；失败不丢输入。

### D2. 日常操作者

1. 打开已有项目。
2. 找到最近 Run 与历史 workflow version。
3. 查看运行中任务、日志和产物。
4. 对合法失败任务重试，对不允许跳过的任务确认按钮不可用且原因正确。
5. 从已审核流程创建修订并比较差异。

通过条件：上下文不丢失；状态、动作、版本和产物来源可追溯。

### D3. 故障恢复者

依次注入：Planner 错凭据、Node Agent 离线、未知 host key、WebSocket 断线、Coordinator 重启、产物 hash 不符。

通过条件：每次都说明失败层、保留已有工作、给出安全恢复动作；UI 不提前显示成功/取消/失败。

### D4. 可访问性用户

1. 仅键盘完成创建、配置、审核、运行和产物查看。
2. VoiceOver 走同一主路径。
3. 200% 缩放下在最小支持窗口宽度操作。
4. 系统开启 Reduce Motion 后观察进度、面板和状态变化。
5. 分别检查中/英、亮/暗主题。

通过条件：无键盘陷阱；焦点可见且操作后回到合理位置；状态变化由 live region 合理宣读；关键文本可读；无必须依赖颜色的信息。

### D5. 高负载操作者

1. 使用长项目名、长任务名、20+ 任务、长日志和多个产物。
2. 在运行中切换项目、面板、主题和语言。
3. 快速重复操作控制按钮并模拟慢网络。

通过条件：无布局破裂、重要操作不被挤出、不会重复提交、日志和画布仍可定位。

## 9. 审核阶段 E：视觉与交互质量

### E1. 信息层级

- [ ] 保留纸墨朱砂识别度，不把所有区域做成同权重卡片。
- [ ] 每屏只有一个主要动作，运行期动作按上下文分组。
- [ ] 项目创建、节点高级字段和低频设置采用渐进披露。
- [ ] 状态色有文字/图标冗余，不只靠颜色区分。
- [ ] 错误出现于相关组件附近，全局横幅只做汇总。

### E2. 细节门禁

- [ ] 关键正文、按钮、输入标签不使用 9–11 px。
- [ ] 点击目标满足桌面可用尺寸，图标按钮有可访问名称。
- [ ] 不使用 `transition: all`；进度条不通过频繁修改 width 造成布局动画。
- [ ] 支持 `prefers-reduced-motion`。
- [ ] 三栏在 900、980、1280、1440、1920 px 和 200% 缩放下可完成任务，而不只是“没有水平滚动条”。
- [ ] Dialog/确认框有焦点陷阱、Escape 和关闭后焦点回归。
- [ ] 朱砂色、正文、弱化文字在亮/暗主题达到适用的 WCAG 对比度。

## 10. 审核阶段 F：安全与隐私

- [ ] Coordinator session 只接受 header；WebSocket 使用短期、单次、绑定 run 的 ticket。
- [ ] ticket 过期、重放、错 run、并发消费均失败。
- [ ] Artifact 下载不将长期 token 写入 URL、浏览器历史、referer 或错误消息。
- [ ] Node Agent token 空值 fail closed；错误 token 不泄露期望值。
- [ ] Planner/node credential 位于 Keychain，不出现在 SQLite、普通 JSON、API DTO、事件、日志、截图或诊断包。
- [ ] SSH host key 确认防止 TOCTOU，known_hosts 权限正确。
- [ ] project root、task input/output、artifact path 均防目录穿越与 symlink escape。
- [ ] CSP、Tauri allowlist/capabilities、外部链接打开策略仍为最小权限。
- [ ] updater endpoint、公钥、资产签名和版本匹配有测试；失败不会静默降级为不校验更新。

建议静态检索：

```bash
rg -n "session_token|credential|api[_-]?key|Authorization|ssh_key|private_key" app backend node-agent
rg -n "query_params|get\('session_token'\)|searchParams\.set\('session_token'" app backend
rg -n "transition:\s*(all|width)|font-size:\s*(9|10|11)px" app/src
```

命中不等于 finding，但每一处都必须解释数据是否可能进入用户可见/可持久化/可导出的表面。

## 11. 审核阶段 G：自动化验证

### G1. 快速分层验证

Reviewer 可先单独执行受影响测试定位问题：

```bash
.venv/bin/python -m pytest -q backend/tests
.venv/bin/python -m pytest -q node-agent/tests
cd app && npm test
cd app && npm run lint
cd app && npm run build
cargo test --manifest-path app/src-tauri/Cargo.toml
cargo check --manifest-path app/src-tauri/Cargo.toml
```

### G2. 完整候选门禁

在隔离 worktree 中运行：

```bash
bash scripts/verify-all.sh
git status --short
```

注意：该脚本会安装依赖、移动旧 build/test 目录并生成新产物。测试后变脏是预期现象，但 Reviewer 必须区分“测试生成物”和“候选原始差异”，不能把生成物提交或当实现内容。

### G3. 必须存在的测试族

- Readiness：缺项目、缺 Planner、未审核、无匹配节点、凭据缺失、全就绪、create/start 复检。
- Review：snapshot hash、stale、warning acknowledgement、revision、运行绑定旧版本。
- Run：全状态表、allowed actions、历史分页、重启恢复、WS replay、并发控制。
- Node：local discover、SSH key UI、host key inspect/confirm、诊断分层、空 token 认证、路径/哈希。
- Security：WS ticket 过期/重放、header artifact 下载、secret redaction、Keychain migration failure。
- Persistence：schema upgrade、备份/恢复、崩溃恢复、旧数据兼容。
- Frontend：动作级 pending、上下文错误、禁用原因、删除确认/Undo、双语/主题。
- E2E：onboarding、review、local workflow、recovery、node setup、accessibility、responsive。

## 12. 审核阶段 H：Mac 运行、包、真实外部与发布

这些层级必须逐层取证，不能相互替代：

| 层级 | 最低证据 | 未验证时写法 |
| --- | --- | --- |
| Source review | 固定 SHA 的代码/合同审查 | `not_reviewed` |
| Automated tests | 原始命令、日志、退出码、环境 | `not_run` |
| Build | frontend + Rust + sidecar + Tauri build | `not_built` |
| Package | 实际 `.app`/安装资产、hash、架构 | `not_packaged` |
| Local runtime | 冷启动、sidecar、主旅程录屏/日志 | `not_runtime_verified` |
| Real Hermes | 真实本机任务、取消/恢复、产物 | `not_external_verified` |
| Real remote node | 真实 SSH/部署/重连/任务/产物 | `not_remote_node_verified` |
| Remote CI | GitHub Actions run URL 与 commit SHA | `not_remote_ci_verified` |
| Remote Release | Release URL、tag、资产、hash | `not_released` |
| In-app update | 旧版→候选真实升级与回滚 | `not_update_verified` |
| Installed | 用户目标机器实际安装并启动 | `not_installed` |
| User acceptance | 用户明确验收记录 | `acceptance_unknown` |

### H1. Mac 包检查

- [ ] arm64/x86_64 或 universal 架构与发布说明一致。
- [ ] sidecar 二进制版本、架构和 hash 与候选一致。
- [ ] macOS 13 最低版本符合配置和实际启动。
- [ ] `codesign`、`spctl`、notarization、staple 结果分别记录。
- [ ] 新用户 data dir、旧 0.3.x data dir、损坏配置三种启动路径通过。

### H2. 更新检查

- [ ] 旧版本真实安装后由应用内更新到候选。
- [ ] 更新前后项目、workflow、run、凭据引用和设置保持。
- [ ] 更新下载中断、签名错误、网络错误有明确反馈和可重试。
- [ ] 更新成功后显示实际运行版本，不只检查下载完成。
- [ ] 回滚策略经过演练，不只写在文档。

## 13. 审核记录格式

Reviewer 应在项目内输出一份与候选版本绑定的记录，例如 `docs/reviews/<candidate-version>-ux-integration-review.md`。记录必须包含：

1. 候选完整 SHA、基线完整 SHA、审核日期、Reviewer、macOS/CPU、Node/Python/Rust 版本。
2. 审核范围和明确未审核项。
3. 自动化命令表：命令、开始/结束时间、退出码、日志路径。
4. 人工旅程表：环境、步骤、期望、实际、证据索引。
5. 前后端合同矩阵：每个能力对应 UI/client/API/service/storage/external/event/UI feedback。
6. 分层交付证据表，使用第 12 节的固定状态词。
7. Findings，按严重度排序。
8. 最终裁决及其绑定的候选 SHA。

单条 finding 使用以下字段：

```text
ID: XJ-UX-P1-001
Severity: P1
Title: concise observable failure
Evidence: exact file:line or reproducible runtime steps
Expected: user-visible or contract requirement
Actual: observed behavior
Impact: affected user/data/security state
Owner role: frontend/backend/node/desktop/qa/docs
Retest scope: exact tests and journeys to rerun
Status: open/fixed/accepted-P2
```

禁止只写“体验不好”“接口有问题”或只有截图而无复现步骤。

## 14. 最终通过清单

只有以下全部打勾，Reviewer 才能签 `PASS`：

- [ ] 候选身份、范围、工作区隔离合格。
- [ ] 两份中英文界面的主旅程均通过。
- [ ] 状态、Readiness、审核快照、历史恢复和允许动作端到端一致。
- [ ] 项目、节点、Planner、Run、日志、产物接入矩阵无断层。
- [ ] WS/产物会话、Node Agent 认证、Keychain 和脱敏通过负向测试。
- [ ] migration、旧数据、备份恢复和崩溃恢复通过。
- [ ] 键盘、VoiceOver、200% 缩放、reduced-motion、亮/暗主题通过。
- [ ] 完整自动化门禁在固定候选 SHA 上通过。
- [ ] 本地 runtime 证据通过。
- [ ] 真实 Hermes、远端节点、CI、Release、更新、安装、验收已按真实状态分别填写，未做的没有被写成通过。
- [ ] 无未解决 P0/P1；所有 P2 有明确处置。
- [ ] Reviewer 没有在审核过程中直接修改候选实现。

`PASS` 只表示本审核范围通过。若远端 Release、更新、安装或用户验收仍是未验证状态，最终表述必须保留这些边界，且仍需单独发布授权。
