# Final remediation · 独立审核交接

> 日期：2026-08-18
> **文档状态（唯一允许填写的结论）：**
>
> ```text
> NOT_INDEPENDENTLY_REVIEWED — owner self-check only
> ```
>
> 本文件**不是**独立 Reviewer / QA 签字。Tasks 0–5 的实现、门禁与本文的对照检查均由同一会话中的 Grok 子代理完成，仓库内没有单独的人类 Reviewer/QA。因此**禁止**把下文任何技术自检读成 `PASS` / `PASS_WITH_NON_BLOCKING_DEBT` / `FAIL`。
> 计划：`docs/superpowers/plans/2026-08-18-xuanji-final-remediation-and-verification.md`
> 基线：[`2026-08-18-final-remediation-baseline.md`](2026-08-18-final-remediation-baseline.md)
> 实现者门禁记录：[`2026-08-18-final-remediation-verification.md`](2026-08-18-final-remediation-verification.md)

本计划到此停止。未执行 push、PR、merge、版本升级、GitHub Release、DMG/PKG 重建、真实 updater 或用户安装。

## 1. 审核身份

| 项 | 值 |
| --- | --- |
| 检查日期 | 2026-08-18 |
| 检查人 | Grok 子代理（与 Tasks 0–5 同一会话） |
| 独立 Reviewer / QA | **不存在** |
| 检查种类 | 实现者对照 diff / 文档 / 既有门禁日志的自检 |
| 工作树 | `/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow/.worktrees/fix-xuanji-final-remediation` |
| 分支 | `fix/xuanji-final-remediation`（local-only，未 push） |
| 审核开始时 `HEAD` | `479a7d2607480bea34ec6c0fb353ec925f773a72` |
| merge-base / `origin/main` | `59c5e196939fcb20be5cdc31d7fabb74009ababb` |
| 门禁实测 SHA | `2fb462d90d63542437971d76736db1ac1b4bd4c8` |
| 环境（门禁记录） | macOS 26.6.1 (25G76) / arm64 · Node v22.22.2 · Python 3.14.4 · rustc 1.97.1 |

本文若随后以 `docs:` 提交单独入库，新 `HEAD` 只应增加本交接文件，不得改变上表实现 / 门禁 SHA 的含义。

## 2. Step 1 — 固定审核范围

执行（审核开始时）：

```bash
git rev-parse HEAD
# 479a7d2607480bea34ec6c0fb353ec925f773a72

git log --oneline --decorate -12
git diff 59c5e196939fcb20be5cdc31d7fabb74009ababb..HEAD --stat
git diff 59c5e196939fcb20be5cdc31d7fabb74009ababb..HEAD -- \
  app/playwright.config.ts scripts/verify-all.sh \
  app/src/features/workflow app/e2e app/src/lib app/src/features/runs docs
```

`59c5e19..479a7d2` 七个提交（全部作者标记为工作区本地 `YancyFeng`）：

| SHA | 主题 | 对应任务 |
| --- | --- | --- |
| `ffa0052` | `docs: record final remediation baseline` | Task 0 |
| `0e52bcc` | `test: isolate local Playwright stacks` | Task 1 |
| `372609d` | `fix: preserve review acknowledgement for the active snapshot` | Task 2 |
| `d720688` | `chore: clear frontend audit and lint debt` | Task 3 |
| `39558fd` | `test: strengthen canvas clarity and render evidence` | Task 4 |
| `2fb462d` | `test: wait for prepared review before acknowledging warnings` | Task 5 flake 修复 |
| `479a7d2` | `test: record stable product foundation verification` | Task 5 证据 |

`--stat`：44 files, +945 / −172。`git diff --name-only 59c5e19..479a7d2` **不含** `binaries/`、`build/`、`release/`。

工作树在审核开始时仅有计划文件未跟踪：

```text
## fix/xuanji-final-remediation
?? docs/superpowers/plans/2026-08-18-xuanji-final-remediation-and-verification.md
```

