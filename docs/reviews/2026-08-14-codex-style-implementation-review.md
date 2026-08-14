# Codex-style product foundation · implementation review

> 日期：2026-08-14  
> 状态：本地实现/测试候选。**不是**已发布、已安装或独立审核通过。

## 需求对照

| 需求 | 证据 |
| --- | --- |
| Codex 密度/字阶 | `visual-tokens.test.ts`；无 Songti / 9–10px |
| 五标签检查器 | `Inspector.test.tsx` + `taskDraft.test.ts` |
| 思考模型 | API/迁移/Responses 测试 + ThinkingModels UI |
| 更新分步 | `updater.test.ts`；启动不再调用静默安装 |
| 诊断脱敏 | `supportSummary.test.ts` + `test_diagnostics_api.py` |
| 无 App | 未运行 `tauri dev` / `build:tauri` / `tauri build` |

## 未在本计划验证

- VoiceOver / 真实 updater 安装 / Keychain-on-device
- 真实 OpenAI / GitHub Release 安装端点
- 签名、公证、GitHub Release

## 风险

- 检查器执行页仍复用 TaskEditor 本地表单；概览/提示词页走 TaskDraft。
- 卡片清晰度以 CSS 无自身 transform 为门禁；像素级 2x 截图依赖 Playwright 栈。
