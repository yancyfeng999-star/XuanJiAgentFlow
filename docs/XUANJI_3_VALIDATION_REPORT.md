# 璇玑 3.0 终验报告

日期：2026-07-29

## 结论

仓库内 3.0 完成定义通过。璇玑已形成可验证的完整链路：

`项目 → Planner → DAG 编辑 → 审核冻结 → 双节点调度 → 依赖产物上传与哈希校验 → 执行日志 → 最终产物`

## 自动化证据

- Backend：145 passed
- Node Agent：20 passed
- Frontend：54 passed
- Playwright：8 passed
- Rust：13 passed
- Python compile、frontend lint/build、Cargo check/release build：通过
- `npm audit --omit=dev`：0 vulnerabilities
- 真实 Node Agent ASGI + fake Hermes：唯一上游标记进入下游 Prompt 与产物

统一命令（最终版本标识修正后再次通过）：

```bash
bash scripts/verify-all.sh --skip-tauri-build
```

## Computer Use 桌面终验

- 应用：本轮最新源码构建的 macOS 候选 `.app`
- 项目：`3.0终验-成都夜间文旅-20260729`
- 话题：`调研成都夜间文旅消费趋势，并生成包含机会、风险和行动建议的可验证简报`
- 唯一标记：`CU-3.0-MARKER-20260729`
- 工作流：Research、Analyze 并行，Write 汇总二者
- 节点：node-1 与 node-2 均在线；界面完成一次重新诊断
- 策略编辑：Research 超时 120 秒、最大尝试 2、预期产出 `research.md | text/markdown`
- 运行：`run-b83c935eb8dd`
- 结果：3 个任务 success，总进度 100%
- 调度：Research/Write → node-1；Analyze → node-2
- 最终产物 SHA-256：`2c73a0cebe744472878c39a81150b2c735ecd3bf25101df5c0d168dbcf96432a`
- 内容复核：Write 产物同时包含 Analyze 与 Research 内容，并保留唯一标记

本次 Computer Use 使用本地确定性双节点栈，不使用真实账号密钥。它证明候选桌面 UI 与 Coordinator 的同一条完整 run；真实 Node Agent/Hermes 数据传递由独立强集成测试证明。

## 最终桌面产物

- App：`release/xuanji-3.0-cn-errors-20260729/璇玑.app`
- DMG：`release/xuanji-3.0-cn-errors-20260729/璇玑_0.3.0_aarch64.dmg`
- DMG SHA-256：`b217cbfe5edc11f3d57bbf32924f55795686d694e5f12e551c48a8c89d9fedcc`
- Sidecar SHA-256：`05418bef90cf59bdccc0597885e451d0bbf9e8c9305a8d0fc0fa57ea52b26afe`
- `codesign --verify --deep --strict`：通过
- Computer Use 最终启动：侧栏显示 `XUANJI 3.0`
- Sidecar 健康响应：`{"status":"ok","version":"3.0.0"}`
- App 退出后对应 Sidecar 端口停止响应，生命周期回收通过

## 外部边界

以下项目没有被伪装成仓库内完成：

- 真实 DeepSeek/MiMo Planner 账号与配额
- 真实 Hermes 服务版本兼容与长时间压力
- 全新 Ubuntu/Debian 服务器的一键部署
- Apple Developer ID 签名、公证与 Staple
