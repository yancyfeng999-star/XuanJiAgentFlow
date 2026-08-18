# 证据索引 · EVIDENCE_INDEX

> 建立日期：2026-08-12
> 目的：把“源码存在”“测试通过”“已构建”“已打包”“已运行”“真实外部链路”“远端发布”“用户已安装”“用户已验收”分层登记，禁止跨层夸大。
> 规则：每项证据必须含日期、候选/基线 SHA、环境、命令、结果和层级；只有重跑后才能更新为当前结果。

## 1. 版本命名（分别使用，不混称“版本”）

| 名称 | 当前值 | 事实源 |
| --- | --- | --- |
| 产品 / 包版本 | 0.3.5 源码；用户安装包仍为 0.3.3 | `app/package.json`、`release/README.md` |
| Coordinator API 版本 | 3.0.0 | `backend/src/xuanji/api/app.py`（`GET /api/status`） |
| 数据 schema 版本 | 7 | `backend/src/xuanji/storage/migrations.py` `CURRENT_SCHEMA_VERSION` |
| 产品方向 | 3.0（真执行闭环） | `docs/PRODUCT.md` |

## 2. 证据层级定义

| 层级 | 含义 | 未验证时的写法 |
| --- | --- | --- |
| `source` | 固定 SHA 的源码/合同审查 | `not_reviewed` |
| `test` | 自动化测试原始命令、日志、退出码、环境 | `not_run` |
| `build` | frontend + Rust + sidecar + Tauri build | `not_built` |
| `package` | 实际 `.app`/安装资产、hash、架构 | `not_packaged` |
| `runtime` | 冷启动、sidecar、主旅程录屏/日志 | `not_runtime_verified` |
| `external` | 真实 Hermes / 真实远端节点 | `not_external_verified` / `not_remote_node_verified` |
| `remote_ci` | GitHub Actions run URL 与 commit SHA | `not_remote_ci_verified` |
| `remote_release` | Release URL、tag、资产、hash | `not_released` |
| `update` | 旧版→候选真实升级与回滚 | `not_update_verified` |
| `installed` | 用户目标机器实际安装并启动 | `not_installed` |
| `user_acceptance` | 用户明确验收记录 | `acceptance_unknown` |

## 3. 当前证据登记（2026-08-12 核对）

| 项 | 层级 | 日期 | SHA / 环境 | 命令 / 来源 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 源码基线 | `source` | 2026-08-12 | `b67d2f566b92549d91334d257c3b3a94fa2782c3`（main） | 只读结构核对 | 记录于改进/审核计划 |
| 2026-07-29 全量门禁 | `test` | 2026-07-29 | 见 `docs/XUANJI_3_VALIDATION_REPORT.md` | `scripts/verify-all.sh` | **历史证据，不代表当前候选** |
| 0.3.3 安装资产 | `package` | 2026-08-11 | `release/xuanji-0.3.3-20260811/` | `release/README.md` 校验值 | 见第 4 节清单 |
| 0.3.1→0.3.2→0.3.3 升级 | `update` | 2026-08-11 | 真实 GitHub Release 链路 | `release/README.md` 记录 | 历史记录，候选版本需重验 |
| 候选实现（ux-integration） | `test` | 2026-08-12 | 候选分支 `candidate/ux-integration`（macOS 26.6.1 arm64） | `bash scripts/verify-all.sh --skip-tauri-build` | 全绿：backend 187 / node-agent 29 / vitest 72 / e2e 27 / cargo 13；其余层级见 `docs/releases/0.3.4-candidate-acceptance.md` 第 5 节 |
| 2026-08-14 Codex 基线 | `test` | 2026-08-14 | `77a50b8caa6db54f3c95f1025cf05a6f6c3c524b`（含 `3232479e7a1e704a9ceddcee137e3ca256e55543`） | `bash scripts/verify-all.sh --skip-tauri-build` | 退出码 0：backend 191 / node-agent 29 / vitest 72 / e2e 27 / cargo 14；Tauri build 未跑。见 `docs/reviews/2026-08-14-codex-style-baseline.md` |
| 2026-08-14 Codex 产品基础候选 | `test` | 2026-08-14 | `agent/xuanji-logo-menu-status-github`（含 `3232479`） | `bash scripts/verify-all.sh --skip-tauri-build` | 退出码 0：backend 199 / node-agent 29 / vitest 97 / e2e 31 / cargo 16；docs check 通过；Tauri build 未跑。**不是**已发布/已安装。见 `docs/reviews/2026-08-14-codex-style-implementation-review.md`。**计数已被 2026-08-18 行取代**（该文历史声明保留） |
| 2026-08-18 最终补救无 App 门禁 | `test` | 2026-08-18 | `2fb462d90d63542437971d76736db1ac1b4bd4c8`（macOS 26.6.1 arm64） | 连续两轮 `bash scripts/verify-all.sh --skip-tauri-build` + 独立 `cd app && npm run test:e2e` | 三轮退出码 0：backend 200 / node-agent 29 / vitest 103 / e2e 32 / cargo 16；lint 0；prod+full audit 0 vuln；Tauri **SKIPPED**。实现者自检，**不是**独立审核 / 已发布 / 已安装。见 `docs/reviews/2026-08-18-final-remediation-verification.md` |

