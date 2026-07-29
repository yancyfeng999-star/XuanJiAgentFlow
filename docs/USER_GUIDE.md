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

健康检查：`GET http://127.0.0.1:8000/api/status` → `{"status":"ok","version":"2.0.0"}`。

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

壳负责监督 sidecar、健康检查通过后再加载工作区。

## 工作流（UI）

1. **创建项目**：左侧「新项目」输入名称（可选本地目录）。
2. **规划**：在画布输入目标 →「生成规划」。Planner 需在「设置」配置 base_url / model / API Key，并先初始化主密码解锁保险库。  
   - E2E / 测试栈会注入 MockPlanner，无需真实 Key。
3. **编辑**：点击任务节点，修改标题 / 描述 / Prompt，保存。审核后冻结。
4. **审核**：「审核工作流」→ 状态变为已审核，编辑禁用。
5. **节点**：在「Hermes 节点」登记本机/远程 API 地址与 Token（Token 只写不回读）。
6. **执行**：「执行全部」。观察顶部进度、任务状态、WebSocket「实时已连接」。
7. **控制**：暂停 / 恢复 / 取消 / 重试 / 跳过（按运行态启用）。
8. **产物**：检查器中的产物列表可下载；文件落在项目 `root_path` 下。

## 安全

- 主密码派生密钥，凭据写入本地 vault（非明文）。
- SSH 私钥**只存路径**，不复制进应用。
- 远程 Node 经 SSH 隧道访问回环端口；不使用 `StrictHostKeyChecking=no`。

## 验证

```bash
bash scripts/verify-all.sh
```

E2E 覆盖规划→编辑→审核→Fake 多节点执行→产物，以及取消 / 控制面 / 离线节点 / WS 回放。

## 未包含（外部验收）

- App Store / 公证分发
- 真实云端 Planner / Hermes 账号配置向导以外的运维
- Windows / Linux 桌面首发
