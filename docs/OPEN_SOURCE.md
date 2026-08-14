# 开源维护说明

## 项目范围

XuanJiAgentFlow（璇玑）包含本地 Coordinator、浏览器前端、Tauri 集成代码、Node Agent 以及产品/运维文档。能力事实以 [`docs/CURRENT_STATE.md`](CURRENT_STATE.md) 为准，发布边界以 [`docs/RELEASE_AND_BOUNDARY.md`](RELEASE_AND_BOUNDARY.md) 为准。

## 许可证

- 源代码、文档和本仓库维护的资源：Apache License 2.0，见根目录 [`LICENSE`](../LICENSE)。
- 版权与归属说明：见 [`NOTICE`](../NOTICE)。
- 第三方依赖：以 `backend/pyproject.toml`、`backend/uv.lock`、`app/package.json`、`app/package-lock.json`、`app/src-tauri/Cargo.toml` 和 `app/src-tauri/Cargo.lock` 及其上游许可证为准。
- Apache-2.0 不授予“璇玑”“XuanJi”、Logo 或其他商标使用权。商标、品牌和发布渠道需要另行获得授权。

## 文档入口

- [`README.md`](../README.md)：项目定位、快速开始和能力边界。
- [`CONTRIBUTING.md`](../CONTRIBUTING.md)：贡献、验证和 Pull Request 要求。
- [`SECURITY.md`](../SECURITY.md)：私密漏洞报告和凭据边界。
- [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)：社区协作规则。
- [`docs/USER_GUIDE.md`](USER_GUIDE.md)：浏览器开发和用户操作路径。
- [`release/README.md`](../release/README.md)：历史发布资产和校验信息。

## 开发与桌面包边界

普通贡献者只需运行浏览器开发、前端测试、Rust 测试和 API 测试。默认不要执行 `npm run tauri dev`、`npm run build:tauri` 或任何会在本机注册 `.app` 的命令；它们会制造 LaunchServices 重复条目，并不属于普通 PR 的必要证据。

桌面 `.app`、DMG、PKG、更新包、签名和公证属于发布流程，应在隔离的发布环境中生成，并在 Pull Request 中单独说明版本、架构、哈希和外部验收状态。仓库中的历史安装资产不等于当前可发布或已公证版本。

## 不应提交的内容

禁止提交凭据、个人数据、数据库、`.env`、`node_modules/`、Python 虚拟环境、Rust `target/`、前端 `dist/`、临时日志、LaunchServices 生成的副本和未审查的第三方二进制。若需要分发二进制，必须记录来源、版本、许可证、哈希和审查责任人。

## 开源发布检查表

- [ ] `LICENSE` 与 `NOTICE` 存在且与 PR 描述一致。
- [ ] README、贡献指南、安全策略和行为准则可从仓库首页进入。
- [ ] 新增依赖的许可证、来源和版本已记录。
- [ ] 没有凭据、真实用户数据、构建缓存或重复 `.app`。
- [ ] 浏览器测试、Rust 测试、格式检查和必要的文档校验已运行。
- [ ] 桌面包、安装器、签名、公证和 Release 页面分别标注真实状态。
