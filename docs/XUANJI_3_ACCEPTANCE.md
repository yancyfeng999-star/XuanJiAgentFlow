# 璇玑 3.0 模块验收矩阵

更新日期：2026-07-29

状态定义：

- `PASS`：当前实现和对应证据均满足 3.0 完成定义。
- `PARTIAL`：入口存在，但真实闭环、错误处理或证据不完整。
- `FAIL`：界面或文档有承诺，但实现链路不成立。
- `BLOCKED`：代码已就绪，仍需要用户控制的凭据、服务器或外部服务。

| 模块 | 主要代码 | 当前状态 | 当前证据 | 3.0 门禁 |
|---|---|---:|---|---|
| 项目与目录 | `api/projects.py`, `artifacts/manager.py` | PASS | 路径安全回归；Computer Use 创建并选中项目 | 保持回归 |
| Planner | `planner/*` | PASS | 完整 JSON Schema、一次带错误反馈的修复请求、MockTransport provider 测试 | 真实账号联调属于外部验收 |
| DAG 与审核 | `domain/models.py`, `api/workflows.py` | PASS | 成环/缺依赖/版本测试；Computer Use 编辑后审核并冻结 | 保持回归 |
| 画布位置 | `WorkflowCanvas.tsx` | PASS | `onNodeDragStop` 持久化；前端与 E2E 回归 | 保持回归 |
| 任务策略编辑 | `TaskEditor.tsx` | PASS | UI 可编辑调度、能力、超时、重试、产出；Computer Use 保存后审核冻结 | 保持回归 |
| 节点 CRUD/凭据 | `api/nodes.py`, `credentials/*` | PASS | 凭据不回显；保存自动诊断；Computer Use 显示 2 节点在线 | 保持回归 |
| 节点诊断 | `api/nodes.py` | PASS | status/capabilities/last_seen 持久化；Computer Use 重新诊断 | 保持回归 |
| 节点部署 | `provisioning/ssh.py` | BLOCKED | Node Agent+systemd+8765 打包部署逻辑与单测通过 | 真实 Ubuntu/Debian 主机验收 |
| 调度匹配 | `scheduler/*` | PASS | 能力/并发/策略测试；同一 UI run 分配到 node-1 与 node-2 | 保持回归 |
| 依赖输入 | `execution/manager.py`, `nodes/client.py` | PASS | SHA-256 校验、上传、显式启动；唯一标记进入最终 Write 产物 | 保持强集成测试 |
| 节点代理执行 | `node-agent/*` | PASS | 真实 Node Agent ASGI + fake Hermes 完整集成测试 | 真实 Hermes 版本兼容属于外部验收 |
| 产出契约 | `node-agent/executor.py` | PASS | strict/discover、声明路径映射、唯一/默认输出测试 | 保持回归 |
| 实时日志 | `logs.jsonl`, Runs UI | PASS | 生命周期日志同步；Computer Use 看到终态日志和“加载更多日志” | Hermes 工具级事件丰富度取决于真实 Hermes |
| 超时/退避 | `execution/manager.py` | PASS | 自动超时、取消、延迟重试集成测试 | 保持回归 |
| 暂停/恢复 | `execution/manager.py` | PASS | 暂停阻止新调度，运行中任务允许归并；恢复测试通过 | 保持回归 |
| 取消 | `execution/manager.py`, Agent | PASS | FakeNode 与真实 Node Agent 取消/终态测试 | 真实 Hermes 取消兼容属于外部验收 |
| 事件流 | `api/events.py`, Runs UI | PASS | WS 会话鉴权、游标、重连测试；Computer Use 显示“实时已连接” | 保持回归 |
| 本地 API 安全 | `api/app.py`, Tauri | PASS | 随机桌面会话 token 覆盖 HTTP、WS、产物下载 | 保持回归 |
| 前端依赖安全 | `app/package.json` | PASS | `npm audit --omit=dev`：0 vulnerabilities | 门禁持续执行 |
| Sidecar 生命周期 | `app/src-tauri/*` | PASS | Rust 13 tests、release build、候选版实际启动 | 保持回归 |
| 自动化 E2E | `app/e2e`, `scripts/e2e_stack.py` | PASS | Playwright 8 passed；断言 UI 创建的同一个 run；真实 Agent+fake Hermes 强集成 | 保持回归 |
| 桌面打包 | `scripts/build-sidecar.sh`, Tauri | PASS | 最新源码构建 `.app`/DMG；候选 `.app` deep codesign verify 通过 | Apple Developer ID、公证仍属外部发布 |
| 用户文档 | `docs/*` | PASS | 3.0 状态、使用、部署与终验报告已同步 | 随实现持续更新 |
| Computer Use 终验 | 3.0 候选 `.app` | PASS | 话题 `CU-3.0-MARKER-20260729` 完成；3 任务、2 节点、100%、产物哈希和内容复核 | 真实账号/服务器另行验收 |

## 当前结论

3.0 的仓库内完成定义已满足：现有功能形成“规划→编辑→审核→双节点调度→依赖产物传递→日志→产物”的可信闭环。仍未宣称完成的部分只有需要外部资源的真实 Planner/Hermes 账号、Ubuntu/Debian 主机部署，以及 Apple Developer ID 签名/公证。
