# 璇玑发布目录

## 当前交付版本

目录：`xuanji-3.0-cn-errors-20260729/`

- `璇玑_0.3.0_aarch64.dmg`：推荐安装包
- `璇玑.app`：可直接运行的 macOS 应用
- `xuanji-coordinator`：与该版本对应的独立 Coordinator

该版本已经完成中文报错统一、移除安全存储/主密码流程、自动化测试、DMG 挂载检查和 App 深度签名校验。
当前使用本机临时签名，尚未进行 Apple Developer ID 签名与公证。

## 历史版本

历史候选包和替换前版本统一保存在 `archive/2026-07-29/`：

- `xuanji-3.0-candidate-20260729/`：早期 3.0 候选包
- `xuanji-3.0-final-20260729/`：中文报错统一前的 3.0 包
- `xuanji-3.0-cn-errors-before-no-vault-20260729/`：移除安全存储功能前的中文界面包
- `legacy-root/`：原先散落在项目根目录的 0.1.0 App 与 DMG

历史目录只用于回溯，不应作为当前安装来源。

## 当前版本校验值

```text
05418bef90cf59bdccc0597885e451d0bbf9e8c9305a8d0fc0fa57ea52b26afe  xuanji-coordinator
b217cbfe5edc11f3d57bbf32924f55795686d694e5f12e551c48a8c89d9fedcc  璇玑_0.3.0_aarch64.dmg
```
