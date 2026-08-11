# 璇玑发布目录

## 当前交付版本

GitHub Release：`https://github.com/yancyfeng999-star/XuanJiAgentFlow/releases/tag/v0.3.2`

本地归档目录：`xuanji-0.3.2-20260811/`

- `璇玑_0.3.2_aarch64.dmg`：推荐安装包
- `璇玑-0.3.2.pkg`：PKG 安装包（安装 `璇玑.app` 到 /Applications；未签名，productsign 需 Developer ID Installer）
- `璇玑.app`：可直接运行的 macOS 应用
- `xuanji.app.tar.gz` + `xuanji.app.tar.gz.sig`：静默自动更新产物（updater 端点为 Release 的 `latest.json`）
- `latest.json`：更新清单副本

该版本在 0.3.1（视觉系统、深浅色、中英文、自动更新）基础上修复审查发现：webview CSP、更新可关闭且运行中不重启、设置页版本与反馈入口、原生菜单随语言切换、最低系统 macOS 13、CI 门禁上线。
当前使用本机临时签名，尚未进行 Apple Developer ID 签名与公证。

### 静默更新已实测

2026-08-11：0.3.1 安装包启动后约 45 秒自动升级并重启为 0.3.2（真实 GitHub Release 链路）。
注意：macOS 产出的 updater 压缩包必须去除 AppleDouble/xattr 条目（本仓库用 USTAR 无扩展头格式重建），否则客户端报 `failed to unpack ._璇玑.app`。

## 历史版本

- `xuanji-0.3.1-20260811/`：0.3.1（视觉/深浅色/i18n/自动更新首发；其 updater 压缩包含 AppleDouble 缺陷，已在 0.3.2 修正）
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
c1ddf2d426d62c52bf1a06e72523a66c041ab1a0c1e1b5030fc4143bee7dd510  璇玑_0.3.2_aarch64.dmg
6fe257ee9b110c01825a0aa2a744454ac0e741e4d7c6987e3a9b4dfe2e83a7a7  璇玑-0.3.2.pkg
6f81b325f52c3367789bdc7796100a4e42f173aabc1bfa53fcc77a4e6ca7b39d  xuanji.app.tar.gz
```

## 0.3.0 校验值（20260729 版）

```text
05418bef90cf59bdccc0597885e451d0bbf9e8c9305a8d0fc0fa57ea52b26afe  xuanji-coordinator
b217cbfe5edc11f3d57bbf32924f55795686d694e5f12e551c48a8c89d9fedcc  璇玑_0.3.0_aarch64.dmg
```
