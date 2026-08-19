# 操作指南 · 璇玑 App

面向内测用户与本地使用者。从源码起服务见 [USER_GUIDE.md](USER_GUIDE.md)。

---

## 1. 从 DMG 安装

1. 打开 GitHub Release `v0.3.6` 的 `XuanJi_0.3.6_aarch64.dmg`（校验见 `release/README.md`）。  
2. 将「璇玑.app」拖到 `Applications`。  
3. 若拦截：**系统设置 → 隐私与安全性 → 仍要打开**。  
4. 节点与 Key 全部在界面配置，不必写进安装包。

当前为 **ad-hoc / 临时签名**，非已公证正式分发件。

## 2. 首次配置

### Planner（必做才能规划）

设置：Base URL、模型、API Key → 应显示已配置，不把 Key 读回前端。

### Hermes 节点（必做才能真执行）

| 场景 | 必填 |
|------|------|
| 本机 | API URL、Token |
| 远程 | API URL、Token、SSH Host/Port/User、本机私钥路径 |

建议加完后走诊断，确认 online。

### 安全习惯

- 只在可信本机账户使用  
- SSH 私钥只填路径  
- 不关闭 host key 校验  

## 3. 日常八步

1. 新项目  
2. 写可验收目标  
3. 生成规划  
4. 编辑节点  
5. 审核工作流（冻结）  
6. 执行全部  
7. 暂停 / 恢复 / 取消 / 重试 / 跳过  
8. 检查器下载产物  

## 4. 常见问题

| 现象 | 先检查 |
|------|--------|
| Coordinator 未能就绪 | 重开 App；sidecar / 端口 |
| 规划失败 | Key / URL / 模型 / 网络 |
| 审核后改不了 | 预期；需重新规划 |
| 一直不跑 | 节点 online、Token、SSH、是否已审核 |
| 任务失败 | 重试；Hermes 健康；依赖 |
| 下载异常 | 磁盘权限与 `root_path` |

错误码细节 → [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。

## 5. 不该期望 App 替你做的

- 自带云端账号与配额  
- 已公证、零安全提示的商店安装  
- Win / Linux 双击即用  
- 与 Skill 共用同一套 run 目录协议  

## 6. 工程验证（开发 / 内测）

```bash
bash scripts/verify-all.sh
```

可选：`--skip-e2e`、`--skip-tauri-build`。终端用户装 DMG 不强制跑门禁。
