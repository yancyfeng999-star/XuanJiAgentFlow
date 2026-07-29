# 璇玑 AgentFlow 2.0

本地运行的分布式 AI 任务控制台（macOS 首发）。

DeepSeek / MiMo 规划任务 DAG → 单一无限画布审核与编排 → 本机/多台 Hermes 节点执行 → SQLite 元数据 + 项目目录真实产物。

## 已验证能力（摘要）

- 加密凭据库、Planner 校验与一次修复、能力感知调度
- Fake 多节点执行、取消/重试/恢复、产物哈希下载
- 按任务 SSH 隧道（`StrictHostKeyChecking=yes`）
- Coordinator FastAPI + React 单一画布 + Tauri sidecar 监督
- Playwright E2E（web+backend Fake 栈）与 `scripts/verify-all.sh` 门禁

详见 [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) | 真实完成度 |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | 使用指南 |
| [`docs/NODE_DEPLOYMENT.md`](docs/NODE_DEPLOYMENT.md) | 节点部署 |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | 排障 |
| [`docs/HERMES_INTEGRATION.md`](docs/HERMES_INTEGRATION.md) | Hermes `/v1/runs` 集成 |

## 安装包（未签名 DMG）

真实远程服务器不需要预先配进安装包：安装后在界面填写服务器、SSH 用户、私钥路径、Node Token 与 Planner Key。

本机构建并已验证可挂载的 DMG 路径（隔离工作树）：

```text
app/src-tauri/target/release/bundle/dmg/璇玑_0.1.0_aarch64.dmg
```

安装：打开 DMG → 拖拽「璇玑.app」到 `Applications`。

仍属外部发布验收：**Apple 签名 / 公证 / Staple**。未签名安装时 macOS 可能提示来自未识别开发者，需在系统设置中允许。

## 开发启动

### Coordinator

```bash
python3 -m venv .venv
.venv/bin/pip install -e "backend[test]" "uvicorn[standard]"
.venv/bin/python -m xuanji --port 8000 --data-dir ~/.xuanji-dev
```

### 前端 / Tauri

```bash
cd app
npm ci
VITE_COORDINATOR_URL=http://127.0.0.1:8000 npm run dev   # 浏览器
npm run tauri dev                                         # 桌面壳
```

## 验证

```bash
bash scripts/verify-all.sh
# 可选：--skip-e2e  --skip-tauri-build
```

E2E：

```bash
cd app && npx playwright install chromium && npm run test:e2e
```

## 安全

- 禁止提交 `.env`、数据库、venv、`node_modules`、Tauri `target`
- SSH 私钥只保存路径；Node Token / Planner Key 只进加密 vault
- 不得使用 `StrictHostKeyChecking=no` 绕过主机校验
