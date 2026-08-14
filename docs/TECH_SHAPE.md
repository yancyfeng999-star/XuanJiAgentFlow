# 技术形态 · 璇玑 App（读者向摘要）

实现与 API 细节以本仓库源码为准；完成度见 [CURRENT_STATE.md](CURRENT_STATE.md)。

---

## 分层

| 层 | 技术 | 职责 |
|----|------|------|
| 桌面壳 | **Tauri 2** | 窗口、sidecar 监督、健康门闩后再进工作区 |
| UI | **React 19** | **单一无限画布**（`AppShell`）；旧多页 / panels 已删 |
| 中枢 | **Python FastAPI Coordinator** | 项目、工作流、规划、调度、执行、恢复、节点、产物 |
| 节点 | **Node Agent** | 阶段输入、哈希与产出契约；对接 Hermes |
| 执行引擎 | **Hermes** `/v1/runs` | 真实跑任务 |
| 元数据 | **SQLite** | 项目 / 工作流 / run |
| 真文件 | **项目目录** | 产物落盘 |
| 门禁 | `scripts/verify-all.sh`、Playwright E2E、pytest、cargo test | 防假成功 |

## 运行时关系

```text
┌─────────────────────────────────────┐
│  璇玑.app (Tauri)                    │
│    └── WebView UI (React 画布)       │
│    └── sidecar: xuanji-coordinator   │
│              │ HTTP + WS             │
│              ▼                       │
│         Coordinator (FastAPI)        │
│              │                       │
│     ┌────────┴────────┐              │
│     ▼                 ▼              │
│  本机 Node        SSH 隧道 → 远程 Node │
│     └────────┬────────┘              │
│              ▼                       │
│         Hermes /v1/runs              │
└─────────────────────────────────────┘
         产物 → 项目 root_path
```

## 关键钉死点

1. **规划与执行分离** — Planner 只出 DAG；执行走 Node + Hermes。  
2. **审核冻结** — `reviewed` 后禁止静默改图。  
3. **远程不裸奔** — Node 绑 `127.0.0.1`；SSH 隧道；`StrictHostKeyChecking=yes`；私钥只存路径。  
4. **凭据本地化** — Key/Token → `credentials.json`（`0600`）；API 不回传正文。  
5. **成功 = 产物真实存在** — 哈希校验；禁止 stub 冒充 success。  
6. **3.0 范围纪律** — 真执行闭环；不借机扩平台全家桶。

## 版本（读者向）

| 项 | 值 |
|----|-----|
| 产品 / 包版本 | 0.3.3（`璇玑_0.3.3_aarch64.dmg`） |
| Coordinator API 版本 | 3.0.0（`GET /api/status`，见 `backend/src/xuanji/api/app.py`） |
| 数据 schema 版本 | 3（`backend/src/xuanji/storage/migrations.py` 的 `CURRENT_SCHEMA_VERSION`） |
| Sidecar | PyInstaller `xuanji-coordinator`（Mach-O arm64）随 App 打包 |

OpenAPI / schema / 打包逐步命令 → `HERMES_INTEGRATION.md`、`NODE_DEPLOYMENT.md`、`CURRENT_STATE.md`、根 `README.md`。
