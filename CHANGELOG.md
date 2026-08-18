# 变更记录

## 0.3.5 — 源码发布（2026-08-18）

- 本地 Playwright 默认不再复用陈旧 Coordinator/Vite；`verify-all` 分配独立端口。
- 审核警告确认绑定当前 snapshot；同快照重载保留勾选。
- 清理前端 lint / `nanoid` 审计债务；拆分 i18n 与日志脱敏工具。
- 加强 TaskNode 渲染隔离测试与画布 2x 截图基线。
- 「检查更新」改为手动：启动不自动更新；发现新版本后下载、退出、静默安装并重新打开；任务运行中拦住。
- 源码版本号 **0.3.5**。未重建 macOS `.app` / DMG / PKG；用户安装包仍以 GitHub Release `v0.3.3` 为准。

## 0.3.4 — 源码合并（2026-08-14）

- 将 `candidate/ux-integration` 合入当前工作区：就绪检查、审核快照、节点接入向导、会话票据、交付合同等。
- 保留 0.3.4 版本号、Logo、菜单和状态栏，以及 Apache-2.0 开源治理文档。
- **未生成或启动 macOS `.app`**，也未创建新的 DMG、PKG 或更新包。
- 已存在的 0.3.3 安装资产继续按 [`release/README.md`](release/README.md) 记录，不代表 0.3.4 已发布。

## 0.3.3 — 已归档安装资产

- 安装包、更新链路和校验信息见 [`release/README.md`](release/README.md)。
