# Final remediation · 基线冻结

> 日期：2026-08-18
> 本文件只冻结执行起点、双工作区状态与受保护资产哈希，不代表实现已完成、App 已构建或版本已发布。
> 计划：`docs/superpowers/plans/2026-08-18-xuanji-final-remediation-and-verification.md`
> 记录方式：实现者自检（非独立审核）。

## BaselineEvidence

| 字段 | 值 |
| --- | --- |
| `source_sha` / `HEAD` | `59c5e196939fcb20be5cdc31d7fabb74009ababb` |
| `origin/main` | `59c5e196939fcb20be5cdc31d7fabb74009ababb` |
| Worktree path | `/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow/.worktrees/fix-xuanji-final-remediation` |
| Worktree branch | `fix/xuanji-final-remediation` |
| Owner checkout path | `/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow` |
| Owner branch | `main`（跟踪 `origin/main`） |
| `package_version` | `0.3.4`（源码元数据，**不等于**已安装 / 已发布版本） |
| 远端最新 GitHub Release | `v0.3.3`（`0.3.4` 仅为源码与本地未跟踪安装资产） |
| 记录时刻（本地） | `2026-08-18 11:55:14 CST` |

确认命令（两棵树 HEAD / `origin/main` 均为同一 SHA）：

```text
# worktree
git rev-parse HEAD
# 59c5e196939fcb20be5cdc31d7fabb74009ababb
git rev-parse origin/main
# 59c5e196939fcb20be5cdc31d7fabb74009ababb

# owner checkout
git -C "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow" rev-parse HEAD
# 59c5e196939fcb20be5cdc31d7fabb74009ababb
```

## Dual-tree workspace status

### Worktree（本 remediation 隔离工作区）

```text
## fix/xuanji-final-remediation
?? docs/superpowers/plans/2026-08-18-xuanji-final-remediation-and-verification.md
```

- 无 modified sidecar；无 `build/`；无 `release/xuanji-0.3.4-20260814/`。
- 工作区内已跟踪 sidecar 为干净提交副本（与 owner 脏二进制不同，见下）。
- `git diff --stat`：空（无已跟踪修改）。
- 额外未跟踪：计划文件 `docs/superpowers/plans/2026-08-18-xuanji-final-remediation-and-verification.md`（本任务不提交）。

### Owner checkout（受保护脏资产所在目录）

```text
## main...origin/main
 M app/src-tauri/binaries/xuanji-coordinator
 M app/src-tauri/binaries/xuanji-coordinator-aarch64-apple-darwin
?? build/
?? docs/superpowers/plans/2026-08-18-xuanji-final-remediation-and-verification.md
?? release/xuanji-0.3.4-20260814/
```

`git diff --stat`（owner）：

```text
 app/src-tauri/binaries/xuanji-coordinator          | Bin 19733760 -> 19788240 bytes
 .../xuanji-coordinator-aarch64-apple-darwin        | Bin 19733792 -> 19788240 bytes
 2 files changed, 0 insertions(+), 0 deletions(-)
```

相对计划 Step 1「只看到两个 modified sidecar、`build/` 和 `release/xuanji-0.3.4-20260814/`」的额外项：

- `?? docs/superpowers/plans/2026-08-18-xuanji-final-remediation-and-verification.md`（已记录；不提交；非阻断）

## Protected owner asset SHA-256

在 **owner checkout 绝对路径** 上实测（与计划期望值一致；未恢复、未覆盖、未暂存）：

```text
0313f0c41569002150395a6dad598006fb2b40a3776752651537745ea1d0a823  .../XuanJiAgentFlow/app/src-tauri/binaries/xuanji-coordinator
0313f0c41569002150395a6dad598006fb2b40a3776752651537745ea1d0a823  .../XuanJiAgentFlow/app/src-tauri/binaries/xuanji-coordinator-aarch64-apple-darwin
0faebfe8736a136d89addb90632caf1100a170c708226559a50b98e9b55c0b8f  .../XuanJiAgentFlow/release/xuanji-0.3.4-20260814/璇玑-0.3.4.pkg
0ff5dca38f4653389b8af4385390af52d2c6337ddb540619bdfc58e754485ac2  .../XuanJiAgentFlow/release/xuanji-0.3.4-20260814/璇玑_0.3.4_aarch64.dmg
```

Owner `release/xuanji-0.3.4-20260814/` 内容（未跟踪安装资产）：

- `璇玑-0.3.4.pkg`
- `璇玑_0.3.4_aarch64.dmg`

Owner `build/`：存在未跟踪目录（含 `xuanji-coordinator/` 构建产物）。一律避让。

### Worktree tracked sidecar hashes（干净提交副本，供对照）

