# 璇玑 0.3.6 收口与分发补齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 **不破坏已发布的 GitHub `v0.3.6`**、**不覆盖本地脏 `main`** 的前提下，把 0.3.6 从「远端已上传」收到「本机可装可验」，并按授权补齐文档、脆弱 e2e、应用内更新和 Apple 正式签名。

**Architecture:** 分四条互不耦合的轨道。A 不改产品行为，只验收、隔离脏目录、对齐活文档、收窄脆弱测试。B 复用已嵌入 `tauri.conf.json` 的 updater pubkey 与现有 `createTauriUpdaterAdapter()`，只补签名产物。C 是新的 Developer ID / 公证构建，必须升版本，不得改写已发布的 `v0.3.6` 资产。D 明确不做。

**Tech Stack:** Git / GitHub Releases、Tauri 2 updater（minisign）、`productbuild` / `hdiutil`、Playwright、Vitest、macOS `codesign` / `notarytool` / `stapler`（仅 C 轨）。

**推荐执行顺序：** A →（有私钥才）B →（有 Apple 账号才）C。不要一上来做 C。

---

## 0. 已冻结事实（2026-08-19 核对）

| 项 | 值 |
|---|---|
| `origin/main` | `af50cf2` Merge PR #3 |
| 标签 / Release | `v0.3.6` Latest |
| 资产 | `XuanJi_0.3.6_aarch64.dmg`（22,540,650 B，`0527a955…e2b2`） |
| | `XuanJi-0.3.6.pkg`（23,121,898 B，`de2a5432…298b`） |
| 未上传 | `latest.json`、`*.sig`、`xuanji.app.tar.gz` |
| `main` CI | [run 32172584951](https://github.com/yancyfeng999-star/XuanJiAgentFlow/actions/runs/32172584951) success（重跑后） |
| 本地主仓 | `/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow` @ `78b387f`，落后 5 提交，脏 |
| 隔离 worktree | `/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-ui-performance` @ `fix/xuanji-ui-performance` |
| 本地安装包副本 | worktree `release/xuanji-0.3.6-20260819/`（gitignore，未入库） |
| `.app` | worktree `app/src-tauri/target/release/bundle/macos/璇玑.app`，`CFBundleShortVersionString=0.3.6`，adhoc |
| 签名密钥 | 本机无 `TAURI_SIGNING_PRIVATE_KEY`；公钥已在 `app/src-tauri/tauri.conf.json` |
| 真机安装 / 打开 App | **未做** |
| 独立审核 | **未做** |

本地脏主仓当前内容（禁止直接 `checkout` 功能分支上去）：

- 已改：`app/src-tauri/binaries/xuanji-coordinator`、`xuanji-coordinator-aarch64-apple-darwin`
- 已删：`release/xuanji-0.3.{1,2,3}-20260811/璇玑_*.dmg`
- 未跟踪：`build/`、`docs/superpowers/plans/2026-08-19-xuanji-ui-performance-optimization.md`、`release/xuanji-0.3.4-20260814/`

---

## 1. 三条路线与推荐

| 路线 | 覆盖 | 前置 | 结果 | 建议 |
|---|---|---|---|---|
| **A 收口** | 真机安装、脏目录隔离、活文档、e2e 去脆 | 用户允许打开 0.3.6 | `user_installed` 有证据；主仓可安全 `ff-only` | **先做** |
| **B 更新通道** | 给 `v0.3.6` 补 `latest.json` + 签名 tar，或在丢钥时出 0.3.7 | 用户在环境变量注入匹配现有 pubkey 的私钥，**禁止粘贴到对话** | 0.3.3 / 0.3.5 可「检查更新」升到 0.3.6 | 有钥再做 |
| **C 正式签名** | Developer ID + 公证 + Staple，新版本号 | Apple Developer Program | Gatekeeper 不再拦 | 有账号再做 |

不推荐：把 A/B/C 揉成一次 0.3.7 大包（失败面大，且会让「0.3.6 已发布」和「新构建」分不清）。

---

## 2. 全局约束

1. 永远不 `git push origin main`，不 `--force`，不把功能分支 checkout 到脏主仓。
2. 代码改动只在**新的隔离 worktree**，基线 `origin/main` = `af50cf2`，分支名 `fix/xuanji-036-closeout`。
3. 不提交 `release/xuanji-0.3.6-20260819/`、`.app`、DMG、PKG、sidecar 二进制。
4. 不读取、不打印、不写入对话：API Key、`TAURI_SIGNING_PRIVATE_KEY`、Apple 证书、SSH 私钥。
5. 不把 Playwright / CI 绿写成「真机已验」；不把 Release 存在写成「用户已安装」；不把「检查更新」按钮存在写成「更新通道已通」。
6. 历史审查文档（`docs/reviews/2026-08-1*.md`、旧 plans）**保持原样**，只改活文档。
7. 3.0 范围外：Win/Linux、App Store、协作账号、真实云账号长压、真实 Hermes 长稳。可在证据里登记 `not_*`，不做实现。
8. Owner 自检 ≠ 独立审核。

### 授权门（每轨开工前口头确认）

| 门 | 未授权时 |
|---|---|
| A1 打开 / 安装 `.app` / DMG / PKG | 只做文档 + 测试，不碰 `/Applications` |
| A2 隔离脏主仓（move + `git checkout --` 已跟踪脏文件 + `ff-only`） | 主仓原样不动 |
| A3–A4 push / PR | 只留本地 worktree |
| B 使用签名私钥、上传 updater 资产到已有 `v0.3.6` | 不碰 Release 资产 |
| C `codesign` / `notarytool` / 新版本构建 | 不做 |

---

## 3. 文件地图

| 路径 | 职责 | 本计划 |
|---|---|---|
| `app/e2e/review-ack-stability.spec.ts` | 审核警告确认同快照重载 | **改**：删掉与用例无关的画布右键前奏 |
| `app/e2e/local-workflow.spec.ts` | 已覆盖断线 / 删节点 | 只读对照，不改除非 helper 抽取 |
| `app/e2e/helpers.ts` | e2e 共享 | 仅当抽取 `createProjectViaUi` 时改 |
| `README.md` | 安装入口 | 改活段落到 0.3.6 |
| `docs/OPERATIONS.md` | 用户安装步骤 | 改 |
| `docs/PRODUCT.md` | 对外产品短文 | 改安装包示例 |
| `docs/PRODUCT_DEFINITION.md` | 版本语义 | 改 |
| `docs/TECH_SHAPE.md` | 读者向版本表 | 改 |
| `docs/USER_JOURNEY.md` | 安装旅程 | 改 |
| `docs/NAMING.md` | 包名示例 | 改 |
| `docs/EVIDENCE_INDEX.md` | 分层证据 | **追加** 0.3.6 行，不改历史行正文 |
| `docs/CURRENT_STATE.md` | 完成度 | 按验收结果更新层级 |
| `docs/reviews/2026-08-19-036-closeout.md` | 本轮证据 | **新建** |
| `release/README.md` | 已指向 0.3.6 | 只读，除非 B 补 updater 说明 |
| `app/src-tauri/tauri.conf.json` | pubkey / updater URL | B 丢钥才改 pubkey；C 才改签名身份 |
| `app/src/lib/updater.ts` | 手动检查更新状态机 | A 不改；B 只验不改，除非实测暴露 bug |
| `app/src/lib/performance.ts` | 里程碑 | A6 可选：诊断面板附带 snapshot |
| 脏主仓二进制 / `build/` / `release/xuanji-0.3.4-*` | 所有者资产 | **只搬到隔离目录**，不入库 |

---

## Phase A — 0.3.6 收口（推荐立刻做）

### Task A0: 落盘本计划并建隔离 worktree

**Files:**

- Create: `docs/superpowers/plans/2026-08-19-xuanji-036-closeout.md`（本文件副本）
- Create worktree: `../XuanJiAgentFlow-036-closeout` on `fix/xuanji-036-closeout` from `origin/main`

- [ ] **Step 1: 确认远端基线**

```bash
git -C "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-ui-performance" fetch origin main
git -C "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-ui-performance" rev-parse origin/main
```

Expected: `af50cf266aac220dbce834a98052bc54b07a74a4`。若不同，停下来改本计划 SHA，禁止沿用过期值。

- [ ] **Step 2: 从主仓建新 worktree（不进入脏工作区改文件）**

```bash
MAIN="/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow"
git -C "$MAIN" fetch origin main
git -C "$MAIN" worktree add -b fix/xuanji-036-closeout \
  "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-036-closeout" \
  origin/main
```

Expected: 新目录 `HEAD` = `af50cf2`，`git status` 干净。

- [ ] **Step 3: 把本计划写入新 worktree 并提交（仅计划文件）**

```bash
WT="/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-036-closeout"
# 复制已批准的 plan 正文到 docs/superpowers/plans/2026-08-19-xuanji-036-closeout.md
git -C "$WT" add docs/superpowers/plans/2026-08-19-xuanji-036-closeout.md
git -C "$WT" commit -m "docs: add 0.3.6 closeout plan"
```

---

### Task A1: 真机安装并走通首屏 / 规划 / 审核（用户操作 + 代理人记录）

**授权：** 打开 0.3.6 安装包并启动 `/Applications/璇玑.app`。

**Files:**

- Create: `docs/reviews/2026-08-19-036-closeout.md`（本轮证据，安装段）
- Read: `docs/EVIDENCE_INDEX.md` 层级定义

**禁止：** 把 worktree 里的 `.app` 直接拖进 `/Applications` 当正式安装源。正式源只有 GitHub Release 或校验过的本地副本。

- [ ] **Step 1: 校验将要安装的文件**

```bash
OUT="/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-ui-performance/release/xuanji-0.3.6-20260819"
shasum -a 256 "$OUT/XuanJi_0.3.6_aarch64.dmg" "$OUT/XuanJi-0.3.6.pkg"
```

Expected:

```
0527a955eccbbbb598869fdd87e4b4fcd6e27a661101cc18f60c5556c1d8e2b2  .../XuanJi_0.3.6_aarch64.dmg
de2a543228b98ce73f0ae859b84cd1ffe86e07789d00c83df31b5a5c5fb4298b  .../XuanJi-0.3.6.pkg
```

若不一致：停。重新从 https://github.com/yancyfeng999-star/XuanJiAgentFlow/releases/download/v0.3.6/XuanJi_0.3.6_aarch64.dmg 下载后再比。

- [ ] **Step 2: 用户安装 DMG（推荐）**

1. 打开 `XuanJi_0.3.6_aarch64.dmg`。
2. 把「璇玑」拖到「应用程序」。
3. 若拦：系统设置 → 隐私与安全性 → 仍要打开。
4. 启动后看「关于」或设置 → 关于：版本必须是 **0.3.6**。

- [ ] **Step 3: 首屏验收（对照 0.3.6 UI 合同）**

必须同时成立：

1. 启动后立刻能看到左侧「工作区导航」和 52px「顶部运行栏」，**不是**全屏只剩一张 Coordinator 等待卡。
2. Coordinator 未就绪时画布是骨架，不是空白死页。
3. 顶栏只有一个主动作（解决阻塞 / 审核工作流 / 执行），其余进 overflow。
4. 未选任务时右侧检查器不占宽。

任一失败：记入 `docs/reviews/2026-08-19-036-closeout.md` 的缺陷表，**不要**改证据层级为 `runtime` 通过。

- [ ] **Step 4: 最小产品旅程（可用 Mock Planner，不发真实云请求）**

1. 设置里填一个可规划的模型，或沿用已有本地配置。
2. 新建项目 → 生成规划 → 画布出现任务卡。
3. 点「审核工作流」→ 勾选警告（若有）→ 确认审核 → 看到「已审核，编辑已冻结」。
4. 点执行（本机/Fake 节点即可）→ 顶栏状态变为「运行中」或「已完成」，**不能**停在「等待调度」假绿。

- [ ] **Step 5: 记录证据（未跑就不写通过）**

在 `docs/reviews/2026-08-19-036-closeout.md` 写入：

```markdown
## runtime / installed

- date:
- machine: macOS arm64, version …
- source: GitHub v0.3.6 DMG sha256 0527a955…
- about_version: 0.3.6
- gatekeeper: blocked then allowed / not blocked
- chrome_first_paint: pass/fail
- plan_review_execute: pass/fail
- independent_review: no
```

层级：本任务最多把 `installed` + `runtime` 标成已记录。`user_acceptance` 仍为 `acceptance_unknown`，除非用户明确说「验收通过」。

---

### Task A2: 隔离脏主仓，再快进到 `origin/main`

**授权：** 移动所有者资产并恢复已跟踪文件，然后 `git pull --ff-only`。

**Files:** 只动主仓工作区，不提交任何二进制。

隔离目录（固定名字，禁止写进仓库）：

`/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-local-stash-20260819/`

- [ ] **Step 1: 先复制再动（失败可回滚）**

```bash
MAIN="/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow"
STASH="/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-local-stash-20260819"
mkdir -p "$STASH/binaries"
cp -a "$MAIN/app/src-tauri/binaries/xuanji-coordinator" \
      "$MAIN/app/src-tauri/binaries/xuanji-coordinator-aarch64-apple-darwin" \
      "$STASH/binaries/"
test -d "$MAIN/build" && mv "$MAIN/build" "$STASH/build"
test -d "$MAIN/release/xuanji-0.3.4-20260814" && mv "$MAIN/release/xuanji-0.3.4-20260814" "$STASH/"
PLAN="$MAIN/docs/superpowers/plans/2026-08-19-xuanji-ui-performance-optimization.md"
test -f "$PLAN" && mv "$PLAN" "$STASH/"
ls -la "$STASH"
```

Expected: stash 里能看到两个 sidecar；主仓不再有 `?? build/` 和 `?? release/xuanji-0.3.4-20260814/`。

- [ ] **Step 2: 恢复已跟踪脏文件（仅这五条路径）**

```bash
git -C "$MAIN" checkout -- \
  app/src-tauri/binaries/xuanji-coordinator \
  app/src-tauri/binaries/xuanji-coordinator-aarch64-apple-darwin \
  "release/xuanji-0.3.1-20260811/" \
  "release/xuanji-0.3.2-20260811/" \
  "release/xuanji-0.3.3-20260811/"
git -C "$MAIN" status -sb
```

Expected: `## main...origin/main [behind 5]`，工作区干净。若还有别的改动：停，列出来问用户，禁止 `reset --hard`。

- [ ] **Step 3: 快进，禁止 merge commit、禁止 rebase 脏历史**

```bash
git -C "$MAIN" pull --ff-only origin main
git -C "$MAIN" rev-parse --short HEAD
git -C "$MAIN" status -sb
```

Expected: `HEAD=af50cf2`，`## main...origin/main`，干净。

- [ ] **Step 4: 确认 stash 仍在且未入库**

```bash
git -C "$MAIN" status --short
ls "$STASH/binaries"
```

Expected: 无未跟踪的 22MB 安装包被 `git add`。sidecar 只在 stash。

---

### Task A3: 活文档版本对齐到 0.3.6

**Files:**

- Modify: `README.md` 第 68–76 行附近
- Modify: `docs/OPERATIONS.md:9`
- Modify: `docs/PRODUCT.md:54`
- Modify: `docs/PRODUCT_DEFINITION.md:82`
- Modify: `docs/TECH_SHAPE.md:54`
- Modify: `docs/USER_JOURNEY.md:26`
- Modify: `docs/NAMING.md:22`
- Modify: `docs/EVIDENCE_INDEX.md`（追加，不改历史行）

不改：`docs/reviews/2026-08-1*.md`、旧 `docs/superpowers/plans/*`、`CHANGELOG.md` 里 0.3.3/0.3.4/0.3.5 历史段。

- [ ] **Step 1: 改 `README.md` 安装段标题与路径**

把：

```markdown
## 安装包（已验证的 0.3.3 历史资产）
...
当前源码与安装包版本为 **0.3.6**。以 GitHub Release `v0.3.6` 为准。

```text
release/xuanji-0.3.3-20260811/璇玑_0.3.3_aarch64.dmg
```
```

换成：

```markdown
## 安装包

当前源码与安装包版本为 **0.3.6**。以 [GitHub Release `v0.3.6`](https://github.com/yancyfeng999-star/XuanJiAgentFlow/releases/tag/v0.3.6) 为准。

- `XuanJi_0.3.6_aarch64.dmg`（推荐）
- `XuanJi-0.3.6.pkg`

历史 0.3.3 本地归档仍在 `release/xuanji-0.3.3-20260811/`，不是当前安装源。
```

- [ ] **Step 2: 改操作 / 产品 / 旅程 / 命名中的「当前包」**

`docs/OPERATIONS.md`：

```markdown
1. 打开 GitHub Release `v0.3.6` 的 `XuanJi_0.3.6_aarch64.dmg`（校验见 `release/README.md`）。
```

`docs/PRODUCT.md`：

```markdown
| 安装包示例 | `XuanJi_0.3.6_aarch64.dmg`（arm64） |
```

`docs/PRODUCT_DEFINITION.md`：

```markdown
| 安装包 0.3.6 | 当前 DMG / app 版本号（arm64） |
```

`docs/TECH_SHAPE.md`：

```markdown
| 产品 / 包版本 | 0.3.6（`XuanJi_0.3.6_aarch64.dmg`） |
```

`docs/USER_JOURNEY.md`：

```markdown
| 打开 `XuanJi_0.3.6_aarch64.dmg` | 挂载磁盘映像 |
```

`docs/NAMING.md`：

```markdown
| 包名示例 | `XuanJi_0.3.6_aarch64.dmg` | 编造版本 |
```

- [ ] **Step 3: 在 `EVIDENCE_INDEX.md` 第 3 节表**末尾追加一行（保留旧行）

```markdown
| 0.3.6 GitHub Release | `remote_release` | 2026-08-19 | `af50cf2` | `gh release view v0.3.6` | Latest；DMG `0527a955…` PKG `de2a5432…`；无 updater 签名资产 |
| 0.3.6 真机安装 | `installed` / `runtime` | （A1 填写） | 用户机器 | DMG 安装 + 关于页 0.3.6 | 未跑则写 `not_installed` |
```

- [ ] **Step 4: 本地 diff 自检**

```bash
git -C "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-036-closeout" diff --stat
rg -n "当前.*0\.3\.3|安装包 0\.3\.3|璇玑_0\.3\.3_aarch64\.dmg" \
  README.md docs/OPERATIONS.md docs/PRODUCT.md docs/PRODUCT_DEFINITION.md \
  docs/TECH_SHAPE.md docs/USER_JOURNEY.md docs/NAMING.md
```

Expected: 活文档不再把 0.3.3 写成「当前」。历史 CHANGELOG / reviews 仍可出现 0.3.3。

- [ ] **Step 5: 提交**

```bash
git -C "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-036-closeout" add \
  README.md docs/OPERATIONS.md docs/PRODUCT.md docs/PRODUCT_DEFINITION.md \
  docs/TECH_SHAPE.md docs/USER_JOURNEY.md docs/NAMING.md docs/EVIDENCE_INDEX.md
git -C "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-036-closeout" commit -m \
  "docs: point living install docs at GitHub Release v0.3.6"
```

---

### Task A4: 去掉审核 e2e 里无关的画布右键前奏

**根因：** `app/e2e/review-ack-stability.spec.ts` 名称是审核确认稳定性，却先建一个项目、对 `.react-flow__edge[data-id="research-write"]` 发固定坐标 `contextmenu(520,300)`。0.3.6 画布 `minZoom=0.62`、`onlyRenderVisibleElements`、检查器默认不占宽，边的屏幕位置变了。CI 上该菜单 15s 找不到；同文件后半段审核断言从未跑到。断线/删节点已由 `app/e2e/local-workflow.spec.ts:26` 覆盖。

**Files:**

- Modify: `app/e2e/review-ack-stability.spec.ts`
- Test: 同一文件 + `app/e2e/local-workflow.spec.ts`（回归，不改除非红）

- [ ] **Step 1: 先跑现有用例，确认本地能绿或能复现脆**

```bash
cd "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-036-closeout/app"
E2E_COORDINATOR_PORT=18190 E2E_VITE_PORT=5290 \
  npx playwright test e2e/review-ack-stability.spec.ts --reporter=list
```

记录退出码。绿或红都可以进入 Step 2——修的是耦合，不是「必须先红」。

- [ ] **Step 2: 删掉第一段画布前奏，测试从「审核确认项目」开始**

`app/e2e/review-ack-stability.spec.ts` 在 `ensureWorkspaceReady(page)` 之后直接进入现有的 `reviewProjectName` 段。完整测试体改为：

```typescript
test.describe('review acknowledgement stability', () => {
  test('same-snapshot reload keeps warning acknowledgement through UI review', async ({
    page,
    request,
  }) => {
    await ensureWorkspaceReady(page);

    const reviewProjectName = `审核确认稳定性 ${Date.now()}`;
    await createProjectViaUi(page, reviewProjectName);
    await openWorkflowPanel(page);
    await page.locator('#workflow-goal').fill('生成一份需要警告确认的研究报告');
    await page.getByRole('main', { name: '工作流画布' }).getByRole('button', { name: '生成规划' }).click();
    await expect(page.getByText(/工作流版本 \d+/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: '选择任务：资料研究' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: '选择任务：资料研究' }).click();
    const prompt = page.getByLabel('任务指令');
    await expect(prompt).toBeVisible();
    await prompt.fill('同快照重载后仍应保留警告确认');
    await page.getByRole('button', { name: '保存任务' }).click();
    await expect(page.locator('[data-save-state="saved"]')).toBeVisible();

    const projects = await (await request.get(`${coordinatorUrl()}/api/projects`)).json();
    const project = projects.find((item: { name: string }) => item.name === reviewProjectName);
    expect(project).toBeTruthy();
    const workflow = await (
      await request.get(`${coordinatorUrl()}/api/projects/${project.id}/workflow`)
    ).json();
    const research = workflow.tasks.find((task: { id: string }) => task.id === 'research');
    expect(research.prompt).toContain('同快照重载后仍应保留警告确认');
    expect(workflow.status).toBe('draft');

    await page.getByRole('button', { name: '审核工作流' }).click();
    const reviewDialog = page.getByRole('dialog', { name: '审核工作流' });
    await expect(reviewDialog).toBeVisible();
    const ack = reviewDialog.getByLabel('我已阅读并接受以上全部警告');
    await expect(ack).toBeVisible();
    await ack.check();
    await expect(ack).toBeChecked();
    const confirmReview = reviewDialog.getByRole('button', { name: '确认审核' });
    await expect(confirmReview).toBeEnabled();

    const reloadPrepared = reviewDialog.getByRole('button', { name: '重新加载审核' });
    await expect(reloadPrepared).toBeEnabled();
    const prepareResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST'
      && /\/api\/workflows\/[^/]+\/review\/prepare$/.test(new URL(response.url()).pathname),
    );
    await reloadPrepared.click();
    expect((await prepareResponse).ok()).toBeTruthy();
    await expect(ack).toBeChecked();
    await expect(confirmReview).toBeEnabled();

    await confirmReview.click();
    await expect(page.getByText('已审核，编辑已冻结')).toBeVisible({ timeout: 10_000 });
    const reviewed = await (
      await request.get(`${coordinatorUrl()}/api/projects/${project.id}/workflow`)
    ).json();
    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.id).toBe(workflow.id);
    expect(reviewed.review_snapshot_hash).toBeTruthy();
  });
});
```

保留文件顶部的 `createProjectViaUi` helper。

- [ ] **Step 3: 跑目标用例 + 画布菜单回归**

```bash
cd "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-036-closeout/app"
E2E_COORDINATOR_PORT=18191 E2E_VITE_PORT=5291 \
  npx playwright test e2e/review-ack-stability.spec.ts e2e/local-workflow.spec.ts --reporter=list
```

Expected: review-ack 1 passed；local-workflow 里「canvas context menus…」passed。失败则先看边是否可见，再考虑给 `local-workflow` 用 `boundingBox()` 点边，而不是把画布操作加回 review-ack。

- [ ] **Step 4: 提交**

```bash
git -C "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-036-closeout" add \
  app/e2e/review-ack-stability.spec.ts
git -C "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-036-closeout" commit -m \
  "test: stop coupling review-ack e2e to canvas edge menus"
```

---

### Task A5: 开 PR 合入 A3+A4（及 A1 证据，若已写）

**授权：** push 分支并开 PR。仍禁止 push `main`。

- [ ] **Step 1: 本地门禁（跳过 Tauri 构建）**

```bash
cd "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-036-closeout"
bash scripts/verify-all.sh --skip-tauri-build
```

Expected: 退出码 0。

- [ ] **Step 2: push + PR**

```bash
WT="/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-036-closeout"
git -C "$WT" push -u origin fix/xuanji-036-closeout
gh pr create --repo yancyfeng999-star/XuanJiAgentFlow --base main --head fix/xuanji-036-closeout \
  --title "docs+test: 0.3.6 收口文档与审核 e2e 去脆" \
  --body "$(cat <<'EOF'
## Summary
- 活文档的当前安装包改为 GitHub Release v0.3.6
- 审核确认 e2e 不再依赖画布右键菜单（该路径已由 local-workflow 覆盖）

## Test Plan
- [x] `bash scripts/verify-all.sh --skip-tauri-build`
- [ ] CI verify-all
EOF
)"
```

- [ ] **Step 3: CI 绿后 `gh pr merge --merge`。** 禁止在检查红时 `--admin`。合并后 `git -C "$MAIN" pull --ff-only origin main`（此时主仓应已在 A2 变干净）。

---

### Task A6（可选）: 20 次冷启动采样

**前置：** A1 已安装 0.3.6。

不做新的性能子系统。用已有 `readPerformanceSnapshot()` / `xuanji:shell_mounted`。若设置 → 诊断与帮助**没有**导出 snapshot 的按钮，本任务只做 20 次人工计时（从 Dock 点图标到导航可见），写入 closeout 文档：

```text
n=20
chrome_visible_s: [ … ]
p50:
p95:
notes: 非 WebView performance.now；壁钟。不得写成计划里的 200ms 门禁已在 App 上验证。
```

若要自动采样，另开任务：在诊断报告里追加 `JSON.stringify(readPerformanceSnapshot())`，并写 Vitest 断言「报告含 shell_mounted」。**不要**为了采样改首屏行为。

---

## Phase B — 应用内更新（有私钥才开工）

### 背景（不要猜）

- 客户端已有手动「检查更新」：`app/src/lib/updater.ts` → `@tauri-apps/plugin-updater`。
- 启动不自动更新：`isAutoUpdateEnabled()` 恒 false，`runSilentUpdate()` 空。
- Endpoint：`https://github.com/yancyfeng999-star/XuanJiAgentFlow/releases/latest/download/latest.json`
- 公钥已写死在 `app/src-tauri/tauri.conf.json`。**私钥必须能签出该公钥**，否则所有已装 0.3.1–0.3.6 都验签失败。
- 0.3.1–0.3.3 曾经走过真更新；0.3.5 / 0.3.6 Release **没有** updater 资产。
- 0.3.2 修过 AppleDouble：tar 里不能有 `._璇玑.app`，否则客户端报 `failed to unpack`。

### Task B0: 私钥存在性检查（不打印密钥）

- [ ] **Step 1: 只检查环境变量是否非空**

```bash
python3 - <<'PY'
import os
k = os.environ.get("TAURI_SIGNING_PRIVATE_KEY", "")
print("present" if len(k) > 20 else "missing")
print("password_set", bool(os.environ.get("TAURI_SIGNING_PRIVATE_KEY_PASSWORD")))
PY
```

Expected: `present`。若 `missing`：走 Task B3（丢钥），不要伪造 latest.json。

- [ ] **Step 2: 用户确认该钥就是 `tauri.conf.json` 里那把。** 不确定就当丢钥。

---

### Task B1: 给已发布的 0.3.6 补 updater 资产（不改版本号）

**授权：** 使用私钥；向已有 Release `v0.3.6` **追加**三个文件，不替换 DMG/PKG。

**Files:**

- 输入：worktree `app/src-tauri/target/release/bundle/macos/璇玑.app`
- 产出（不入库）：`xuanji.app.tar.gz`、`xuanji.app.tar.gz.sig`、`latest.json`
- Modify: `release/README.md` 增加「更新通道已补」一段（在资产上传成功后）

- [ ] **Step 1: 用 USTAR、禁 AppleDouble 打包**

```bash
APP="/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-ui-performance/app/src-tauri/target/release/bundle/macos/璇玑.app"
STAGE="/tmp/xuanji-036-updater"
rm -rf "$STAGE" && mkdir -p "$STAGE"
export COPYFILE_DISABLE=1
ditto --norsrc --noextattr --noqtn --noacl "$APP" "$STAGE/璇玑.app"
plutil -p "$STAGE/璇玑.app/Contents/Info.plist" | rg "CFBundleShortVersionString"
# 必须仍是 0.3.6
COPYFILE_DISABLE=1 tar -C "$STAGE" --format=ustar --no-xattrs --no-mac-metadata \
  -czf "$STAGE/xuanji.app.tar.gz" "璇玑.app"
python3 - <<'PY'
import tarfile
t=tarfile.open("/tmp/xuanji-036-updater/xuanji.app.tar.gz")
bad=[n for n in t.getnames() if "/._" in n or n.startswith("._")]
print("entries", len(t.getnames()), "appledouble", len(bad))
if bad: raise SystemExit(bad[:10])
PY
```

Expected: `appledouble 0`，版本 0.3.6。

- [ ] **Step 2: 签名（密钥只来自环境）**

```bash
# 在 closeout worktree 的 app 目录，使用已安装的 tauri CLI
cd "/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow-036-closeout/app"
npx tauri signer sign -f /tmp/xuanji-036-updater/xuanji.app.tar.gz
test -s /tmp/xuanji-036-updater/xuanji.app.tar.gz.sig
```

若 CLI 子命令名不同：`npx tauri signer --help` 后用实际 sign 命令。禁止把 `.sig` 正文贴进对话。

- [ ] **Step 3: 写 `latest.json`（结构对齐 0.3.3）**

```json
{
  "version": "0.3.6",
  "notes": "璇玑 0.3.6：首屏骨架、单主动作顶栏、运行 WebSocket 修复。",
  "pub_date": "2026-08-18T18:45:18Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<Step 2 签名文件全文，单行>",
      "url": "https://github.com/yancyfeng999-star/XuanJiAgentFlow/releases/download/v0.3.6/xuanji.app.tar.gz"
    }
  }
}
```

`signature` 字段必须是 `.sig` 文件内容，不是 SHA-256。

- [ ] **Step 4: 上传，不改 DMG/PKG**

```bash
gh release upload v0.3.6 \
  --repo yancyfeng999-star/XuanJiAgentFlow \
  /tmp/xuanji-036-updater/xuanji.app.tar.gz \
  /tmp/xuanji-036-updater/xuanji.app.tar.gz.sig \
  /tmp/xuanji-036-updater/latest.json
gh api repos/yancyfeng999-star/XuanJiAgentFlow/releases/tags/v0.3.6 --jq '[.assets[].name]'
```

Expected 名称集合包含：`XuanJi_0.3.6_aarch64.dmg`、`XuanJi-0.3.6.pkg`、`xuanji.app.tar.gz`、`xuanji.app.tar.gz.sig`、`latest.json`。

- [ ] **Step 5: 文档**

`release/README.md` 把「未上传 latest.json」改成「0.3.6 已提供手动更新通道；启动仍不自动更新」。提交走 `fix/xuanji-036-closeout` PR，不要改 tag。

---

### Task B2: 真机更新验收

**前置：** B1 完成；本机另有一份 **0.3.3 或 0.3.5** 安装（不要在唯一的 0.3.6 上测「发现自己」）。

- [ ] **Step 1:** 安装旧版 → 设置 → 更新 → 检查更新。
- [ ] **Step 2:** 预期约 45s 下载、退出、静默安装、重开；关于页变成 0.3.6。
- [ ] **Step 3:** 开一个运行中任务再点检查更新：必须 `run_blocked`，不退出。
- [ ] **Step 4:** 把结果写入 closeout 文档，层级 `update`。失败常见原因：AppleDouble、pubkey 不匹配、`latest.json` 不在 latest Release 根。

0.3.6 装好后再点「检查更新」必须显示已是最新。

---

### Task B3: 私钥丢失（仅当 B0 = missing）

不要给旧客户端发无法验签的 `latest.json`。

1. 生成**新** keypair（本地，不提交私钥）。
2. 升版本到 **0.3.7**：改 `app/package.json`、`app/src-tauri/Cargo.toml`、`app/src-tauri/tauri.conf.json` 的 `version` 与 `plugins.updater.pubkey`。
3. 用户必须**手动**装一次 0.3.7（旧包验不成新签）。
4. 之后的 0.3.8+ 才能走检查更新。
5. 单独 PR + 新 tag `v0.3.7`。禁止改写 `v0.3.6` 的 DMG/PKG。

---

## Phase C — Developer ID + 公证（有 Apple 账号才开工）

这是新的分发构建，版本号 **0.3.7**（若 B3 已用 0.3.7 则用 **0.3.8**）。不要公证完再覆盖 `v0.3.6`。

### Task C1: 证书与身份（只列名字，不导出 p12 到仓库）

- [ ] Developer ID Application: `Developer ID Application: <Team> (<TEAMID>)`
- [ ] Developer ID Installer: `Developer ID Installer: <Team> (<TEAMID>)`（PKG 用）
- [ ] `xcrun notarytool store-credentials` 配好 profile，例如 `xuanji-notary`
- [ ] 确认 `security find-identity -v -p codesigning` 看得到 Application 证

### Task C2: 签名构建

在隔离 worktree：

```bash
# 示例：用环境注入身份，具体以本机 keychain 为准
export APPLE_SIGNING_IDENTITY="Developer ID Application: …"
cd app && npm run build:tauri
codesign --verify --deep --strict --verbose=2 \
  "src-tauri/target/release/bundle/macos/璇玑.app"
spctl --assess --type execute -v \
  "src-tauri/target/release/bundle/macos/璇玑.app" || true
```

Expected: `codesign --verify` 通过；公证前提交 notary 之前 `spctl` 仍可能拒。

### Task C3: 公证 + Staple

```bash
xcrun notarytool submit "<DMG>" --keychain-profile xuanji-notary --wait
xcrun stapler staple "<DMG>"
xcrun stapler validate "<DMG>"
# PKG 同样 submit + staple
```

### Task C4: 发布新 tag，保留 v0.3.6

- `gh release create v0.3.7`（或 0.3.8）上传公证后的 DMG/PKG。
- 若 B 轨仍有效：同时传新的 `latest.json` 指向新 tar。
- 活文档改当前包名。`v0.3.6` 留作未公证历史。

### Task C5: 干净机器 / 另一用户验收 Gatekeeper

未公证前不得把 C 标成完成。`spctl --assess` 通过 + 另一账号双击无「仍要打开」才算 `update`/`installed` 升级。

---

## Phase D — 本计划明确不做

| 项 | 原因 |
|---|---|
| Win / Linux 桌面 | 3.0 范围外 |
| App Store | 需另一套签名与审核 |
| 真实云账号长压、真实 Hermes 长稳 | 外部账号与机器 |
| 未知主机指纹完整 UI 确认流 | 独立产品任务，不绑 0.3.6 收口 |
| 重写历史 reviews / 旧 plans | 会伪造当时事实 |
| 把 20 次冷启动 200ms 写成已在 App 验证 | 除非 A6 真测 |
| 重建 sidecar PyInstaller | 0.3.6 是 UI 发布，现有 Mach-O 已打进包 |
| 独立安全审计 / 威胁模型全文 | 未授权 |

未知主机指纹若要做：另开 spec，覆盖 `StrictHostKeyChecking=yes`、UI 展示指纹、用户确认后写入 `known_hosts`。不要塞进本 PR。

---

## 4. 完成定义（按层级，禁止混写）

| 层级 | 何时可以勾 |
|---|---|
| `source` | A5 合入 `main` |
| `test` | A4 + `verify-all --skip-tauri-build` 退出 0 + CI 绿 |
| `package` | 已有（v0.3.6 DMG/PKG） |
| `remote_release` | 已有 |
| `installed` / `runtime` | A1 真机记录 |
| `update` | B2 旧版→0.3.6 成功 |
| `user_acceptance` | 用户明确说验收 |
| 公证分发 | C5 |

---

## 5. 计划自检

**覆盖：** 前一轮列出的缺口（真机未装、更新通道、签名公证、脏 main、活文档 0.3.3、review-ack 脆、20 次采样、独立审核）都有对应任务或明确「不做 / 用户声明」。

**无占位：** 无 TBD；活文档替换句已写出；e2e 终态代码已写出；updater / notary 命令已写出。

**一致性：** 版本 0.3.6 已发布不覆盖；丢钥走 0.3.7；公证走 0.3.7/0.3.8。worktree 名 `XuanJiAgentFlow-036-closeout`，分支 `fix/xuanji-036-closeout`。

**风险：** B1 若钥与公钥不配，会让仍在用 0.3.3 的人「检查更新」失败——B0 不确定就不要上传 `latest.json`。

---

## 6. 执行方式（批准计划后选一个）

计划批准并写入仓库后：

1. **Subagent-Driven（推荐）** — 每任务一个新子代理，任务间复查  
2. **本会话按 executing-plans 推进** — 批量执行，检查点停下来给你看  

先做 Phase A。B/C 等你确认密钥或 Apple 账号再开。
