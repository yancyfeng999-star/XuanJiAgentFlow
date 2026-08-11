# 璇玑发布目录

## 当前交付版本

GitHub Release：`https://github.com/yancyfeng999-star/XuanJiAgentFlow/releases/tag/v0.3.1`

本地归档目录：`xuanji-0.3.1-20260811/`

- `璇玑_0.3.1_aarch64.dmg`：推荐安装包
- `璇玑.app`：可直接运行的 macOS 应用
- `xuanji.app.tar.gz` + `xuanji.app.tar.gz.sig`：静默自动更新产物（updater 端点为 Release 的 `latest.json`）
- `xuanji-coordinator`：与该版本对应的独立 Coordinator
- `latest.json`：更新清单副本

该版本包含宣纸-玄色视觉系统、深色/浅色模式、中英文界面与静默自动更新；通过自动化测试、DMG 挂载检查和 App 深度签名校验。
当前使用本机临时签名，尚未进行 Apple Developer ID 签名与公证。

## 历史版本

- `xuanji-3.0-cn-errors-20260729/`：3.0 首个交付版（0.3.0）
- `xuanji-3.0-consolidated-20260810/`：脏工作树整理候选的 0.3.0 重打包（含首次 CU 终验）

## 历史归档

历史候选包和替换前版本统一保存在 `archive/2026-07-29/`：

- `xuanji-3.0-candidate-20260729/`：早期 3.0 候选包
- `xuanji-3.0-final-20260729/`：中文报错统一前的 3.0 包
- `xuanji-3.0-cn-errors-before-no-vault-20260729/`：移除安全存储功能前的中文界面包
- `legacy-root/`：原先散落在项目根目录的 0.1.0 App 与 DMG

历史目录只用于回溯，不应作为当前安装来源。

## 当前版本校验值

```text
c7e0143558f23f8eb51c6bcff8c7bf16ddab97f332bdd6c2ba32ceb8138e020d  璇玑_0.3.1_aarch64.dmg
b8cf587c0ed2ec420cb2f5a03fb08be6d6c699698b6bb92a230d4c1dc19c5b91  xuanji.app.tar.gz
768bcc7d3a60c67501e31cd58cc1a349d7ffcacf1fbdc392c9e4393f7039556b  xuanji-coordinator
```

## 0.3.0 校验值（20260729 版）

```text
05418bef90cf59bdccc0597885e451d0bbf9e8c9305a8d0fc0fa57ea52b26afe  xuanji-coordinator
b217cbfe5edc11f3d57bbf32924f55795686d694e5f12e551c48a8c89d9fedcc  璇玑_0.3.0_aarch64.dmg
```
