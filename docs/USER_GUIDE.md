# 用户指南（已验证能力）

面向本地开发者与首发 macOS 内测用户。仅描述当前测试验证过的路径。

## 前提

- macOS（首发平台）
- Python 3.11+
- Node.js 20+ / npm
- Rust / Cargo（仅运行库测试时需要）
- （可选）本机或远程 Hermes 节点

## 快速开始（开发）

### 1. 依赖

```bash
python3 -m venv .venv
.venv/bin/pip install -e "backend[test]" -e "node-agent[test]" "uvicorn[standard]"
cd app && npm ci
```

### 2. 仅 API（无桌面壳）

```bash
.venv/bin/python -m xuanji --port 8000 --data-dir ~/.xuanji-dev
```

健康检查：`GET http://127.0.0.1:8000/api/status` → `{"status":"ok","version":"3.0.0"}`。

### 3. 前端（浏览器模式）

```bash
cd app
VITE_COORDINATOR_URL=http://127.0.0.1:8000 npm run dev
```

浏览器下 runtime 会把 Coordinator 默认指向 `VITE_COORDINATOR_URL` 或 `http://127.0.0.1:8000`。

### 4. 桌面壳边界

普通开发不启动 Tauri 壳，也不运行 `npm run tauri dev` 或 `npm run build:tauri`。这些命令会生成/注册 macOS `.app`，可能让系统应用菜单出现多个璇玑副本；桌面包仅由发布负责人在隔离环境中处理。浏览器模式已经覆盖普通开发、测试和 Pull Request 验证。

## 工作流（UI）

1. **创建项目**：左侧展开「新项目」，输入名称（可选本地目录）。已选项目可重命名或删除（删除需输入项目名确认；只删应用内记录，不动磁盘目录）。
2. **就绪检查**：画布上方的「执行就绪检查」列出项目目录、思考模型、工作流审核、任务匹配、执行节点、凭据六项状态；每个阻塞项有直达修复入口。
3. **规划**：在画布输入目标 →「生成规划」。思考模型需在「思考模型」页配置接口地址 / 模型 / API Key。
   - E2E / 测试栈会注入 MockPlanner，无需真实 Key。
4. **编辑**：点击任务节点，修改标题、描述、Prompt、调度模式、节点/能力约束、超时、重试、预期产出与交付合同（写入范围、完成定义、验证步骤、人工检查点），保存。拖动画布节点时位置会持久化。审核后全部冻结。
5. **审核**：「审核工作流」打开审核工作区：任务数、拓扑顺序、依赖、写入/产物、验证步骤、节点匹配与警告；确认的是一份不可变快照（SHA-256）。审核期间的修改会得到「快照已过期」错误。审核后再修改请用「创建修订」，生成新版本草稿，不篡改已审核版本。
6. **节点**：「执行节点」进入接入向导：先显式选择本机/远程；本机可一键发现 Hermes；远程节点支持选择私钥文件、检查并确认主机指纹（写入应用级 known_hosts）。「诊断」按 DNS → TCP → SSH → Node Agent → Hermes 分层定位失败。
7. **执行**：「执行全部」只在就绪检查通过时可用；不可用时按钮旁直接显示首个阻塞原因。
8. **观察与恢复**：运行状态与后端一致（等待调度/运行中/已暂停/取消中/已取消/已阻塞/失败/完成（含警告））。切换项目或重启后自动恢复最近未结束的 Run；检查器底部可打开运行历史。重试/跳过按钮由服务端 `allowed_actions` 决定是否可用。
9. **产物**：检查器中的产物列表可下载（浏览器内 Blob 下载，会话令牌不出现在 URL）；服务端在响应前复核产物哈希。
10. **日志**：任务日志支持搜索筛选与脱敏导出（令牌、密钥、哈希、home 路径会被遮蔽）。

## 从 DMG 安装（未签名）

1. 从 [`release/README.md`](../release/README.md) 或 GitHub Release 选择当前安装包
2. 将「璇玑.app」拖到 `Applications`
3. 首次打开若被拦截：系统设置 → 隐私与安全性 → 仍要打开
4. 启动后：
   - Coordinator 随应用自动启动、健康检查和故障恢复，不需要填写本机服务地址
   - 启动失败页提供：重试启动、重启 Coordinator、复制脱敏诊断、退出
   - 在「思考模型」填写接口地址 / 模型 / API Key
   - 在「执行节点」用向导添加本机或远程节点
5. **不需要**在安装前把服务器写进安装包；全部由界面保存到本地配置。

## 安全

- 桌面壳（sidecar 模式）下思考模型 Key 与 Node Token 存入 macOS Keychain；从旧 `credentials.json` 迁移时先验证读回再删除旧文件，失败保留旧数据。开发模式默认使用 `credentials.json`（权限 `0600`），API 只返回是否已配置，不回传密钥。
- 桌面壳每次启动生成随机会话 token；本地 HTTP API 只接受 `X-Xuanji-Session` header；WebSocket 使用 30 秒、单次、绑定 Run 的一次性票据；产物下载经 header 认证 + Blob。
- Node Agent 空 token 拒绝启动；所有 `/v1/*` 端点需有效 Bearer token。
- SSH 私钥**只存路径**，不复制进应用；主机密钥经「检查指纹 → 确认」两阶段写入应用级 known_hosts，确认时会重新扫描以防竞态替换。
- 远程 Node 经 SSH 隧道访问回环端口；不使用 `StrictHostKeyChecking=no`。

## 验证

```bash
bash scripts/verify-all.sh --skip-tauri-build
```

E2E 覆盖规划→编辑→审核→Fake 多节点执行→产物，以及取消 / 控制面 / 离线节点 / WS 回放；真实 Node Agent 集成测试覆盖 Hermes 轮询、阶段输入校验和下游依赖传递。

## 未包含（外部验收）

- Apple 代码签名 / 公证 / Staple
- App Store 分发
- 真实云端思考模型 / Hermes 账号的在线联调（账号与配额由你方提供）
- Windows / Linux 桌面首发
