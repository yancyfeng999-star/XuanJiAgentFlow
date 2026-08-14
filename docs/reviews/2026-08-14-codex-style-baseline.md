# Codex 风格产品基础 · 基线冻结

> 日期：2026-08-14  
> 本文件只冻结执行起点与验证边界，不代表实现已完成、App 已构建或版本已发布。

## BaselineEvidence

| 字段 | 值 |
| --- | --- |
| `source_sha` | `77a50b8caa6db54f3c95f1025cf05a6f6c3c524b`（包含 `3232479e7a1e704a9ceddcee137e3ca256e55543`） |
| `branch` | `agent/xuanji-logo-menu-status-github` |
| `package_version` | `0.3.4`（源码元数据，**不等于**已安装 / 已发布版本） |
| `schema_version` | `5`（`CURRENT_SCHEMA_VERSION`） |
| `coordinator` | `3.0.0` |

确认命令：

```text
git rev-parse HEAD
# 77a50b8caa6db54f3c95f1025cf05a6f6c3c524b
git merge-base --is-ancestor 3232479e7a1e704a9ceddcee137e3ca256e55543 HEAD
# YES
```

## existing_capabilities（必须复用，不得平行重写）

- 统一就绪检查：`GET /api/readiness`，create/start run 服务端复检
- 审核快照与修订：`review/prepare`、`snapshot_hash`、stale 拒绝、`POST …/revisions`
- 资源级 pending actions（非全局 loading）
- 真实运行状态：`pending` / `cancelling` / `blocked` / `success_with_warnings` 等不折叠
- 项目 Run 历史：`GET /api/projects/{id}/runs`
- 一次性 WebSocket ticket（30s、单次、绑定 run）；HTTP 不接受 query `session_token`
- 产物 Header 会话认证 + Blob 下载
- CredentialStore + macOS Keychain 迁移（失败保留旧文件）
- SQLite 在线备份 / 完整性校验
- 任务交付合同：`writes` / `done_definition` / `verify` / `run_gate`
- 服务端 `allowed_actions` 为运行动作唯一来源

## known_gaps（仅本计划范围）

- Codex 风格 token / 字阶 / 去宋体与 9–10px 必要文本
- 工作区导航与设置六分类
- 工作流卡片选中无自身 transform/filter
- 五标签检查器与完整任务合同编辑面
- 多个思考模型（Responses + Chat）及旧 planner 迁移
- 用户可控更新状态机（检查 ≠ 下载 ≠ 安装；启动无静默更新）
- 诊断 / 帮助 / 反馈 / 安全启动恢复
- 无障碍 / 响应式 / 渲染性能保护
- Apache-2.0 文档脚本与 Issue/PR 模板

## allowed_validation

- `bash scripts/verify-all.sh --skip-tauri-build`
- Vitest、Playwright（浏览器栈）、pytest、`cargo test`（不启动 GUI、不打 bundle）
- 浏览器 Vite build，输出到临时目录或已忽略目录

## prohibited_app_commands

不得运行：

```text
npm run tauri
npm run tauri dev
npm run build:tauri
tauri build
```

不得启动或安装 `.app`。`0.3.4` 源码元数据不代表发布。

## release_boundary

- 当前用户可装包仍是 `0.3.3`（见 `release/README.md`）
- 本计划完成层级止于本地 Implemented / Integrated candidate
- 独立审核、签名、公证、GitHub Release、安装验收不在本任务自动进入

## 基线门禁

命令：`bash scripts/verify-all.sh --skip-tauri-build`

| 项 | 结果 |
| --- | --- |
| 退出码 | `0` — All checks passed |
| backend pytest | 191 passed |
| node-agent pytest | 29 passed |
| vitest | 72 passed / 11 files |
| Playwright e2e | 27 passed |
| cargo test | 14 passed |
| Tauri build | SKIPPED（`--skip-tauri-build`） |
| 无关失败 | 无 |

原始输出：执行会话 scratch `verify-all-task0.log`。当前 `0.3.4` 源码元数据不代表发布。不得构建 `.app`。
