# 用户指南（已验证能力）

面向本地开发者与首发 macOS 内测用户。仅描述当前测试验证过的路径。

## 前提

- macOS（首发平台）
- Python 3.11+
- Node.js 20+ / npm
- Rust / Cargo（Tauri）
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

### 4. Tauri 开发壳

```bash
cd app
npm run tauri dev
```

壳负责启动并监督 sidecar、健康检查通过后再加载工作区。协调器地址由应用内部管理，不在设置页显示；进程退出或连续健康检查失败时会自动重启并重新连接。

## 工作流（UI）

1. **创建项目**：左侧「新项目」输入名称（可选本地目录）。
2. **规划**：在画布输入目标 →「生成规划」。Planner 需在「设置」配置 base_url / model / API Key。
   - E2E / 测试栈会注入 MockPlanner，无需真实 Key。
3. **编辑**：点击任务节点，修改标题、描述、Prompt、调度模式、节点/能力约束、超时、重试和预期产出，保存。拖动画布节点时位置会持久化。审核后全部冻结。
4. **审核**：「审核工作流」→ 状态变为已审核，编辑禁用。
5. **节点**：在「Hermes 节点」登记本机/远程 API 地址与 Token（Token 只写不回读）。
6. **执行**：「执行全部」。观察顶部进度、任务状态、WebSocket「实时已连接」。
7. **控制**：暂停 / 恢复 / 取消 / 重试 / 跳过（按运行态启用）。
8. **产物**：检查器中的产物列表可下载；文件落在项目 `root_path` 下。

## 从 DMG 安装（未签名）

1. 打开 `璇玑_0.3.0_aarch64.dmg`
2. 将「璇玑.app」拖到 `Applications`
3. 首次打开若被拦截：系统设置 → 隐私与安全性 → 仍要打开
4. 启动后：
   - Coordinator 随应用自动启动、健康检查和故障恢复，不需要填写本机服务地址
   - 在「设置」填写 Planner Base URL / 模型 / API Key
   - 在「Hermes 节点」填写节点地址、Token；远程节点再填 SSH 主机、用户、私钥路径
5. **不需要**在安装前把服务器写进安装包；全部由界面保存到本地配置。

## 安全

- Planner Key 与 Node Token 写入应用数据目录的 `credentials.json`，文件权限为 `0600`，API 只返回是否已配置，不回传密钥。该文件未加密，请仅在可信的本机账户中使用。
- 桌面壳每次启动生成随机会话 token；除健康检查外，本地 HTTP、WebSocket 和产物下载均需该 token。
- SSH 私钥**只存路径**，不复制进应用。
- 远程 Node 经 SSH 隧道访问回环端口；不使用 `StrictHostKeyChecking=no`。

## 验证

```bash
bash scripts/verify-all.sh
```

E2E 覆盖规划→编辑→审核→Fake 多节点执行→产物，以及取消 / 控制面 / 离线节点 / WS 回放；真实 Node Agent 集成测试覆盖 Hermes 轮询、阶段输入校验和下游依赖传递。

## 未包含（外部验收）

- Apple 代码签名 / 公证 / Staple
- App Store 分发
- 真实云端 Planner / Hermes 账号的在线联调（账号与配额由你方提供）
- Windows / Linux 桌面首发