```text
768bcc7d3a60c67501e31cd58cc1a349d7ffcacf1fbdc392c9e4393f7039556b  app/src-tauri/binaries/xuanji-coordinator
8e512b40603059d928f6c401c72efab5afa2ad9cf9993cdbe311abb17af7e308  app/src-tauri/binaries/xuanji-coordinator-aarch64-apple-darwin
```

后续任务不得把 owner 脏二进制复制进 worktree、不得在 owner checkout 上 `git checkout --` / `git reset --hard` / `git clean` 这些路径。

## Stale E2E listener（Task 0 仅记录，不终止）

```text
lsof -nP -iTCP:18080 -sTCP:LISTEN
COMMAND     PID      USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
python3.1 72910 yancyfeng   21u  IPv4 …      0t0  TCP 127.0.0.1:18080 (LISTEN)

ps -axo pid,ppid,lstart,command | rg 'e2e_stack.py|vite.*5173' | rg -v 'rg '
72910     1 五  8月/14 16:54:32 2026   /Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow/.venv/bin/python /Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow/scripts/e2e_stack.py --coordinator-port 18080
```

- 进程明确指向 **owner checkout** 的 `scripts/e2e_stack.py --coordinator-port 18080`。
- 启动时间：2026-08-14 16:54:32（陈旧）。
- `5173`：无监听。
- Task 0 **不** kill 该进程。

## 2026-08-18 新鲜验证摘要（计划 §0.1，本任务未重跑）

| 门禁 | 结果 |
| --- | --- |
| 开源文档检查 | 通过 |
| Backend pytest | 200 passed，10 warnings |
| Node Agent pytest | 29 passed，1 warning |
| Frontend Vitest | 97 passed |
| Production dependency audit | 0 vulnerabilities |
| Frontend lint | 退出码 0，8 warnings |
| TypeScript + Vite browser build | 通过；主 JS chunk 约 515.68 kB |
| Python compileall | 通过 |
| Cargo tests | 16 passed |
| Cargo check | 通过；3 组 dead-code warnings |
| 默认端口完整 E2E | **19/31** 通过，12 失败；复用陈旧服务，结果不可信 |
| 新端口完整 E2E | **30/31** 通过；主 UI 审核确认流程顺序相关失败 |
| 失败主 UI 用例单独复跑 | 1/1 通过（非确定性 / 共享状态） |

根因范围（待后续任务修复，本基线不改代码）：

1. 默认端口 `18080` 上陈旧 `e2e_stack.py` + Playwright `reuseExistingServer: !process.env.CI` 导致本地门禁无条件复用。
2. `ReviewWorkspace` 布尔 `acknowledged` 在完整顺序中被 `reload()` 路径清回 `false`，导致「确认审核」disabled。

## allowed_validation

允许：

- `bash scripts/verify-all.sh --skip-tauri-build`（及后续任务规定的隔离端口变体）
- Vitest、Playwright（浏览器栈）、pytest、Python `compileall`、`cargo test`、`cargo check`
- Vite 浏览器 build（输出到临时或已忽略目录）
- 本地提交仅限本计划授权的文档/源码变更（不得纳入 owner 二进制与 `release/xuanji-0.3.4-20260814/`）

## prohibited_commands

不得运行：

```text
npm run tauri
npm run tauri dev
npm run build:tauri
tauri build
git reset --hard
git checkout -- <protected binaries or release paths>
git clean
```

不得：

- 启动或安装 `.app` / 写入 `/Applications`
- 清理、恢复、覆盖、暂存或提交 owner 脏 sidecar、`build/`、`release/xuanji-0.3.4-20260814/`
- push、创建 PR、合并、更新 tag、创建 GitHub Release、上传安装包（除非用户另行明确授权）
- 读取 Keychain、API Key、SSH 私钥或签名证书
- 发送真实 OpenAI 请求

## release_boundary

- 远端最新 Release 如实为 **`v0.3.3`**。
- Owner 本地未跟踪 `release/xuanji-0.3.4-20260814/` **不是**远端 Release。
- 本计划完成层级止于本地 Implemented / Integrated candidate + 无 App 构建验收证据。
- 独立审核、签名、公证、GitHub Release、安装验收不在本任务自动进入。

## Protection contract for later tasks

每项后续任务前后应能核对：

1. Owner checkout 上四个受保护路径的 SHA-256 仍为上表实测值（若变化，只记录实际值，不得“恢复”到旧哈希）。
2. Worktree 不出现从 owner 复制进来的 `build/` 或 `release/xuanji-0.3.4-20260814/`。
3. 暂存区不含任何 sidecar / `build/` / `release/xuanji-0.3.4-20260814/` 路径。
4. 陈旧 `18080` 监听进程由后续隔离任务处理策略决定；Task 0 未终止。
