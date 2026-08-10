# 璇玑 App vs 璇玑 Skill

一个大脑，两套手脚。从 **App 本仓** 视角划界。

---

## 共同部分

| 项 | 内容 |
|----|------|
| Slogan | 思考在先，执行在后 |
| 逻辑 | 目标 → 拆 DAG → 审核放行 → 依赖调度 → 多节点执行 → 产物汇总 |
| 成功标准 | 成功 = 产物真实存在；部分失败不能假称全成功 |
| 执行后端取向 | Hermes 节点（本机 / 远程） |

## 不同部分

| 维度 | App（本仓） | Skill（`../XuanJiAgentFlowSkill`） |
|------|-------------|-------------------------------------|
| 产品名 | 璇玑 App · XuanJiAgentFlowApp | 璇玑 Skill · XuanJiAgentFlow |
| 入口 | 桌面 `.app` / 开发态浏览器 | Hermes 对话 |
| 形态 | 可安装软件 + 本仓源码 | 规程文本 + 脚本 |
| 规划 | PlannerService 调 LLM API | Agent 按规划器 skill 拆 |
| 审核 | 画布「审核工作流」，节点冻结 | 对话确认；「全部执行」≠ 跳过关键问题 |
| 进度 | 顶栏 + 画布 + WebSocket | LIVE.html + `【璇玑×器】` 汇报 |
| 执行手 | Coordinator + Node Agent | 当前 Agent + delegate / SSH |
| 数据 | SQLite + 项目目录 | 树状 `run_root`（默认 `~/.hermes/xuanji-runs/`） |
| 验收 | `verify-all.sh` 等 | `verify-run.py` |
| 典型台词 | 「看着图管项目和节点」 | 「用璇玑把这事跑完」 |

## 定位

| | |
|--|--|
| **App** | 图形手脚：稳、可装、可运维 |
| **Skill** | 对话手脚：快、嵌在 Hermes |

**不是**「一个产品两个登录入口」，而是同一套璇玑逻辑的两种操作面。

## 文案禁忌

1. 不写「装了 App 就自带九器 Skill 全链路对话规程」。  
2. 不写「LIVE.html 就是 App 画布」。  
3. 不把 Skill `0.5.x` 版本号写进 App DMG。  
4. 不把 `verify-all.sh` 说成用户每次 run 必做。  
5. 只介绍一个产品时，只用该产品自己的一句话。

## 一句话

- **App：** 可安装的本地控制台：画布编排 + 多 Hermes 节点真跑 + 产物回写。  
- **Skill：** 在 Hermes 里用规程驱动的自动项目流水线。（权威在 Skill 仓）

App 权威短文：[PRODUCT.md](PRODUCT.md)  
Skill 文字在 `../XuanJiAgentFlowSkill/` 维护（无授权不改那边）。