该计划文件不在 Tasks 0–5 提交内，本文也不把它纳入候选。

## 3. Step 2 — E2E 隔离（实现者对照，非独立签字）

对照对象：`0e52bcc` 的 `app/playwright.config.ts`、`scripts/verify-all.sh`、`app/src/__tests__/e2e-isolation-contract.test.ts`，以及 Task 5 门禁日志。

| 检查项 | 自检观察 | 证据 |
| --- | --- | --- |
| 默认不能复用现有端口服务 | 旧合同 `reuseExistingServer: !process.env.CI` 已删除。现为 `process.env.E2E_REUSE_EXISTING_SERVER === '1'` 才为 true；未设置时 false。 | `app/playwright.config.ts:12,56,64`；基线 `59c5e19` 仍是 `!process.env.CI` |
| 连续门禁使用不同 data directory | Task 5 两轮 `verify-all --skip-tauri-build` 分别为 `:55042` / `xuanji-e2e-s6pkh58b` 与 `:56437` / `xuanji-e2e-4eahzz_3`。第三轮独立 `npm run test:e2e` 为 `:18080` / `xuanji-e2e-51y45l5w`。 | `/tmp/xuanji-task5-verify/gate{1,2,3}.log` 中的 `E2E_STACK_READY` |
| 失败时清理自己的子进程 | `scripts/e2e_stack.py` 对 SIGINT/SIGTERM 置位，并在 `finally` 里停止 Coordinator / FakeNode、unlink state file。Playwright `webServer.reuseExistingServer` 默认 false，由 Playwright 回收自己拉起的进程。 | `scripts/e2e_stack.py:240-266` |
| 不终止其他项目进程 | Task 1 只对**命令精确匹配本仓库** `scripts/e2e_stack.py --coordinator-port 18080` 的陈旧 PID `72910` 发 TERM。审核此刻 `ps … e2e_stack.py` 为空；18080 / 5173 无监听。 | Task 1 报告；本次 `ps` / `lsof` |
| CI 与本地同一默认隔离语义 | 复用不再绑定 `CI`。`.github/workflows/verify.yml` 跑 `bash scripts/verify-all.sh --skip-tauri-build`，脚本强制 `E2E_REUSE_EXISTING_SERVER=0` 并分配互异空闲端口。本地未设 `E2E_*` 时 Playwright 同样不复用。 | `verify.yml:41-42`；`verify-all.sh:95-110`；合同测试 |

合同测试只做源码字符串断言，不证明运行时回收；运行时隔离依赖 Task 5 日志与当前无残留进程。硬杀（非 SIGTERM）仍可能留下 gitignored `.e2e/stack.json`（Task 1 已记；下一轮会覆盖）。

## 4. Step 3 — 审核状态合同（实现者对照，非独立签字）

对照对象：`372609d` 的 `ReviewWorkspace.tsx` / 单测 / `review-ack-stability.spec.ts`，以及 `2fb462d` 的 `acknowledgePreparedReview()`。

