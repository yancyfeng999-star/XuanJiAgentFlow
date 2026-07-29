# 当前真实状态

> 日期：2026-07-29  
> 依据：`feat/xuanji-2-completion` 源码、`scripts/verify-all.sh` 门禁与 Task 1–12 测试结果。只记录**已验证**能力。

## 产品定位（已落地方向）

璇玑 AgentFlow 2.0 是 **macOS 首发** 的本地分布式 AI 任务控制台：

- DeepSeek / MiMo 等 OpenAI 兼容 API 负责**规划** DAG（`PlannerService`，最多一次修复）。
- Hermes Node API（`/v1/runs` 封装层）负责**执行**。
- React 单一无限画布工作区（`AppShell`）；已删除旧多页 `pages/*` 与 `panels/*`。
- Python Coordinator（FastAPI）负责项目、工作流、调度、执行、恢复、节点与产物。
- 远程 Node 仅监听 `127.0.0.1`，按任务临时 SSH 隧道访问（`StrictHostKeyChecking=yes`）。

## 已通过测试验证的能力

| 领域 | 验证方式 | 说明 |
|---|---|---|
| 加密凭据库 | pytest | Argon2id + AES-256-GCM，无明文落盘 |
| Planner | pytest MockTransport | 非法 JSON/环依赖/401/超时 + 一次修复 |
| 调度与节点协议 | pytest + FakeNode | 能力匹配、并发、真实失败模式 |
| 执行 / 取消 / 重试 / 恢复 | pytest 集成 | 多节点、产物哈希、崩溃恢复补发 |
| Coordinator API | pytest TestClient | 规划→编辑→审核→异步执行→产物下载、WS 事件序 |
| SSH 隧道 | pytest + cargo | known_hosts 隔离，禁止 `StrictHostKeyChecking=no` |
| Sidecar 监督 | cargo test | 端口上报、健康检查门闩 |
| 前端工作区 | vitest | 审核冻结、运行事件、API client |
| E2E | Playwright | web+backend + Fake 多节点栈：规划→编辑→审核→执行→产物；取消/跳过/离线/WS 回放 |
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

E2E 使用 `scripts/e2e_stack.py` 启动 Coordinator + 2 个 FakeNode HTTP 服务，**不**用 sessionStorage / stub 成功冒充。

## 构建产物说明

- 未签名 macOS `.app` + **可安装 DMG** 已可本地构建：
  - App: `app/src-tauri/target/release/bundle/macos/璇玑.app`
  - DMG: `app/src-tauri/target/release/bundle/dmg/璇玑_0.1.0_aarch64.dmg`（约 23MB，含 `Applications` 快捷方式）
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

1. `docs/CURRENT_STATE.md`（本文件）
2. `docs/USER_GUIDE.md`
3. `docs/NODE_DEPLOYMENT.md`
4. `docs/TROUBLESHOOTING.md`
5. `docs/HERMES_INTEGRATION.md`
6. `docs/superpowers/specs/2026-07-28-xuanji-2-completion-design.md`
7. `docs/superpowers/plans/2026-07-28-xuanji-2-completion.md`

`01`–`07` 根目录文档保留为历史探索；完成度声明以本文件与 Task 报告为准。
