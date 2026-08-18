# 璇玑发布目录

## 当前交付版本

GitHub Release：`https://github.com/yancyfeng999-star/XuanJiAgentFlow/releases/tag/v0.3.6`

本地归档目录：`xuanji-0.3.6-20260819/`（未入库，安装包以 GitHub Release 为准）

用户安装只提供安装包，不提供裸 `.app`。**用户只需要二选一**：

- `XuanJi_0.3.6_aarch64.dmg`：推荐，双击挂载后把「璇玑」拖入「应用程序」
- `XuanJi-0.3.6.pkg`：双击安装到 /Applications（未签名，productsign 需 Developer ID Installer）

未上传带签名的 `latest.json` / `.sig`：本机没有 `TAURI_SIGNING_PRIVATE_KEY`。从旧版升级请手动下载本页安装包。

当前使用本机临时签名，尚未进行 Apple Developer ID 签名与公证。

### 静默更新已实测

2026-08-11：0.3.1→0.3.2 与 0.3.2→0.3.3 两轮实测均约 45 秒自动升级并重启（真实 GitHub Release 链路）。
注意：macOS 产出的 updater 压缩包必须去除 AppleDouble/xattr 条目（本仓库用 USTAR 无扩展头格式重建），否则客户端报 `failed to unpack ._璇玑.app`。

## 历史版本

- `xuanji-0.3.3-20260811/`：0.3.3 本地归档
- `xuanji-0.3.2-20260811/`：0.3.2（审查修复版）

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
0527a955eccbbbb598869fdd87e4b4fcd6e27a661101cc18f60c5556c1d8e2b2  XuanJi_0.3.6_aarch64.dmg
de2a543228b98ce73f0ae859b84cd1ffe86e07789d00c83df31b5a5c5fb4298b  XuanJi-0.3.6.pkg
```

## 0.3.3 校验值

```text
ccd1fbab587227369f0cc0f198fa770f3a3e2f186104922ade3ce86eba619a4e  璇玑_0.3.3_aarch64.dmg
9b1da588b62d35f2b9be89a0ba4fd5ea4aad801fded5cf225f36ad5d8538d106  璇玑-0.3.3.pkg
e365d0095068c1e5af132cbef5c6453bc1134e9a1732fb37de0dd9f126479edd  xuanji.app.tar.gz
```

## 0.3.0 校验值（20260729 版）

```text
05418bef90cf59bdccc0597885e451d0bbf9e8c9305a8d0fc0fa57ea52b26afe  xuanji-coordinator
b217cbfe5edc11f3d57bbf32924f55795686d694e5f12e551c48a8c89d9fedcc  璇玑_0.3.0_aarch64.dmg
```