| 检查项 | 自检观察 | 证据 |
| --- | --- | --- |
| 同一 snapshot hash 重载保留已确认 | `acknowledgedSnapshotHash` 与 `prepared.snapshot_hash` 比较；`reload()` 在 prepare 返回后若 hash 相同则保留。不再在请求前 `setAcknowledged(false)`。 | `ReviewWorkspace.tsx:16-30`；单测 “keeps acknowledgement when the same prepared snapshot is delivered again”；`review-ack-stability.spec.ts` UI 同快照重载后 checkbox 仍 checked |
| snapshot hash 改变后必须重新确认 | hash 不同则把 `acknowledgedSnapshotHash` 置 `null`，确认按钮再次 disabled。 | `ReviewWorkspace.tsx:28-30`；单测 “requires acknowledgement again when the snapshot hash changes” |
| blocker 不能靠勾选 warning 绕过 | `confirmDisabled` 在 `blockers.length > 0` 时为 true，与 `acknowledged` 无关。后端 `review` 在 blockers 存在时仍 409 `review_blocked`。 | `ReviewWorkspace.tsx:80`；单测 “keeps confirm disabled when blockers exist”；`backend/src/xuanji/api/workflows.py:163-168`（本范围未改后端，合同仍在） |
| stale snapshot 稳定 409 且可重载 | UI 捕获 `CoordinatorError` `review_snapshot_stale` 后显示告警；页脚「重新加载审核」在 `prepared` 存在时可点。E2E API 用例断言 HTTP 409 + `error.code === 'review_snapshot_stale'`。 | `ReviewWorkspace.tsx:71-75,178-188`；`review-workflow.spec.ts:48-65`；`workflows.py:156-161` |
| pending review 只禁用当前审核动作 | `reviewing` 只订阅 `pendingActions` 中 `kind === 'review'`，仅禁用确认按钮。`begin/end` 按 `pendingKey` 隔离；项目 / 节点 / 思考模型 / 执行各用自己的 kind。未见全局锁。 | `ReviewWorkspace.tsx:13-14,190-198`；`workspaceStore.ts:283-292,654-679` |

`2fb462d` 把主 UI 旅程改为先等「重新加载审核」可点与「快照哈希」可见，再勾选警告。这修复了 `39558fd` 上独立第三轮 E2E 的 disabled-timeout（`local-workflow.spec.ts:109`，日志 `/tmp/xuanji-task5-verify/run3.log`）。该失败**没有**被写成通过。

残留：`acknowledgePreparedReview()` 在 prepare 就绪后仍用 `if (await ack.count())` 决定是否勾选；若警告晚于哈希出现，理论上仍可能漏勾。Task 5 在 `2fb462d` 上三轮门禁未再复现。

## 5. Step 4 — 边界（实现者对照，非独立签字）

| 检查项 | 自检观察 |
| --- | --- |
| 未改 / 未暂存 / 未提交受保护二进制、`build/`、`release/` | 范围 `name-only` 无这些路径。Owner checkout 只读复核：两个 sidecar + `?? build/` + `?? release/xuanji-0.3.4-20260814/` + 未跟踪计划文件。工作树无 `build/`、无 `release/xuanji-0.3.4-20260814/`。 |
| Owner 哈希与 Task 0 基线一致 | `0313f0c4…` 两个 sidecar；`0faebfe8…` PKG；`0ff5dca3…` DMG。工作树已跟踪 sidecar 仍为 `768bcc7d…` / `8e512b40…`。 |
| 无真实 OpenAI / 无凭证入仓 | 范围是测试栈、审核状态、lint/i18n 拆分、截图基线与文档。E2E 仍走 `scripts/e2e_stack.py` MockPlanner / FakeNode。未见 Keychain / API Key / 证书读取。 |
| 无 Tauri App build / 启动 / 安装 / Release | 两轮 verify-all 第 11 步均为 `=== 11. Tauri build === SKIPPED`。未跑 `tauri` / `build:tauri`。 |
| `0.3.4` 仍是源码候选 | `app/package.json` version `0.3.4`。验证文档、`CURRENT_STATE.md`、`EVIDENCE_INDEX.md` 均写明不等于已安装 / 已发布。 |
| 远端 Release 仍为 `v0.3.3` | 只读 `gh release list --limit 3`：Latest = `v0.3.3`（2026-08-11）。`origin/main` 仍停在 `59c5e19`。本分支 7 个提交仅本地。 |

历史 `release/xuanji-0.3.{1,2,3}-20260811/` 已在 `main` 跟踪；本范围未改这些路径。它们也**不是**本次 0.3.4 候选发布。

## 6. 最终验收清单 — 实现者对照（不得当作独立勾选）

对照 [`2026-08-18-final-remediation-verification.md`](2026-08-18-final-remediation-verification.md) 与 `/tmp/xuanji-task5-verify/gate{1,2,3}.{log,exit}`。**本交接任务未重跑** `verify-all` 或完整 Playwright。

