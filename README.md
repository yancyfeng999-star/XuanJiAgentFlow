# 璇玑 AgentFlow

本地运行的分布式 AI 任务控制台。

> 当前处于 2.0 重构阶段。旧版代码是技术原型，不代表生产完成度。

## 已确认架构

- DeepSeek / MiMo 独立规划任务 DAG
- 单一无限画布负责审核、编排、执行与监控
- 本机和多台远程 Hermes 作为执行节点
- SSH 负责安装、升级、启停与诊断
- 受认证的 Hermes Node API 负责日常执行
- SQLite 保存元数据，项目目录保存真实产出文件

## 文档

- `08-璇玑2.0重构设计规范.md` — 当前产品与架构规范
- `09-璇玑2.0重构实施计划.md` — 重构执行计划
- `07-项目进展报告.md` — 旧原型历史报告，完成度声明已失效

## 当前原型启动

### 后端

```bash
cd backend
.venv/bin/python main.py
```

### Tauri前端

```bash
cd app
npm install
npm run tauri dev
```

## 安全

- 禁止提交 `backend/.env`
- 禁止提交 SQLite 数据库、Python venv、node_modules、Tauri target
- SSH 私钥只保存路径，不复制进璇玑
- 不得把API密钥写入项目文档或日志