## 4. 所有者资产 SHA-256 清单（2026-08-12 生成）

以下资产存在于主工作区、未纳入候选提交。状态由资产所有者确认前一律**避让**，不得清理、重建或提交。

### 4.1 sidecar 二进制（git 已跟踪修改）

```text
768bcc7d3a60c67501e31cd58cc1a349d7ffcacf1fbdc392c9e4393f7039556b  app/src-tauri/binaries/xuanji-coordinator
8e512b40603059d928f6c401c72efab5afa2ad9cf9993cdbe311abb17af7e308  app/src-tauri/binaries/xuanji-coordinator-aarch64-apple-darwin
```

注意：`release/xuanji-0.3.1-20260811/xuanji-coordinator` 与 `app/src-tauri/binaries/xuanji-coordinator` 哈希相同（768bcc7d…）。

### 4.2 嵌套构建产物（未跟踪，约 1.2 GB / 3,596 文件）

- `app/src-tauri/src-tauri/`：嵌套 Cargo/Tauri 构建产物；文件级清单过大不列入，待所有者确认“可删除/需归档”。

### 4.3 release 目录（未跟踪）

```text
c7e0143558f23f8eb51c6bcff8c7bf16ddab97f332bdd6c2ba32ceb8138e020d  release/xuanji-0.3.1-20260811/璇玑_0.3.1_aarch64.dmg
768bcc7d3a60c67501e31cd58cc1a349d7ffcacf1fbdc392c9e4393f7039556b  release/xuanji-0.3.1-20260811/xuanji-coordinator
1122a74be349a2d9cf6e18543f201dd398cbf22ccc1abd872876ef474539fd04  release/xuanji-0.3.1-20260811/updater/latest.json
a51fd701a95dfa7acab10365d13198a7782c23f8ea2a679214992baaec228fbd  release/xuanji-0.3.1-20260811/updater/xuanji.app.tar.gz.sig
b8cf587c0ed2ec420cb2f5a03fb08be6d6c699698b6bb92a230d4c1dc19c5b91  release/xuanji-0.3.1-20260811/updater/xuanji.app.tar.gz
13732576f55c56956f71b79975c790d6031e083441b95d138f78ea8bf15f5886  release/xuanji-0.3.2-20260811/updater/latest.json
19a95f117af75d8e099a1e7d7223fd57598709f05e9cdf353b05b718d9408eb5  release/xuanji-0.3.2-20260811/updater/xuanji.app.tar.gz.sig
6f81b325f52c3367789bdc7796100a4e42f173aabc1bfa53fcc77a4e6ca7b39d  release/xuanji-0.3.2-20260811/updater/xuanji.app.tar.gz
c1ddf2d426d62c52bf1a06e72523a66c041ab1a0c1e1b5030fc4143bee7dd510  release/xuanji-0.3.2-20260811/璇玑_0.3.2_aarch64.dmg
6fe257ee9b110c01825a0aa2a744454ac0e741e4d7c6987e3a9b4dfe2e83a7a7  release/xuanji-0.3.2-20260811/璇玑-0.3.2.pkg
4b2c24a436a493280e306d5e585ce0e80021acba9bda306aef1833ea31e5c9c9  release/xuanji-0.3.3-20260811/updater/latest.json
12ced4d23f4fe9b830cc7738fb5f1729b54dd2677aff3339bd320eca6f34ce8b  release/xuanji-0.3.3-20260811/updater/xuanji.app.tar.gz.sig
e365d0095068c1e5af132cbef5c6453bc1134e9a1732fb37de0dd9f126479edd  release/xuanji-0.3.3-20260811/updater/xuanji.app.tar.gz
9b1da588b62d35f2b9be89a0ba4fd5ea4aad801fded5cf225f36ad5d8538d106  release/xuanji-0.3.3-20260811/璇玑-0.3.3.pkg
ccd1fbab587227369f0cc0f198fa770f3a3e2f186104922ade3ce86eba619a4e  release/xuanji-0.3.3-20260811/璇玑_0.3.3_aarch64.dmg
```

## 5. 候选交付时本文件必须更新

候选固定后，把第 3 节“候选实现”行替换为实际命令、日志路径、退出码、环境；未执行的层级保留 `not_*` 状态词，不得留空或写成通过。