| 清单项 | 自检 |
| --- | --- |
| 默认本地 E2E 不复用旧 Coordinator/Vite | 源码合同成立；Task 5 日志显示自建栈 |
| 本计划无新孤儿 `e2e_stack.py` | 审核此刻 `ps` 为空 |
| 同快照重载不清用户警告确认 | 单测 + `review-ack-stability` + 实现 |
| 新快照必须重新确认 | 单测覆盖；E2E 未再跑“改 hash 后必须重勾”的独立 UI 用例 |
| 主 UI 规划→编辑→审核→执行→多节点产物 | `local-workflow.spec.ts` 在 gate 1–3 通过；`39558fd` 第三轮曾失败并已记录 |
| 两轮 `verify-all --skip-tauri-build` 退出码 0 | `gate1.exit` / `gate2.exit`：`EXIT:0`（12:55:51–12:58:05 / 12:58:29–13:00:41 CST） |
| 第三次独立 Playwright 退出码 0 | `gate3.exit`：`EXIT:0`（13:00:54–13:01:12 CST），32/32 |
| Backend / Node Agent / Vitest / audit / lint / Vite / compileall / Cargo | 两轮一致：200+10w / 29+1w / 103 / 0 vuln / 0 lint / 515.94 kB / compileall / cargo 16 + dead-code |
| 完整 `npm audit` 0 vuln，`nanoid >= 3.3.18` | 验证文档 + 当前 lockfile `nanoid@3.3.18` |
| 浏览器 2x DPR hover/selected 基线 | `task-card-{hover,selected}-2x-chromium-darwin.png` 已入库；本交接未重新目视 |
| 真实 TaskNode 性能测试取代 memo Probe | `render-performance.test.tsx` 挂真实 `TaskNode`；活画布仍见下节债务 |
| 原二进制 / `build/` / `release/` 未改 | 见 §5 |
| 没有构建 / 启动 / 安装 `.app` | Tauri SKIPPED |
| 没有真实 Provider 调用 | Mock/Fake 栈 |
| 没有 push / PR / merge / tag / GitHub Release | `origin/main` = `59c5e19`；Latest Release `v0.3.3` |
| 独立审核与 Owner 自检被区分 | **本文状态即该区分**；验证文档已标 owner self-check |

## 7. 技术自检摘要（从属于 NOT_INDEPENDENTLY_REVIEWED）

以下**不是**审核结论，只记录对照 diff 与既有日志后看起来成立的点和剩余债务。

### 看起来扎实

- 两个原阻断根因在源码上对得上：本地不再因 `!CI` 复用 18080 陈旧栈；审核确认绑定 snapshot hash，同 hash 重载不再先清确认。
- `2fb462d` 上连续两轮完整无 App 门禁 + 第三次独立 32/32 Playwright，退出码 0；与 `39558fd` 第三轮失败分开记录。
- 生产 + 全量 `npm audit` 0 vulnerabilities；lint 0/0；`nanoid@3.3.18`。
- 文档分层（source / test / build / package / runtime / remote_release）没有把 `0.3.4` 写成已发布或已安装。
- 受保护 owner 资产哈希与 Task 0 基线一致。

### 剩余债务（每项有文件或命令）

