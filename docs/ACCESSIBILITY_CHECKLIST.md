# 可访问性检查清单 · ACCESSIBILITY_CHECKLIST

> 建立：2026-08-12（候选分支 `candidate/ux-integration`）
> 范围：璇玑桌面工作台主旅程（项目 → 规划 → 审核 → 执行 → 产物）。

## 自动化覆盖（Playwright `e2e/accessibility.spec.ts`）

- [x] 审核对话框焦点陷阱、Escape 关闭、关闭后焦点回到合理位置
- [x] 主旅程所有控件有可访问名称（aria-label / label / 文本）
- [x] 状态不只靠颜色传达（状态文本始终存在）
- [x] `prefers-reduced-motion: reduce` 下过渡时长收敛到 0.01ms

## 样式门禁

- [x] 关键正文、按钮、输入标签不使用 9–11 px（`rg 'font-size:\s*(9|10|11)px' app/src` 命中为 0）
- [x] 不使用 `transition: all`；进度条不通过 width 过渡制造布局动画
- [x] 状态色均有文字/图标冗余（状态徽章带文本，就绪中心带图标+文字）

## 2026-08-14 产品基础

- [x] 新增 `e2e/product-foundation-a11y.spec.ts` 键盘到达思考模型
- [x] 新增 `e2e/product-foundation-responsive.spec.ts` 断点可见性
- [ ] VoiceOver / 原生菜单 / 真实更新安装仍需真实 App（release-owner）

## 需人工执行的项（审核阶段 D4）

| 项 | 方法 | 记录 |
| --- | --- | --- |
| 仅键盘完成创建→配置→审核→运行→产物 | 键盘走查 | `not_verified` |
| VoiceOver 主路径 | macOS VoiceOver 录屏 | `not_verified` |
| 200% 缩放下最小窗口操作 | 系统缩放 + 900px 宽窗口 | `not_verified` |
| 中/英 × 亮/暗四组合目视检查 | 手动切换 | `not_verified` |
| 朱砂色/正文/弱化文字对比度 | 对比度工具 | `not_verified` |

人工项必须在独立审核时逐条记录证据，不得由自动化结果推断。
