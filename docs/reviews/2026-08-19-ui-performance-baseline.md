# 2026-08-19 UI / 性能基线与证据

> 执行仓：隔离 worktree `XuanJiAgentFlow-ui-performance`，分支 `fix/xuanji-ui-performance`，起点 `78b387f`。
> 主工作区只读；未构建、启动或打包 macOS `.app`。

## 审查对照 `78b387f`

| 现象 | 源码 | 本轮处理 |
|---|---|---|
| Coordinator 健康前只显示 boot card | `AppShell` `if (boot.phase === 'booting') return` | 立即渲染导航 + 52px 顶栏 + 画布骨架 |
| 顶栏堆满控件、文字易竖排 | `RunBar` 同时渲染进度、审核、五控制、阻塞原因、执行 | 单一主动作 + overflow |
| 就绪区占近半画布 | `.readiness-center { max-height: 46% }` | 40px 摘要条 + 覆盖详情 |
| 空检查器占 360px | 默认 `showInspector` | 无 task/run 上下文不占宽 |
| 节点缩到不可读 | `fitView` + `minZoom={0.25}` | 首次 fit minZoom 0.62 |
| 启动先发无项目 readiness | `loadReadiness()` 再 `loadProjects()` | 有项目后再拉 readiness |
| 主 chunk 515.94 kB | AppShell 静态导入节点/设置/画布 | lazy + bundle gate |
| 全局 antialiased | `globals.css` | 移除 |

## 冻结边界

- 截图目标视口：`1288×832@2x`（用户 2026-08-18 App 截图按 Retina 折算）
- 改动前 eager 主 chunk：`515.94 kB`（来源 2026-08-18 验证记录，非本轮 App 实测）
- 主仓脏资产（不得触碰）：`app/src-tauri/binaries/xuanji-coordinator*`、三个历史 DMG 删除、`build/`、`release/xuanji-0.3.4-20260814/`
- 测试环境：worktree Web / Vitest / Playwright Chromium；**未**做真实 Tauri WebView 测量
- 当前请求顺序（改动前）：runtime healthy → `GET /api/readiness`（无 project）→ `GET /api/projects` → 选中项目后再 `getProject` / workflow / runs / readiness

## 证据分层

| 标签 | 状态 |
|---|---|
| `source_present` | 是：隔离 worktree `fix/xuanji-ui-performance`，起点 `78b387f` |
| `targeted_tests_passed` | 是：两轮 76 项目标 Vitest 均为 0 |
| `web_build_passed` | 是：`npm run build` + `npm run check:bundle` |
| `browser_runtime_verified` | 是：Playwright Chromium；布局/性能规格两轮通过；`1288×832` 截图已存 |
| `app_runtime_unverified` | 固定：未构建/启动 `.app`，无 Tauri WebView 20 次冷启动采样 |
| `remote_release_unverified` | 固定：未改 Release / 签名 / 公证 |

## 前后数据表（Tasks 1–9）

| 指标 | 改动前 | 改动后 | 取证 |
|---|---|---|---|
| 首屏骨架 | 全屏 boot card | 导航 + 52px 顶栏 + 画布骨架 | AppShell Vitest + Playwright |
| eager JS raw | 515.94 kB | 288.5 kB（295435 B） | `check:bundle` |
| eager JS gzip | 未记 | 89.6 kB（91760 B） | `check:bundle` |
| 最大 lazy JS | 未拆 | WorkflowCanvas 179.5 kB（含 xyflow） | `check:bundle` |
| 默认 viewport zoom | 可到 0.25 | ≥ 0.62 | canvas-clarity |
| 就绪详情是否改画布高度 | 是（flex 挤压） | 否（覆盖层） | ui-layout |
| 无上下文 Inspector 宽 | 360px | 0 | AppShell test |
| 启动 readiness 无 project | 会发 | 不发 | workspaceStore test |
| shell_mounted | 未标记 | ≤200ms（Playwright evaluate） | ui-performance |
| 项目可交互 p50/p95 | 未采样 | 未做 20 次冷启动；结构门禁已过 | `app_runtime_unverified` |
| 项目切换 p95 | 未采样 | 结构断言通过（abort + 骨架） | workspaceStore + ui-performance |
| Inspector 出现 p95 | 未采样 | 选中后出现；无上下文不占宽 | AppShell + Inspector tests |
| CLS | 未采样 | 骨架定高；详情不改画布高度 | ui-layout |

时间预算（1500/800/700/100ms、长任务 <50ms、CLS ≤0.05）未做 20 样本 p50/p95；结构断言与 bundle 门禁是硬门。

## 改动后请求顺序

runtime healthy → 同轮 `listProjects` + `listNodes` + `listThinkingModels` → 有项目后再并行 `getProject` / workflow / runs / `getReadiness({projectId})`。

## 视口证据

- 目标：`1288×832@2x`
- 截图：顶栏单行（项目名、状态、节点摘要、单一「解决阻塞」/「审核工作流」、overflow）；40px 就绪条；卡片可读；无空检查器列。
