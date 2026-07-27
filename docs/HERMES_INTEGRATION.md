# Hermes 集成决策记录

> 状态：已核实

## 核心结论

璇玑2.0应把Hermes节点集成为：**SSH运维面 + Hermes官方API Server执行面**。

## 已核实的官方接口

本机Hermes v0.19.0（2026-07-20）已核实的接口：

### 推荐：API Server的异步Runs API

| 能力 | 官方接口 | 说明 |
|------|----------|------|
| 能力发现 | `GET /v1/capabilities` | 公布run/status/events/stop能力 |
| 创建异步任务 | `POST /v1/runs` | HTTP 202，立即返回run_id |
| 查询状态与结果 | `GET /v1/runs/{run_id}` | 含最终output文本 |
| 实时事件 | `GET /v1/runs/{run_id}/events` | SSE流 |
| 取消/停止 | `POST /v1/runs/{run_id}/stop` | 协作式停止 |

### 启用方式

```bash
hermes config set api_server.enabled true
hermes config set api_server.host 127.0.0.1
hermes config set api_server.port 8642
```

认证：Bearer token，通过 `hermes config set api_server.api_key` 或 `.env` 中 `HERMES_API_KEY`。

### 已核实的限制

- Run状态TTL：3600秒（进程内存）
- Run状态为进程内存，重启后丢失
- 停止是协作式，不是强制kill
- 没有通用artifact下载接口
- 需要外部收集文件产出

## 2.0集成架构

```text
璇玑 Coordinator
    │
    ├── SSH：安装、升级、配置、启停、诊断
    │
    └── HTTPS API（日常执行）：
        POST /v1/runs          → 创建任务
        GET  /v1/runs/{id}     → 轮询状态
        GET  /v1/runs/{id}/events → SSE实时事件
        POST /v1/runs/{id}/stop   → 取消任务
```

## Node Agent职责

Node Agent封装每台机器的Hermes交互：

1. 接收璇玑调度请求
2. 调用本地Hermes API Server的 `/v1/runs`
3. 通过SSE收集实时事件
4. 等待完成后收集文件产出（Hermes不提供artifact下载）
5. 生成SHA-256 manifest
6. 上报状态和产出给Coordinator

## 安全

- SSH私钥只保存路径
- Node API使用token认证
- 默认不暴露公网
- 每个任务工作目录限制在Node Agent根目录内
