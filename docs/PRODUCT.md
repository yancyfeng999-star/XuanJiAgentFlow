# 璇玑 App（桌面产品 · XuanJiAgentFlowApp）

**共同 slogan：** 思考在先，执行在后  
**本仓：** `/Users/yancyfeng/Desktop/XuanJiAgentFlow/XuanJiAgentFlowApp`  
**历史工程名：** AgentFlow

---

## 是什么

**macOS 本地分布式 AI 任务控制台**（品牌名璇玑）。

独立 App：画布上看任务图，点审核、点执行；Coordinator 调度本机 / 远程 Hermes 节点；产物哈希校验后回写项目目录。

## 给谁用

要 **可视化编排和运维** 的人：

- 内测 / 本地开发者
- 需要离开聊天界面管理项目、节点、历史与下载产物的用户
- 希望「像正经软件」管多节点执行，而不是只靠对话与 HTML 进度页的人

## 你怎么操作（操作面）

| 步骤 | 你做什么 | 系统做什么 |
|------|----------|------------|
| 安装 | DMG → 拖到「应用程序」 | 当前 ad-hoc 签名，可能要「仍要打开」 |
| 配置 | 设置里填 Planner Key；登记 Hermes 节点 / SSH | 密钥本地 `0600`，API 不回传 |
| 建项 | 左侧新项目 | 项目目录 + SQLite 元数据 |
| 规划 | 画布输入目标 → 生成规划 | DeepSeek / MiMo 等出 DAG（可一次自动修） |
| 编辑 | 点节点改 Prompt / 约束 / 重试；拖位置 | 审核前可改，审核后冻结 |
| 审核 | 点「审核工作流」 | `reviewed`，防误改 |
| 执行 | 「执行全部」；可暂停 / 恢复 / 取消 / 重试 / 跳过 | 调度选节点；SSH 隧道访问远程 Node；WS 推状态 |
| 产物 | 检查器里下载 | 哈希校验后落项目 `root_path` |

## 技术形态（摘要）

| 层 | 技术 |
|----|------|
| 壳 | Tauri 2（监督 sidecar） |
| UI | React 19 · 单一无限画布 |
| 中枢 | Python FastAPI Coordinator |
| 节点 | Node Agent → Hermes `/v1/runs` |
| 数据 | SQLite + 项目目录真实文件 |
| 门禁 | `scripts/verify-all.sh`、Playwright E2E |

细节见 [TECH_SHAPE.md](TECH_SHAPE.md)。完成度以 [CURRENT_STATE.md](CURRENT_STATE.md) 为准。

## 发布现状

| 项 | 状态 |
|----|------|
| 版本方向 | **3.0**（完成 2.0 承诺的真执行闭环，**不扩**产品范围） |
| 安装包示例 | `璇玑_0.3.0_aarch64.dmg`（arm64） |
| 签名 | 本机 ad-hoc；**未** Apple 公证 / Staple |
| 分发 | **未** App Store；**未** Win / Linux 首发 |
| 外部验收 | 真实云账号长压、真实服务器 Hermes 长稳等属外部验收 |

详见 [RELEASE_AND_BOUNDARY.md](RELEASE_AND_BOUNDARY.md)。

## 强项 / 弱项

| | |
|--|--|
| **强** | 像正经软件；画布 + 检查器；节点 / 凭据 / 控制面完整；可装可演示 |
| **弱** | 重依赖本机栈与节点部署；和「随口一句话就跑」相比启动成本高；分发签名未完 |

## 一句话

> **可安装的本地控制台：画布编排 + 多 Hermes 节点真跑 + 产物回写。**

---

与对话产品对照 → [VS_SKILL.md](VS_SKILL.md)  
日常操作 → [OPERATIONS.md](OPERATIONS.md) · 开发指南 → [USER_GUIDE.md](USER_GUIDE.md)