| 债务 | 证据 |
| --- | --- |
| 无人独立复核 | 本文状态；Tasks 0–5 与本文同一会话 |
| 桌面 App 未构建、未实机 | verify-all 第 11 步 SKIPPED |
| 未 push，远端 CI 未跑本分支 | `git log origin/main..HEAD` 七个本地提交；`remote_ci: not_remote_ci_verified` |
| 活 `WorkflowCanvas` 仍按 `selectedTaskId` 给每个节点 `data: { ...task }` | `app/src/features/canvas/WorkflowCanvas.tsx:44-50`；Task 4 明确未改产品画布 |
| `acknowledgePreparedReview` 的 `ack.count()` 仍不等待 checkbox 出现 | `app/e2e/helpers.ts:113-118` |
| 未使用的 `review.reload` 文案键 | `messages.zh-CN.ts` / `messages.en.ts`；UI 只用 `review.reloadPrepared` |
| 导出的 `SECRET_PATTERNS` 无仓内其他引用 | `app/src/features/runs/taskLogRedaction.ts:1` |
| 2026-08-14 计划 Task 13 矩阵写了 `tests_passed`，页眉同时写独立审核未验证 | `docs/superpowers/plans/2026-08-14-xuanji-codex-style-product-foundation.md:5-29` |
| 该历史计划仍约 177 个未勾选步骤 | Task 5 约定不批量改勾 |
| pytest 10+1 警告、Rust dead-code、Vite 主 chunk 515.94 kB、`INEFFECTIVE_DYNAMIC_IMPORT` | 验证文档「警告（不隐藏）」 |
| VoiceOver / 系统缩放 / App WebView | `docs/ACCESSIBILITY_CHECKLIST.md` `not_runtime_verified` |
| 基线 lsof 行省略了部分字段 | Task 0 minor |

## 8. Grok 最终交付格式

```text
结论：NOT_INDEPENDENTLY_REVIEWED — owner self-check only
候选 SHA：479a7d2607480bea34ec6c0fb353ec925f773a72
源码状态：source_present
本地门禁：在 2fb462d90d63542437971d76736db1ac1b4bd4c8 上
  1) bash scripts/verify-all.sh --skip-tauri-build → EXIT 0（12:55:51–12:58:05 CST）
     backend 200 / node-agent 29 / vitest 103 / e2e 32/32 / cargo 16；Tauri SKIPPED
  2) 同上 → EXIT 0（12:58:29–13:00:41 CST）；不同端口与 data_dir
  3) cd app && npm run test:e2e → EXIT 0（13:00:54–13:01:12 CST）；32/32
  本交接未重跑上述命令；核对了 /tmp/xuanji-task5-verify/gate{1,2,3}.exit 与日志
浏览器运行：E2E 32（含 review-ack-stability）；2x hover/selected 截图已入库；retries=0；
  39558fd 第三轮 31/32（disabled timeout）已记录且未写成通过
桌面 App：not_built / not_runtime_verified
远端状态：local-only。origin/main == 59c5e196939fcb20be5cdc31d7fabb74009ababb；
  最新 GitHub Release = v0.3.3；0.3.4 仅为源码元数据
独立审核：not_independently_reviewed
保留脏资产（owner checkout，只读复核，哈希与 Task 0 相同）：
  0313f0c41569002150395a6dad598006fb2b40a3776752651537745ea1d0a823  xuanji-coordinator
  0313f0c41569002150395a6dad598006fb2b40a3776752651537745ea1d0a823  xuanji-coordinator-aarch64-apple-darwin
  0faebfe8736a136d89addb90632caf1100a170c708226559a50b98e9b55c0b8f  璇玑-0.3.4.pkg
  0ff5dca38f4653389b8af4385390af52d2c6337ddb540619bdfc58e754485ac2  璇玑_0.3.4_aarch64.dmg
  另：?? build/ ；?? release/xuanji-0.3.4-20260814/ ；本计划未触碰
剩余风险：
  - 无独立 Reviewer（本文件）
  - App / VoiceOver / 真实 updater / 真实 Provider 未验证（verify-all 第 11 步 SKIPPED；ACCESSIBILITY_CHECKLIST）
  - 活画布选择仍复制 node data（WorkflowCanvas.tsx:44-50）
  - E2E ack.count() 在 prepare 就绪后仍非等待（helpers.ts:113-118）
  - 本分支未上远端 CI
```

## 9. 本文件明确不是什么

- 不是独立审核通过。
- 不是 `0.3.4` GitHub Release、签名、公证、安装验收。
- 不是授权执行 push / PR / merge / tag / updater。
- 不是对 `/tmp/xuanji-task5-verify/` 之外的新一次全量门禁。
