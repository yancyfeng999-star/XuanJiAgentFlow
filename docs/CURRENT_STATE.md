# 当前真实状态

> 能力验证日期：2026-08-18（`2fb462d90d63542437971d76736db1ac1b4bd4c8`，两轮 `scripts/verify-all.sh --skip-tauri-build` + 独立 `npm run test:e2e` 均为退出码 0）
> 事实核对日期：2026-08-18
> 依据：璇玑 3.0 源码、`scripts/verify-all.sh` 门禁。只记录**已验证**能力。状态为本地实现/测试候选（**实现者自检**），**不代表**已发布、已安装或独立审核通过。
> 完整命令、警告与未验证层级：[`docs/reviews/2026-08-18-final-remediation-verification.md`](reviews/2026-08-18-final-remediation-verification.md)。源码包版本 **0.3.5**。远端用户安装包仍为 **`v0.3.3`**。Tauri / 桌面 App **未为 0.3.5 重建**。

> 开源协作提示：本文包含历史桌面包验证证据，不是普通贡献者的构建指令。当前开发和 PR 验证默认不生成或启动 macOS `.app`；请遵循 [`docs/OPEN_SOURCE.md`](OPEN_SOURCE.md) 与 [`CONTRIBUTING.md`](../CONTRIBUTING.md) 的隔离发布边界。

## 产品定位（已落地方向）

璇玑 **XuanJiAgentFlowApp** 3.0（历史工程名 AgentFlow）是 **macOS 首发** 的本地分布式 AI 任务控制台。
产品叙述见 `docs/PRODUCT.md`；3.0 不增加产品范围，而是完成 2.0 已承诺的真实执行闭环：

- DeepSeek / MiMo 等 OpenAI 兼容 API 负责**规划** DAG（`PlannerService`，最多一次修复）。
- Node Agent 负责阶段输入、哈希校验与产出契约，Hermes API（`/v1/runs`）负责**执行**。
- React 单一无限画布工作区（`AppShell`）；已删除旧多页 `pages/*` 与 `panels/*`。
- Python Coordinator（FastAPI）负责项目、工作流、调度、执行、恢复、节点与产物。
- 远程 Node 仅监听 `127.0.0.1`，按任务临时 SSH 隧道访问（`StrictHostKeyChecking=yes`）。

## 已通过测试验证的能力（2026-08-18 最终补救）

| 领域 | 验证方式 | 说明 |
|---|---|---|
| E2E 栈隔离 | vitest 合同 + 两轮 verify-all | 默认不复用已有 Coordinator/Vite；连续门禁用不同临时 `data_dir` |
| 审核警告确认 | vitest + Playwright | 同快照重载保留确认；UI 审核等 prepare 完成后再勾选；无 disabled timeout |
| 画布 2x 清晰度 | Playwright | hover/selected 裁剪截图 + transform 断言 |
| 无 App 全量门禁 | 两轮 verify-all + 第三次 e2e | backend 200 / node-agent 29 / vitest 103 / e2e 32 / cargo 16；Tauri SKIPPED |

## 已通过测试验证的能力（2026-08-14 Codex 风格产品基础）

| 领域 | 验证方式 | 说明 |
|---|---|---|
| 视觉 token / 字阶 | vitest | 系统 sans + SF Mono；正文 13px；辅助 ≥12px；无产品 Songti / 9–10px |
| 工作区导航 | vitest + Playwright | 项目 / 工作流 / 节点 / 思考模型 / 设置；项目面板不叠放检查器 |
| 画布卡片清晰度 | Playwright | 选中/悬停无自身 transform |
| 五标签检查器 | vitest + Playwright | 提示词与输入保存后 API 可见；审核后只读 + 修订 |
| 思考模型 | pytest + vitest + Playwright | 双协议、唯一默认、密钥不回传；就绪文案不再写「规划器」 |
| 更新状态机 | vitest + Playwright | 启动不自动更新；「检查更新」发现新版本后下载、退出、静默安装并重开；运行中拦住；浏览器显示 desktop-only |
| 诊断脱敏 | pytest + vitest + Playwright | 支持摘要不含 Authorization / 密钥 / 完整 home 路径 |
| 开源文档 | `check-open-source-docs.sh` | Apache-2.0 / NOTICE / 模板与 verify.yml 挂钩 |

## 已通过测试验证的能力（2026-08-12 候选新增）

| 领域 | 验证方式 | 说明 |
|---|---|---|
| 统一就绪检查 | pytest + Playwright | `GET /api/readiness` 六类检查；create/start run 服务端复检（`run_not_ready`） |
| 审核快照 | pytest + Playwright | review/prepare 规范化快照哈希、stale 拒绝、警告确认、修订克隆 |
| 运行状态保真 | vitest + Playwright | 前端不再折叠 pending/cancelling/blocked；切换项目恢复最近非终态 Run |
| 项目 Run 历史 | pytest | `GET /api/projects/{id}/runs` 稳定游标分页、版本/快照绑定、汇总计数 |
| 合法动作 | pytest + vitest | run/task `allowed_actions` 由后端裁定，前端按此渲染 |
| 节点接入 | pytest + Playwright | 本机/远端向导、本地发现、SSH key 选择、host key inspect/confirm（防 TOCTOU） |
| 分层诊断 | pytest + Playwright | DNS/TCP/SSH/Node Agent/Hermes 五步定位 |
| 会话安全 | pytest | WS 一次性票据（30s、单次、绑定 run）；HTTP 不再接受 query 会话令牌；产物 header 认证 + Blob 下载 |
| Node Agent 认证 | pytest | 空 token 启动失败；所有 `/v1/*` Bearer 校验（hmac 比较） |
| 凭据存储 | pytest | CredentialStore 抽象 + macOS Keychain 后端；迁移先验证读回再删旧明文，失败保留 |
| 任务交付合同 | pytest 集成 | writes/done_definition/verify/run_gate 全链路；manual → needs_review → run success_with_warnings |
| 备份恢复 | pytest | SQLite online backup API；完整性校验；损坏备份拒绝 |
| 可访问性 | Playwright | 对话框焦点陷阱、Escape、reduced-motion、控件可访问名称、≥12px 关键文本 |

