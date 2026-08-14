# 贡献指南

感谢你为 XuanJiAgentFlow（璇玑）提交改进。本仓库是公开源码项目，贡献应当可复现、可审查，并且不能把本地凭据或构建缓存带进 Git。

## 开发边界

普通开发和 Pull Request 验证默认使用浏览器模式、单元测试和外置临时输出目录。不要在本机运行会注册 macOS `.app` 的命令：

- `npm run tauri dev`
- `npm run build:tauri`
- `scripts/verify-all.sh` 的 Tauri 构建步骤

桌面包只应由明确的发布负责人在隔离环境中构建。这样不会在开发者的 LaunchServices / 应用菜单中留下多个璇玑副本。

## 本地验证

```bash
# Python 依赖与 API 测试
python3 -m venv .venv
.venv/bin/pip install -e "backend[test]" -e "node-agent[test]" "uvicorn[standard]"
.venv/bin/python -m pytest -q backend/tests node-agent/tests

# 浏览器前端，不生成桌面 App
cd app
npm ci
npm test
npm run build -- --outDir /tmp/xuanji-web-dist
cd ..

# Tauri Rust 库测试，不生成桌面 App
cargo fmt --manifest-path app/src-tauri/Cargo.toml -- --check
cargo test --manifest-path app/src-tauri/Cargo.toml --target-dir /tmp/xuanji-cargo-target

# 全量门禁（明确跳过桌面包）
bash scripts/verify-all.sh --skip-tauri-build
```

测试输出、`target/`、`dist/`、`.venv/`、数据库、日志和运行项目不应提交。

## 提交流程

1. 先在 Issue 或讨论中说明问题、预期行为和影响范围。
2. 从默认分支创建短生命周期分支，保持单一主题。
3. 更新必要的测试和文档；不要把无关格式化、生成物或个人配置混入提交。
4. Pull Request 说明变更、验证命令、已知限制和是否涉及安全/隐私边界。
5. 维护者审核通过后合并；发布包、签名、公证和生产发布另走发布流程。

## 安全与隐私

- 不提交 API Key、Token、SSH 私钥、`.env`、数据库或真实用户数据。
- 远程节点连接必须保留 `StrictHostKeyChecking=yes`，不要为了测试关闭主机校验。
- 安全问题请按 [`SECURITY.md`](SECURITY.md) 私密报告，不要在公开 Issue 粘贴凭据或可利用细节。

## 许可证与贡献声明

本项目及文档使用 [Apache License 2.0](LICENSE)。提交代码或文档即表示你有权提交该内容，并同意按 Apache-2.0 条款授权；除非 Pull Request 明确说明，仓库不要求额外 CLA。
