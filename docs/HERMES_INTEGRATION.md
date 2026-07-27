# Hermes 集成决策记录

> 状态：等待并行调研最终核实；以下为本机Hermes v0.19.0 CLI实测结论。

## 已核实的官方入口

### 一次性执行

```bash
hermes chat -q "任务内容" -Q --source tool --pass-session-id
```

能力：

- 非交互执行一个完整Hermes任务
- 可指定model、provider、toolsets、skills、max-turns
- 退出码可作为执行结果基础
- stdout包含最终响应和会话信息

限制：

- CLI调用本身没有标准HTTP异步任务ID
- 中间日志是终端流，需要Node Agent捕获和结构化
- 取消需要Node Agent管理子进程并发送终止信号
- 产出文件必须由工作目录和manifest约定管理

### MCP Server

```bash
hermes mcp serve
```

用途是把Hermes作为MCP服务器提供工具，不等于异步任务队列。

### ACP

```bash
hermes acp
```

用于IDE集成，不是远程节点任务API。

### Messaging Gateway

```bash
hermes gateway run
hermes gateway install
```

主要服务Telegram/Discord/Slack等消息平台。不能在未核实前假设它天然提供璇玑所需的任务创建、状态、取消、日志和文件API。

## 2.0决策

第一版实现独立的轻量 `xuanji-node-agent`：

```text
POST   /v1/tasks
GET    /v1/tasks/{id}
POST   /v1/tasks/{id}/cancel
GET    /v1/tasks/{id}/logs
GET    /v1/tasks/{id}/artifacts
GET    /v1/health
GET    /v1/capabilities
```

Node Agent内部：

1. 为任务创建独立工作目录
2. 启动 `hermes chat -q ... -Q --source tool --pass-session-id`
3. 捕获stdout/stderr为JSONL日志
4. 保存PID、状态、退出码、Hermes session ID
5. 扫描约定的artifacts目录并生成manifest
6. 取消时终止真实Hermes子进程
7. 重启后从磁盘manifest恢复任务状态

## 远程部署

SSH用于：

- 检测 `hermes --version`
- 未安装时执行官方安装流程
- 执行 `hermes doctor`
- 上传Node Agent版本包
- 安装systemd/launchd服务
- 更新、重启和读取诊断日志

日常执行使用Node Agent的受认证HTTPS API。

## 安全

- SSH私钥只保存路径
- Node API必须使用token或mTLS
- 默认不暴露公网明文HTTP
- 每个任务工作目录必须限制在Node Agent根目录内
- Prompt和日志不能包含Hermes配置文件或API密钥内容