## 2026-07-29 基线已验证能力

| 领域 | 验证方式 | 说明 |
|---|---|---|
| 本地凭据配置 | pytest | `credentials.json` 权限为 `0600`，接口只返回配置状态 |
| Planner | pytest MockTransport | 非法 JSON/环依赖/401/超时 + 一次修复 |
| 调度与节点协议 | pytest + FakeNode + 真实 Node Agent | 能力匹配、并发、阶段输入上传、显式启动 |
| 执行 / 取消 / 重试 / 恢复 | pytest 集成 | 多节点、依赖产物传递、产物哈希、超时/退避、崩溃恢复 |
| Coordinator API | pytest TestClient | 规划→编辑→审核→异步执行→产物下载、WS 事件序 |
| SSH 隧道 | pytest + cargo | known_hosts 隔离，禁止 `StrictHostKeyChecking=no` |
| Sidecar 监督 | cargo test | 端口上报、健康检查门闩 |
| 前端工作区 | vitest | 审核冻结、运行事件、API client |
| E2E | Playwright + Computer Use | UI 创建的同一个 run：规划→策略编辑→审核→双节点执行→日志→产物 |
| 前端生产构建 | `npm run build` | TypeScript + Vite |

## 已删除的遗留路径

- `backend/main.py`、`planner.py`、`scheduler.py`、`executor.py`、`monitor.py`、`collector.py`、`storage.py`、`model_config.py`
- `app/src/pages/*`、`app/src/panels/*`、`app/src/lib/api.ts`（含 sessionStorage 冒充成功的旧链路）

权威入口：

- Coordinator：`python -m xuanji --data-dir …` / `xuanji-coordinator`
- UI：Tauri shell → `AppShell` → `createApiClient`

## 运行与验证

```bash
# 隔离全量门禁
bash scripts/verify-all.sh

# 可选跳过
bash scripts/verify-all.sh --skip-e2e
bash scripts/verify-all.sh --skip-tauri-build
```

E2E 使用 `scripts/e2e_stack.py` 启动 Coordinator + 2 个 FakeNode HTTP 服务，**不**用 sessionStorage / stub 成功冒充。另有真实 Node Agent ASGI + fake Hermes 的强集成测试，验证依赖标记确实进入下游 Prompt 和最终产物。

## 构建产物说明

- 本地 ad-hoc 签名 macOS **可安装 DMG / PKG** 已构建并归档：
  - DMG: `release/xuanji-0.3.3-20260811/璇玑_0.3.3_aarch64.dmg`
  - PKG: `release/xuanji-0.3.3-20260811/璇玑-0.3.3.pkg`
  - 校验值见 `release/README.md`
- `release/archive/` 只保存历史候选版本；当前安装请以 `release/README.md` 为准。
- Sidecar：PyInstaller 单文件 `xuanji-coordinator`（Mach-O arm64）随应用打包，不依赖系统 Python。
- 远端服务器 / SSH 用户 / 私钥路径 / Node Token / Planner Key：**软件界面填写**，不写死进安装包。
- 重新打包建议流程：
  1. `backend/.venv/bin/pyinstaller --noconfirm --clean backend/xuanji-coordinator.spec`
  2. 复制 `dist/xuanji-coordinator` 到 `app/src-tauri/binaries/`
  3. `cd app && npm run build:tauri`
  4. 若 Tauri `bundle_dmg.sh` 失败，用 `hdiutil` 从 `.app` 生成 UDZO DMG

## 外部验收 / 未在本仓库门禁内声明完成

- Apple 代码签名、公证、Staple
- 真实 Ubuntu/Debian 服务器上的 Hermes 安装与长时间压测
- 真实 DeepSeek/MiMo/Hermes 云服务配额与账号
- 首次未知主机指纹「用户确认写入 known_hosts」完整 UI 流程

## 有效文档

**产品叙述（本仓）：**

1. `docs/PRODUCT.md`（对外权威短文）
2. `docs/PRODUCT_DEFINITION.md` / 根目录 `01-产品定义.md`
3. `docs/USER_JOURNEY.md` · `OPERATIONS.md` · `TECH_SHAPE.md`
4. `docs/RELEASE_AND_BOUNDARY.md` · `VS_SKILL.md` · `NAMING.md`
5. 根目录 `README.md`

**工程完成度与开发（权威仍以本文件为完成度准绳）：**

1. `docs/CURRENT_STATE.md`（本文件）
2. `docs/USER_GUIDE.md`
3. `docs/NODE_DEPLOYMENT.md`
4. `docs/TROUBLESHOOTING.md`
5. `docs/HERMES_INTEGRATION.md`
6. `docs/XUANJI_3_ACCEPTANCE.md`
7. `docs/XUANJI_3_VALIDATION_REPORT.md`
8. `docs/superpowers/specs/2026-07-29-xuanji-3-completion-design.md`
9. `docs/superpowers/plans/2026-07-29-xuanji-3-completion.md`

`02`–`09` 等根目录历史探索文档保留；**完成度声明以本文件与 Task 报告为准**。产品对外表述与本文件冲突时，改产品文案，不放宽本文件的「已验证」标准。
