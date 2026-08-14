# Codex-style product foundation · implementation review

> 日期：2026-08-14  
> 状态：本地实现/测试候选。**不是**已发布、已安装、已签名/公证，也**不是**独立审核通过。  
> 基线：`3232479e7a1e704a9ceddcee137e3ca256e55543` 的后代（`agent/xuanji-logo-menu-status-github`）。  
> 验证命令：`bash scripts/verify-all.sh --skip-tauri-build`  
> 验证结果：退出码 0。backend 199 / node-agent 29 / vitest 97 / e2e 31 / cargo 16。Tauri build 未跑。

## 需求对照

| 需求 | 证据 | 结果 |
| --- | --- | --- |
| Codex 密度/字阶，系统 sans + SF Mono；无 Songti；无 9/10px 必要文本 | `app/src/styles/__tests__/visual-tokens.test.ts` | 已由 vitest 覆盖 |
| 三栏工作区，左导航可收起，检查器可收起 | `AppShell.test.tsx` + Playwright 工作区导航 | 项目面板不再叠放检查器，避免挡住「创建项目」 |
| 选中/悬停卡片无自身 transform | `e2e/canvas-clarity.spec.ts` | 31 项 e2e 全绿时通过 |
| 五标签检查器 + 任务合同保存 | `Inspector.test.tsx` 五标签单草稿断言 `updateWorkflow` 一次完整合同；`taskDraft.test.ts` | 执行/产物不再走第二套 `TaskEditor` |
| 多思考模型、唯一默认、密钥不回传 | thinking-model API/UI 测试 + journey 两个 profile | 未发真实 OpenAI |
| 用户文案「思考模型」而非 Planner/规划器 | i18n、就绪标题、`ERROR_MESSAGES`、Chat adapter、`plan()` 503 | 兼容 API 字段/类型名 `planner_*` 保留一周期 |
| 更新：检查 ≠ 下载 ≠ 安装；启动无静默更新 | `updater.test.ts`（含菜单事件只 check）；`update_menu.rs` emit 测试；Builder `on_menu_event` | 真实下载/安装未测（需 App） |
| 诊断脱敏 | `supportSummary.test.ts`、`test_diagnostics_api.py`、journey 摘要断言 | 无 Authorization/sk-/`/Users/` |
| Apache 文档门禁 | `scripts/check-open-source-docs.sh` | verify-all 第 0 步通过 |
| 无 App / 无 Release | verify-all 第 11 步 SKIPPED；未运行 `tauri dev` / `build:tauri` / `tauri build` | 本机候选 |

## 验证命令（已执行）

```bash
cd app && npm test -- src/features/onboarding/__tests__/ReadinessCenter.test.tsx
cd app && npm run test:e2e -- e2e/accessibility.spec.ts e2e/onboarding.spec.ts e2e/product-foundation-journey.spec.ts
cd app && npm run test:e2e -- e2e/local-workflow.spec.ts
bash scripts/check-open-source-docs.sh
bash scripts/verify-all.sh --skip-tauri-build
```

未执行（本计划禁止）：`npm run tauri`、`npm run build:tauri`、`tauri build`、启动或安装 `.app`、GitHub Release。

## 未在本计划验证

- VoiceOver / 真实 updater 下载安装（菜单点击已由 Rust emit + JS `bindNativeUpdateMenu` 单测覆盖）
- Keychain-on-device
- 真实 OpenAI / 真实 GitHub Release 安装端点
- 签名、公证、推送、GitHub Release、用户安装验收

## 风险

- 检查器五标签共用一份 `TaskDraft`；已删除独立 `TaskEditor`。
- 卡片清晰度以 CSS 无自身 transform 为门禁；像素级 2x 截图依赖 Playwright 栈。
- 独立审核（完成层级 3）尚未进行；本文件只证明层级 1–2（已实现 + 本地集成候选）。
