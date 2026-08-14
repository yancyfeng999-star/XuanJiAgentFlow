# 璇玑前端

`app/` 是 XuanJiAgentFlow 的 React + TypeScript + Vite 前端，以及 Tauri 集成源码。普通贡献者应优先使用浏览器模式；桌面 `.app` 构建属于隔离的发布流程。

## 浏览器开发

```bash
npm ci
VITE_COORDINATOR_URL=http://127.0.0.1:8000 npm run dev
```

然后打开 Vite 输出的本地地址。Coordinator 的 API 与 WebSocket 默认使用回环地址；真实 Planner Key、Node Token 和 SSH 私钥不应写入仓库。

## 浏览器验证

```bash
npm test
npm run lint
npm run build -- --outDir /tmp/xuanji-web-dist
```

`--outDir /tmp/...` 用于把构建结果放到仓库外，避免污染工作区。

## Tauri 边界

不要在普通开发、测试或 Pull Request 验证中运行以下命令：

```text
npm run tauri dev
npm run build:tauri
```

它们会生成或启动 macOS `.app`，可能在 LaunchServices / 应用菜单中留下重复条目。只有发布负责人在隔离环境中，经过版本、签名、公证和安装验收后，才可以执行桌面包流程。

更多贡献、许可证、安全和发布边界见仓库根目录的 [`CONTRIBUTING.md`](../CONTRIBUTING.md)、[`LICENSE`](../LICENSE)、[`SECURITY.md`](../SECURITY.md) 与 [`docs/OPEN_SOURCE.md`](../docs/OPEN_SOURCE.md)。
