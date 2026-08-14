# 排障手册

## Coordinator 无法启动

**症状：** UI 显示「Coordinator 未能就绪」或「等待 Coordinator 就绪超时」。

桌面壳会每 2 秒检查一次 Coordinator；进程退出会自动拉起，连续 3 次健康检查失败会重启。下列检查仅用于自动恢复仍失败的情况：

检查：

1. 端口占用：换 `--port` 或确认 sidecar 打印的 `XUANJI_PORT=…`。
2. 依赖：`.venv/bin/python -m xuanji --help` 是否可运行；缺少 uvicorn 时安装 `uvicorn[standard]`。
3. data-dir 权限：路径需可写（SQLite、`credentials.json`、projects）。
4. Tauri sidecar：`app/src-tauri/binaries/xuanji-coordinator*` 是否可执行。  
   开发包装脚本需能找到仓库 `.venv` 或 `XUANJI_PYTHON`。

## 规划失败

| 错误码 | 含义 | 处理 |
|---|---|---|
| `planner_not_configured` | 未配置思考模型 | 思考模型 → 保存接口地址/model/key |
| `planner_credentials_missing` | 未配置 API Key | 在设置中重新填写并保存 API Key |
| `planner_invalid_output` | 模型输出无法校验 | 检查模型；系统最多自动修复一次 |

E2E MockPlanner 仅在 `scripts/e2e_stack.py` 中注入，生产路径不会静默成功。

## 中文错误规范

- 界面、Coordinator API 与 Node Agent API 的用户可读错误统一使用中文。
- `planner_not_configured` 等英文标识是稳定错误码，仅用于日志、测试和技术排障，不作为界面提示。
- 上游思考模型、Hermes、SSH 或操作系统返回英文异常时，展示层会替换为对应的中文安全提示，避免泄露凭据或内部诊断文本。
- 未识别的错误统一显示「操作失败（错误码：…）」；排障时请同时记录错误码。

## 审核 / 编辑

- `workflow_frozen` (409)：已审核不可改，需重新规划新版本。
- `workflow_invalid` (422)：环依赖等；错误详情不回显敏感 prompt。

## 执行卡住或失败

1. **无在线节点：** 节点列表 status 非 online，或 Token 未配置。
2. **离线 / 连不上：** 调度会持久化为 `blocked` / `failed`，**不会**冒充 success。
3. **取消中：** `cancelling` 需等待远端确认；恢复逻辑会重发 cancel。
4. **产物哈希失败：** Fake `BAD_HASH` 与真实校验路径均会失败，不会忽略。

## WebSocket 不更新

- 确认 Origin 为 `localhost` / `127.0.0.1` / `tauri://localhost`。
- 重连时带 `last_event_id`；事件 `event_id` 严格递增（见 E2E / API 测试）。
- UI 指示：`实时已连接` / `实时重连中`。

## SSH / 隧道

- 报错含 host key / fingerprint：需人工确认，禁止改成 `StrictHostKeyChecking=no`。
- `ExitOnForwardFailure=yes`：远端端口未监听时建立失败属预期。
- 应用退出应清理隧道；若 Coordinator 崩溃，检查残留 `ssh -N -L …` 进程。

## E2E / verify-all

```bash
# 明确跳过（会在日志中显示 SKIPPED，不是假通过）
bash scripts/verify-all.sh --skip-e2e
bash scripts/verify-all.sh --skip-tauri-build
```

- Playwright 配置缺失会 **非零退出**（除非 `--skip-e2e`）。
- 端口冲突：设置 `E2E_COORDINATOR_PORT` / `E2E_VITE_PORT`。
- Chromium：首次 `npx playwright install chromium`。

## Tauri / .app 构建（发布负责人专用）

普通开发、测试和 PR 验证不要执行本节命令；它们会在 macOS 中注册 `.app`，造成应用菜单重复条目。浏览器验证请使用 `npm run dev`、`npm test` 和 `npm run build -- --outDir /tmp/xuanji-web-dist`。

隔离发布环境中的历史流程如下，仅供明确授权的发布负责人参考：

1. 前端：`cd app && npm run build`
2. Sidecar：PyInstaller 或开发包装脚本
3. `cd app && npm run build:tauri`

签名失败、钥匙串无证书时：退出发布包流程，回到默认的浏览器/Rust 库验证；`--skip-tauri-build` 只保留非 App 门禁，不会生成桌面包。签名/公证仍属外部验收。

## 旧代码残留

若仍看到 `sessionStorage` 业务流、`backend/main.py` 或 `lib/api.ts`，说明未更新到清理提交。权威 API 客户端为 `app/src/lib/client.ts`，Coordinator 为 `backend/src/xuanji`。
