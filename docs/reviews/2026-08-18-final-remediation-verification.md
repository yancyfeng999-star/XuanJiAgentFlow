# Final remediation · 无 App 门禁验证

> 日期：2026-08-18
> 记录方式：**实现者自检 / implementer-run / owner self-check**。**不是**独立审核通过。
> 候选 SHA：`2fb462d90d63542437971d76736db1ac1b4bd4c8`
> 环境：macOS 26.6.1 (25G76) / arm64 · Node v22.22.2 · Python 3.14.4 · rustc 1.97.1
> 计划：`docs/superpowers/plans/2026-08-18-xuanji-final-remediation-and-verification.md`
> 取代（计数与当前结论）：[`2026-08-14-codex-style-implementation-review.md`](2026-08-14-codex-style-implementation-review.md)（历史失败/未验证声明保留）
> 基线冻结：[`2026-08-18-final-remediation-baseline.md`](2026-08-18-final-remediation-baseline.md)

本文件只证明本地 Implemented / Integrated candidate + 无 App 浏览器门禁。
**不**表示已构建桌面 App、已签名/公证、已创建 GitHub Release、已安装或用户已验收。
源码元数据 `0.3.4` **不等于**已发布版本。远端最新 GitHub Release 仍为 **`v0.3.3`**。

## 证据层级

| 层级 | 状态 |
| --- | --- |
| `source` | `source_present`（本 SHA 的隔离栈、审核确认绑定、2x 卡片截图与质量债清理） |
| `test` | `tests_passed`（两轮 `verify-all --skip-tauri-build` + 第三次独立 Playwright 均为退出码 0） |
| `build` | 浏览器 Vite build 通过；sidecar/Tauri **`not_built`**（第 11 步 SKIPPED） |
| `package` | `not_packaged` |
| `runtime` | `not_runtime_verified`（未启动 `.app` / WebView / VoiceOver / 真实 updater） |
| `external` | `not_external_verified`（未发真实 OpenAI / Hermes） |
| `remote_ci` | `not_remote_ci_verified`（local-only，未 push） |
| `remote_release` | `not_released`（最新远端 Release = `v0.3.3`） |
| `update` | `not_update_verified` |
| `installed` | `not_installed` |
| `user_acceptance` | `acceptance_unknown` |
| 独立审核 | **未进行**（owner self-check only） |

## 前置失败（不隐藏）

在 SHA `39558fd9c37d5ad55d79f2f9e60f148ae1afa74c` 上，两轮 `verify-all --skip-tauri-build` 已退出 0，但独立 `cd app && npm run test:e2e` 退出 1：

```text
e2e/local-workflow.spec.ts:109
确认审核 stayed disabled 15000ms（warnings 已渲染，无 blockers）
```

原因：`if (await ack.count())` 不等待 `review/prepare`。`2fb462d` 改为先等「重新加载审核」可点与「快照哈希」可见，再滚动勾选警告。
该失败的证据文档**没有**写成通过。

## 门禁命令（本 SHA）

工作树：`/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow/.worktrees/fix-xuanji-final-remediation`
分支：`fix/xuanji-final-remediation`
未设置 `E2E_*` / `CI`（verify-all 自行分配端口并强制 `E2E_REUSE_EXISTING_SERVER=0`）。

| # | 命令 | 起止（CST） | 退出码 | E2E 栈 |
| --- | --- | --- | --- | --- |
| 1 | `bash scripts/verify-all.sh --skip-tauri-build` | 12:55:51–12:58:05 | **0** | `127.0.0.1:55042` · `.../T/xuanji-e2e-s6pkh58b` |
| 2 | 同上 | 12:58:29–13:00:41 | **0** | `127.0.0.1:56437` · `.../T/xuanji-e2e-4eahzz_3` |
| 3 | `cd app && npm run test:e2e` | 13:00:54–13:01:12 | **0** | `127.0.0.1:18080` · `.../T/xuanji-e2e-51y45l5w` |

