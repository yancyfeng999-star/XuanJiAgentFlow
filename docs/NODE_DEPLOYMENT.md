# Node 部署说明

远程自动部署保证范围：**Ubuntu/Debian + systemd**。真实服务器安装属于**外部验收**；本仓库以 FakeNode 协议栈与 provisioning 单元测试验证逻辑。

## 架构约束

- Node API **仅绑定** `127.0.0.1`（不公网暴露）。
- 控制台按任务建立临时 SSH 隧道：  
  `ssh -N -L local:127.0.0.1:remote -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=<app known_hosts>`
- Token 不进入 SSH argv / 日志；仅 HTTP `Authorization: Bearer …`。
- known_hosts 位于 Coordinator `data_dir/ssh/known_hosts`，与系统 `~/.ssh` 隔离。

## 本机节点

1. 安装并启动 Hermes，使其 Node Agent 监听本机回环（见 `docs/HERMES_INTEGRATION.md`）。
2. 在 UI「Hermes 节点」添加：
   - kind：本机（不填 SSH Host）
   - api_url：例如 `http://127.0.0.1:8642`
   - Token：节点共享密钥
3. 诊断接口 `POST /api/nodes/{id}/diagnose` 会使用已保存的节点凭据检查健康。

## 远程节点（Ubuntu/Debian）

### 用户需在 UI 填写

| 字段 | 说明 |
|---|---|
| SSH Host / Port / User | 运维可达地址 |
| SSH Key Path | 本机私钥路径 |
| Node Token | 安装后下发或既有 token |
| hermes_port | 默认常见 8642 |

### 软件执行的 Provision 步骤（逻辑已测）

`POST /api/nodes/{id}/provision` → `ProvisioningService.provision_remote`：

1. SSH 连通性
2. 打包并上传 Node Agent 源码与 Python 运行依赖
3. 安装 `xuanji-node-agent.service`，Node Agent 默认监听远端 `127.0.0.1:8765`
4. Hermes 执行 API 保持监听 `127.0.0.1:8642`
5. 通过 SSH 隧道验证 Node Agent `/health`，并把诊断状态、能力和 `last_seen` 持久化

**注意：** 失败不得 stub 成功；步骤结果以 JSON `steps[]` 返回。

### 安全选项

- `StrictHostKeyChecking=yes`
- 首次未知主机：返回可确认指纹错误（`host_key_unconfirmed`），**不会**自动写入 `=no`
- 应用退出 / run 终态会关闭所属隧道

## 本地伪造节点（开发 / E2E）

```bash
.venv/bin/python scripts/e2e_stack.py --coordinator-port 18080
```

启动 2 个 FakeNode HTTP 服务并注册到 Coordinator，供 Playwright 与手动联调。

## 外部验收清单

- [ ] 全新 Ubuntu LTS 云主机从 UI 一键 provision 成功
- [ ] 重启后 systemd 自启且 diagnose 在线
- [ ] 首次 SSH 指纹用户确认写入 known_hosts 的完整产品流
- [ ] 多任务并发下隧道无泄漏、Token 无落盘明文
