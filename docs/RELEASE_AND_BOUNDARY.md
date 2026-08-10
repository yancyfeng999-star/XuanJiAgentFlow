# 发布现状与边界 · 璇玑 App

写清「已交付」和「未宣称完成」，避免误判完成度。

---

## 版本怎么说

| 说法 | 含义 | 对外建议 |
|------|------|----------|
| 产品方向 **3.0** | 完成 2.0 的 **真执行闭环**；不扩范围 | 可说「3.0 方向 / 真执行闭环」 |
| 安装包 **0.3.0** | 当前 macOS arm64 包版本 | 用具体 DMG 文件名 |
| 历史工程名 AgentFlow | 旧目录 / 旧称呼 | 对内可以；对外优先「璇玑 App」 |
| 本仓 XuanJiAgentFlowApp | 正式产品与工程名 | 与 `../XuanJiAgentFlowSkill` 对称 |

## 已具备（内测可演示）

- 可安装 DMG + `.app`  
- 界面配置 Planner / 节点 / SSH  
- 规划 → 编辑 → 审核冻结 → 执行控制面  
- 本机 / 远程节点（SSH 隧道）  
- 产物哈希下载到项目目录  
- `verify-all.sh`、Playwright E2E、集成测试等（见 CURRENT_STATE）  
- 用户可读中文错误  

## 未做完 / 外部验收（禁止写成「已上线完成」）

| 项 | 说明 |
|----|------|
| Apple Developer ID 签名 | 正式分发签名 |
| 公证 / Staple | 未做 |
| App Store | 未上架 |
| Win / Linux 桌面首发 | 未做 |
| 真实云账号长压 | 外部 |
| 真实服务器 Hermes 长稳 | 外部 |
| 未知主机指纹完整 UI 确认流 | 见 CURRENT_STATE，未当已完结宣传 |

## 安装包位置

```text
release/          # 当前交付，见 release/README.md
release/archive/  # 历史候选，勿作当前安装源
```

## 安全边界

1. 密钥本地存储、权限收紧；非企业 KMS。  
2. API **不回传** Key / Token 正文。  
3. SSH 私钥只存路径。  
4. 禁止 `StrictHostKeyChecking=no`。  
5. 成功以产物与门禁为准。

## 范围纪律（3.0）

**做：** 真规划、真调度、真节点、真产物、可装可演示。  
**不做：** 协作账号体系、商店增长、跨平台首发、用 App 重做聊天壳替代 Hermes。

与 Skill 分工见 [VS_SKILL.md](VS_SKILL.md)。