第 2 轮**没有**复用第 1 轮 Coordinator 或临时数据目录。
每轮后 `ps … \| rg 'scripts/e2e_stack.py'`：无本任务新残留。第 3 轮后 18080 未再监听。

原始日志（本机临时，不入库）：`/tmp/xuanji-task5-verify/gate{1,2,3}.log`。

## 计数（两轮 verify-all 一致）

| 门禁 | 结果 |
| --- | --- |
| 0. 开源文档 | passed |
| 1. Backend pytest | **200 passed, 10 warnings**（93.32s / 93.48s） |
| 2. Node Agent pytest | **29 passed, 1 warning** |
| 3. Frontend vitest | **24 files / 103 tests passed** |
| 4. Production `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities** |
| 5. Lint | **0 warnings, 0 errors**（93 files） |
| 6. Vite browser build | passed；主 JS `index-MQedJZew.js` **515.94 kB** / gzip 159.12 kB |
| 7. Playwright E2E | **32/32 passed**（17.4s / 18.3s） |
| 8. Python compileall | passed |
| 9. Cargo test | **16 passed**; 0 failed |
| 10. Cargo check | passed（dead-code warnings 仍在） |
| 11. Tauri build | **SKIPPED**（未跑 `tauri` / `build:tauri` / `.app`） |

独立第 3 次 Playwright：**32/32 passed**（17.8s）。无 disabled timeout、无 409 级联、无 strict locator 冲突。
先前失败用例 `local-workflow.spec.ts:110` 本轮 1.9s 通过。

定向复跑（修 flake 后、全量门禁前）两次：

```bash
cd app && npm run test:e2e -- e2e/local-workflow.spec.ts e2e/review-workflow.spec.ts \
  e2e/review-ack-stability.spec.ts e2e/product-foundation-journey.spec.ts
```

均为 **8/8 passed**，退出码 0。

## 警告（不隐藏）

### pytest

Backend **10**：

- 1× `StarletteDeprecationWarning`：FastAPI TestClient / `httpx` vs `httpx2`
- 1× Pydantic：expected `HttpUrl`，got `str` `'http://remote.test:9000'`
- 7× Pydantic：expected `enum`，got `str` `'online'`
- 1× Pydantic：expected `enum`，got `str` `'offline'`

Node Agent **1**：同上 Starlette/`httpx` deprecation。

### Rust dead-code（仍存在）

Cargo test：lib **3 warnings** + lib test **1 warning**。Cargo check：lib **3 warnings**。

- `CoordinatorError` 变体 `PortAllocation` / `NotRunning` / `Io` 未构造（`src/coordinator.rs`）
- `find_free_port` 未使用（`src/coordinator.rs:411`）
- `TunnelError::code` 未使用（`src/tunnel.rs:35`）

### Vite chunk（仍存在）

- `[INEFFECTIVE_DYNAMIC_IMPORT]` `@tauri-apps/api/core.js`（`AppShell.tsx` 动态导入 + 静态导入）
- 主 chunk **515.94 kB > 500 kB**

另：Playwright `NO_COLOR` 被 `FORCE_COLOR` 覆盖（非产品）。

### npm audit

| 命令 | 结果 |
| --- | --- |
| `npm audit --omit=dev --audit-level=high`（两轮门禁内） | 0 vulnerabilities |
| `cd app && npm audit`（全量，门禁后补记） | 0 vulnerabilities |
| `npm ls nanoid` | `nanoid@3.3.18`（via vite → postcss） |

## 未验证

- 桌面 App / Tauri WebView / 原生菜单实机
- VoiceOver、系统缩放、真实 updater 下载安装
- Keychain-on-device、真实 OpenAI、真实 Hermes / 远端节点
- 签名、公证、push、PR、GitHub Release、用户安装验收

## 受保护资产

本计划未修改、未暂存、未提交 owner checkout 上的 sidecar、`build/`、`release/xuanji-0.3.4-20260814/`。
Worktree sidecar 仍为提交副本（`768bcc7d…` / `8e512b40…`）。
