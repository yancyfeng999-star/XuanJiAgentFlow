# 命名与路径 · XuanJiAgentFlowApp

## 正式位置

```text
/Users/yancyfeng/Desktop/XuanJiAgentFlow/XuanJiAgentFlowApp
```

上级：`/Users/yancyfeng/Desktop/XuanJiAgentFlow/`  
兄弟：`../XuanJiAgentFlowSkill/`

## 正误对照

| 用法 | 正确 | 错误 / 易混 |
|------|------|-------------|
| 品牌中文 | 璇玑 | 璇机、玄玑 |
| 桌面产品 | 璇玑 App / XuanJiAgentFlowApp | 对外只说 AgentFlow |
| 本仓路径 | Desktop/XuanJiAgentFlow/XuanJiAgentFlowApp | Agent Data/.../projects 下的临时夹 |
| 对话产品 | XuanJiAgentFlowSkill | 与 App 目录名混用 |
| 组合 Skill 名 | XuanJiAgentFlow | 写成 App 名 |
| Slogan | 思考在先，执行在后 | — |
| 包名示例 | `璇玑_0.3.0_aarch64.dmg` | 编造版本 |
| 产品方向 | 3.0 = 真执行闭环 | 说成已公证上架 |

## 废弃 / 勿再写入

| 路径 | 说明 |
|------|------|
| `…/Hermes Agent Data/projects/XuanJiAgentFlowApp/` | 曾误建的**仅文案**临时目录，内容已迁入本仓后应删除 |
| `…/Hermes Agent Data/projects/AgentFlow/` | 历史拷贝；正式仓以 Desktop 路径为准 |

## 本仓产品文档清单

```text
README.md
01-产品定义.md
docs/
  PRODUCT.md
  PRODUCT_DEFINITION.md
  USER_JOURNEY.md
  TECH_SHAPE.md
  OPERATIONS.md
  RELEASE_AND_BOUNDARY.md
  VS_SKILL.md
  NAMING.md
  CURRENT_STATE.md      # 工程完成度（权威）
  USER_GUIDE.md         # 开发指南
  …
```

## 维护规则

1. App 相关改动默认只在本仓进行。  
2. 与实现冲突：先信 `docs/CURRENT_STATE.md`，再改产品文案。  
3. 对外复制优先 `docs/PRODUCT.md`。  
4. 不提交密钥、真实密码、生产 IP、勿把 DMG 当 git 主产物乱推。  
