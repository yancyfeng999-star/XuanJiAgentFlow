# 璇玑 App · XuanJiAgentFlowApp

| | |
|--|--|
| 品牌中文名 | **璇玑** |
| 产品 / 工程英文 | **XuanJiAgentFlowApp**（历史工程名 AgentFlow） |
| 形态 | macOS 本地桌面 App（可安装 DMG） |
| 版本方向 | **3.0**（完成 2.0 承诺的真执行闭环，不扩产品范围） |
| 安装包示例 | 以 [`release/README.md`](release/README.md) 和 GitHub Releases 为准 |
| Slogan | **思考在先，执行在后** |
| 本仓路径 | 当前 Git checkout（不要依赖绝对路径） |

> **一句话**  
> 可安装的本地控制台：画布编排 + 多 Hermes 节点真跑 + 产物回写。

本仓库按开源项目维护：代码与文档采用 [Apache License 2.0](LICENSE)，贡献、安全报告和社区规则见 [`CONTRIBUTING.md`](CONTRIBUTING.md)、[`SECURITY.md`](SECURITY.md) 和 [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)。开源范围、第三方依赖与发布边界见 [`docs/OPEN_SOURCE.md`](docs/OPEN_SOURCE.md)。

本地运行的分布式 AI 任务控制台（macOS 首发）：DeepSeek / MiMo 规划任务 DAG → 单一无限画布审核与编排 → 本机 / 多台 Hermes 节点执行 → SQLite 元数据 + 项目目录真实产物。

## 产品文档

| 文档 | 内容 |
|------|------|
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | **产品介绍（权威）**：是什么 / 给谁 / 怎么操作 / 强弱项 |
| [`docs/PRODUCT_DEFINITION.md`](docs/PRODUCT_DEFINITION.md) | 定位、价值、流程、对标、品牌 |
| [`docs/USER_JOURNEY.md`](docs/USER_JOURNEY.md) | 端到端用户旅程 |
| [`docs/TECH_SHAPE.md`](docs/TECH_SHAPE.md) | 技术形态摘要 |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | 安装与日常操作 |
| [`docs/RELEASE_AND_BOUNDARY.md`](docs/RELEASE_AND_BOUNDARY.md) | 发布现状与未做完边界 |
| [`docs/VS_SKILL.md`](docs/VS_SKILL.md) | 与璇玑 Skill（对话产品）对照 |
| [`docs/NAMING.md`](docs/NAMING.md) | 命名与路径约定 |
| [`01-产品定义.md`](01-产品定义.md) | 产品定义（与 PRODUCT_DEFINITION 对齐） |

开源维护入口：[`docs/OPEN_SOURCE.md`](docs/OPEN_SOURCE.md) · [`CHANGELOG.md`](CHANGELOG.md) · [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`SECURITY.md`](SECURITY.md)

## 工程文档

| 文档 | 内容 |
|------|------|
| [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) | 真实完成度（已验证能力） |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | 开发 / 内测使用指南 |
| [`docs/NODE_DEPLOYMENT.md`](docs/NODE_DEPLOYMENT.md) | 节点部署 |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | 排障 |
| [`docs/HERMES_INTEGRATION.md`](docs/HERMES_INTEGRATION.md) | Hermes `/v1/runs` 集成 |

文案与「已验证能力」冲突时，**以 `docs/CURRENT_STATE.md` 为准**。

## 兄弟产品

| 目录 | 角色 |
|------|------|
| **本仓** `XuanJiAgentFlowApp/` | 桌面 App：源码 + 产品文案 + 构建 |
| `../XuanJiAgentFlowSkill/` | 对话 Skill：规程 + 九器 |

共同逻辑：`目标 → 拆 DAG → 审核放行 → 按依赖调度 → 多节点执行 → 产物汇总`  
App = 图形手脚；Skill = 对话手脚。

## 已验证能力（摘要）

- 本地凭据配置、思考模型校验与一次修复、能力感知调度
- Fake 多节点执行、取消 / 重试 / 恢复、产物哈希下载
- 按任务 SSH 隧道（`StrictHostKeyChecking=yes`）
- Coordinator FastAPI + React 单一画布 + Tauri sidecar 监督
- Playwright E2E 与 `scripts/verify-all.sh` 门禁

详见 [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md)。

## 安装包（已验证的 0.3.3 历史资产）

真实远程服务器不需要预先配进安装包：安装后在界面填写服务器、SSH 用户、私钥路径、Node Token 与思考模型 Key。安装包仅用于已有 Release 验收，不是普通开发步骤。

当前源码版本为 **0.3.5**。未生成或注册新的 macOS `.app`、DMG、PKG 或更新包；用户安装包仍以已发布的 0.3.3 资产为准。

```text
release/xuanji-0.3.3-20260811/璇玑_0.3.3_aarch64.dmg
```

安装：打开 DMG → 拖拽「璇玑.app」到 `Applications`。  
历史包见 `release/README.md`。

仍属外部发布验收：**Apple Developer ID 签名 / 公证 / Staple**。当前临时签名安装时 macOS 可能提示未识别开发者，需在系统设置中允许。

## 开发启动

### Coordinator

```bash
python3 -m venv .venv
.venv/bin/pip install -e "backend[test]" "uvicorn[standard]"
.venv/bin/python -m xuanji --port 8000 --data-dir ~/.xuanji-dev
```

### 前端（浏览器优先，不生成桌面 App）

```bash
cd app
npm ci
VITE_COORDINATOR_URL=http://127.0.0.1:8000 npm run dev   # 浏览器
npm test
npm run build -- --outDir /tmp/xuanji-web-dist
```

普通开发和 Pull Request 验证不要运行 `npm run tauri dev` 或 `npm run build:tauri`；这些命令会注册 macOS `.app`，只允许发布负责人在隔离环境中使用。

## 验证

```bash
bash scripts/verify-all.sh --skip-tauri-build
# 可选：再加 --skip-e2e 跳过浏览器 E2E
```

```bash
cd app && npx playwright install chromium && npm run test:e2e
```

## 安全

- 禁止提交 `.env`、数据库、venv、`node_modules`、Tauri `target`
- SSH 私钥只保存路径；Node Token / 思考模型 Key 写入仅当前用户可读的本地配置，不通过 API 回传
- 不得使用 `StrictHostKeyChecking=no` 绕过主机校验
- 漏洞报告与凭据边界见 [`SECURITY.md`](SECURITY.md)
