# XuanJi Final Remediation and Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复璇玑当前剩余的 E2E 隔离与审核确认非确定性问题，清理可直接处理的质量债务，并形成连续可复现的无 App 构建验收证据。

**Architecture:** 保留现有 React/Zustand/React Flow、FastAPI、SQLite、Tauri 架构，仅修改测试栈生命周期、审核弹窗的快照确认状态和直接相关的质量门禁。验证使用全新的 Coordinator/Vite 端口和临时数据目录，所有桌面 App 构建、安装、签名、公证与 Release 操作继续隔离。

**Tech Stack:** React 19、TypeScript 6、Zustand 5、Playwright、Vitest、Vite、FastAPI、pytest、Rust、Cargo、Tauri 2、Git、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-08-14-xuanji-codex-style-product-foundation-design.md`

## Global Constraints

- 仓库范围仅限 `/Users/yancyfeng/Desktop/Mac Dpxx项目/自研软件/XuanJiAgentFlow`，不得读取或修改相邻项目。
- 当前基线为 `main == origin/main == 59c5e196939fcb20be5cdc31d7fabb74009ababb`；执行前必须重新确认，不得用旧 SHA 代替。
- 当前工作区不是干净候选，必须原样保护以下所有者资产：
  - modified：`app/src-tauri/binaries/xuanji-coordinator`
  - modified：`app/src-tauri/binaries/xuanji-coordinator-aarch64-apple-darwin`
  - untracked：`build/`
  - untracked：`release/xuanji-0.3.4-20260814/`
- 禁止清理、恢复、覆盖、暂存或提交上述二进制和构建资产；禁止 `git reset --hard`、`git checkout --`、`git clean` 和递归删除。
- 用户明确要求不要构建或启动 App。禁止运行 `npm run tauri`、`npm run build:tauri`、`tauri build`，禁止启动 `.app`、安装 DMG/PKG 或向 `/Applications` 写入。
- 允许运行 Vitest、Playwright 浏览器测试、pytest、Python compileall、`cargo test`、`cargo check` 和 Vite 浏览器 build。
- 不发真实 OpenAI 请求，不读取 Keychain、API Key、SSH 私钥或签名证书；测试继续使用 MockTransport、FakeNode 和临时数据库。
- 本计划默认 local-only。未经用户新的明确授权，不 push、不创建 PR、不合并、不更新 tag、不创建 GitHub Release、不上传安装包。
- 不把单项测试通过写成全量门禁通过；不把 GitHub `main` 已合并写成 `0.3.4` 已发布。
- Owner 自检不算独立审核。若 Grok 同时实现和检查，最终状态必须写“实现者自检”，不能写“独立审核通过”。

---

## 0. 已确认的起始事实

### 0.1 2026-08-18 新鲜验证

| 门禁 | 结果 |
|---|---|
| 开源文档检查 | 通过 |
| Backend pytest | 200 passed，10 warnings |
| Node Agent pytest | 29 passed，1 warning |
| Frontend Vitest | 97 passed |
| Production dependency audit | 0 vulnerabilities |
| Frontend lint | 退出码 0，8 warnings |
| TypeScript + Vite browser build | 通过；主 JS chunk 约 515.68 kB |
| Python compileall | 通过 |
| Cargo tests | 16 passed |
| Cargo check | 通过；3 组 dead-code warnings |
| 默认端口完整 E2E | 19/31 通过，12 失败；复用了陈旧服务，结果不可信 |
| 新端口完整 E2E | 30/31 通过；主 UI 审核确认流程顺序相关失败 |
| 失败主 UI 用例单独复跑 | 1/1 通过，证明存在非确定性/共享状态问题 |

### 0.2 已确认的两个阻断根因范围

1. 默认端口 `18080` 存在从 2026-08-14 遗留的 `scripts/e2e_stack.py` 进程；`app/playwright.config.ts` 使用 `reuseExistingServer: !process.env.CI`，本地门禁会无条件复用陈旧服务。
2. `ReviewWorkspace` 使用布尔值 `acknowledged`，`reload()` 每次先执行 `setAcknowledged(false)`。完整测试顺序中，用户勾选警告确认后状态会被重新加载路径清除，导致“确认审核”持续 disabled；单测和单用例没有稳定覆盖该顺序。

### 0.3 远端与发布状态

- PR #1 已于 2026-08-14 合并，GitHub Actions 当时成功。
- PR #1 没有 Reviewer、Review Decision 或 review comments。
- GitHub 最新 Release 是 `v0.3.3`；`0.3.4` 仅为源码和本地未跟踪安装资产，不是远端 Release。
- 原计划 `docs/superpowers/plans/2026-08-14-xuanji-codex-style-product-foundation.md` 仍有 177 个未勾选步骤；不得在没有历史证据时批量改成已完成。

---

### Task 0: 冻结基线并保护所有者资产

**Files:**

- Read: `AGENTS.md`（若仓库内存在）
- Read: `docs/CURRENT_STATE.md`
- Read: `docs/EVIDENCE_INDEX.md`
- Read: `docs/reviews/2026-08-14-codex-style-implementation-review.md`
- Read: `docs/superpowers/plans/2026-08-14-xuanji-codex-style-product-foundation.md`
- Create: `docs/reviews/2026-08-18-final-remediation-baseline.md`

**Interfaces:**

- Consumes: Git HEAD、工作区状态、端口监听状态、现有 SHA-256 清单。
- Produces: 一份不可争议的基线记录，供后续每个任务确认没有误碰二进制和安装资产。

- [ ] **Step 1: 记录 Git 与脏资产状态**

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git diff --stat
```

Expected：HEAD 和 `origin/main` 均为 `59c5e196939fcb20be5cdc31d7fabb74009ababb`；只看到两个 modified sidecar、`build/` 和 `release/xuanji-0.3.4-20260814/`。

- [ ] **Step 2: 记录受保护资产哈希，不读取秘密**

```bash
shasum -a 256 \
  app/src-tauri/binaries/xuanji-coordinator \
  app/src-tauri/binaries/xuanji-coordinator-aarch64-apple-darwin \
  release/xuanji-0.3.4-20260814/璇玑-0.3.4.pkg \
  release/xuanji-0.3.4-20260814/璇玑_0.3.4_aarch64.dmg
```

Expected current values：

```text
0313f0c41569002150395a6dad598006fb2b40a3776752651537745ea1d0a823  app/src-tauri/binaries/xuanji-coordinator
0313f0c41569002150395a6dad598006fb2b40a3776752651537745ea1d0a823  app/src-tauri/binaries/xuanji-coordinator-aarch64-apple-darwin
0faebfe8736a136d89addb90632caf1100a170c708226559a50b98e9b55c0b8f  release/xuanji-0.3.4-20260814/璇玑-0.3.4.pkg
0ff5dca38f4653389b8af4385390af52d2c6337ddb540619bdfc58e754485ac2  release/xuanji-0.3.4-20260814/璇玑_0.3.4_aarch64.dmg
```

如果值不同，只记录实际值并停止修改重叠资产；不得恢复为这里的旧哈希。

- [ ] **Step 3: 记录陈旧 E2E 服务**

```bash
lsof -nP -iTCP:18080 -sTCP:LISTEN
ps -axo pid,ppid,lstart,command | rg 'e2e_stack.py|vite.*5173' | rg -v 'rg '
```

Expected：如果仍存在陈旧服务，命令必须明确指向当前仓库的 `scripts/e2e_stack.py --coordinator-port 18080`。

- [ ] **Step 4: 写基线文档**

在 `docs/reviews/2026-08-18-final-remediation-baseline.md` 写入：SHA、分支、脏资产、哈希、监听进程、允许命令、禁止命令、当前 30/31 E2E 结果和远端最新 Release `v0.3.3`。

- [ ] **Step 5: 校验本任务没有暂存任何所有者资产**

```bash
git diff --cached --name-only
git status --short
```

Expected：暂存区为空；受保护资产状态与 Step 1 一致。

- [ ] **Step 6: 只提交基线文档（仅在用户或执行环境允许本地提交时）**

```bash
git add docs/reviews/2026-08-18-final-remediation-baseline.md
git diff --cached --check
git commit -m "docs: record final remediation baseline"
```

如果没有本地提交授权，保留文档未提交并继续；不得把二进制或 `release/` 加入提交。

---

### Task 1: 让 Playwright 与 verify-all 默认使用全新测试栈

**Files:**

- Modify: `app/playwright.config.ts`
- Modify: `scripts/verify-all.sh`
- Create: `app/src/__tests__/e2e-isolation-contract.test.ts`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/OPEN_SOURCE.md`

**Interfaces:**

- Consumes: `E2E_COORDINATOR_PORT`、`E2E_VITE_PORT`、`E2E_COORDINATOR_URL`。
- Produces: `E2E_REUSE_EXISTING_SERVER=1` 才允许复用服务；默认门禁始终启动并回收自己的 Coordinator 与 Vite 子进程。

- [ ] **Step 1: 写失败的配置合同测试**

创建 `app/src/__tests__/e2e-isolation-contract.test.ts`：

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('E2E isolation contract', () => {
  it('does not reuse an existing server unless explicitly requested', () => {
    const config = fs.readFileSync(path.join(root, 'app/playwright.config.ts'), 'utf8');
    expect(config).toContain("process.env.E2E_REUSE_EXISTING_SERVER === '1'");
    expect(config).not.toContain('reuseExistingServer: !process.env.CI');
  });

  it('allocates coordinator and Vite ports for the full local gate', () => {
    const script = fs.readFileSync(path.join(root, 'scripts/verify-all.sh'), 'utf8');
    expect(script).toContain('find_free_port');
    expect(script).toContain('export E2E_COORDINATOR_PORT');
    expect(script).toContain('export E2E_VITE_PORT');
    expect(script).toContain('export E2E_COORDINATOR_URL');
  });
});
```

- [ ] **Step 2: 运行测试并确认失败原因正确**

```bash
cd app && npm test -- src/__tests__/e2e-isolation-contract.test.ts
```

Expected：FAIL，指出旧 `reuseExistingServer: !process.env.CI` 和动态端口合同缺失。

- [ ] **Step 3: 修改 Playwright 复用策略**

在 `app/playwright.config.ts` 定义：

```ts
const reuseExistingServer = process.env.E2E_REUSE_EXISTING_SERVER === '1';
```

两个 `webServer` 项统一改为：

```ts
reuseExistingServer,
```

默认值必须为 false；只有开发者明确设置 `E2E_REUSE_EXISTING_SERVER=1` 才能复用。

- [ ] **Step 4: 为 verify-all 分配独立端口**

在 `scripts/verify-all.sh` 的 E2E 分支、调用 `npm run test:e2e` 前加入：

```bash
find_free_port() {
  "$PY" -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

export E2E_COORDINATOR_PORT="${E2E_COORDINATOR_PORT:-$(find_free_port)}"
export E2E_VITE_PORT="${E2E_VITE_PORT:-$(find_free_port)}"
export E2E_COORDINATOR_URL="http://127.0.0.1:${E2E_COORDINATOR_PORT}"
export E2E_REUSE_EXISTING_SERVER=0
```

分配后断言两个端口不相等；相等时重新分配 Vite 端口。

- [ ] **Step 5: 安全处理旧 18080 服务**

先重新运行：

```bash
lsof -nP -iTCP:18080 -sTCP:LISTEN
e2e_pid="$(lsof -nP -iTCP:18080 -sTCP:LISTEN -t | head -1)"
test -n "$e2e_pid"
ps -p "$e2e_pid" -o pid,ppid,lstart,command
```

只有命令仍精确匹配本仓库 `scripts/e2e_stack.py --coordinator-port 18080` 时，才执行：

```bash
kill -TERM "$e2e_pid"
```

等待最多 10 秒后确认端口关闭。不要硬编码历史 PID，不要用 `kill -9` 作为第一步，不要终止其他项目进程。

- [ ] **Step 6: 更新贡献文档**

在 `CONTRIBUTING.md` 和 `docs/OPEN_SOURCE.md` 说明：默认 E2E 自建并销毁隔离栈；仅调试时可显式设置 `E2E_REUSE_EXISTING_SERVER=1`，复用前必须确认端口和数据目录。

- [ ] **Step 7: 运行目标测试**

```bash
cd app && npm test -- src/__tests__/e2e-isolation-contract.test.ts
```

Expected：PASS。

- [ ] **Step 8: 连续运行两次轻量 E2E，确认无残留复用**

```bash
cd app && npm run test:e2e -- e2e/onboarding.spec.ts e2e/review-workflow.spec.ts
cd app && npm run test:e2e -- e2e/onboarding.spec.ts e2e/review-workflow.spec.ts
```

Expected：两次都启动各自的 `E2E_STACK_READY`，两次都通过；第二次不能复用第一次的数据目录。

- [ ] **Step 9: 检查进程回收**

```bash
ps -axo pid,ppid,lstart,command | rg 'scripts/e2e_stack.py' | rg -v 'rg ' || true
```

Expected：没有由本任务新启动且仍存活的 E2E stack。

- [ ] **Step 10: 提交**

```bash
git add app/playwright.config.ts scripts/verify-all.sh app/src/__tests__/e2e-isolation-contract.test.ts CONTRIBUTING.md docs/OPEN_SOURCE.md
git diff --cached --check
git commit -m "test: isolate local Playwright stacks"
```

---

### Task 2: 修复审核警告确认状态被同快照重载清除

**Files:**

- Modify: `app/src/features/workflow/ReviewWorkspace.tsx`
- Modify: `app/src/features/workflow/__tests__/ReviewWorkspace.test.tsx`
- Modify: `app/e2e/local-workflow.spec.ts`
- Create: `app/e2e/review-ack-stability.spec.ts`

**Interfaces:**

- Consumes: `ReviewPrepareResult.snapshot_hash`、`ReviewPrepareResult.warnings`、`reviewWorkflow(snapshotHash, acknowledgedWarnings)`。
- Produces: `acknowledgedSnapshotHash: string | null`；同一快照的后台重载保留用户确认，新快照强制重新确认。

- [ ] **Step 1: 写单元回归测试**

在 `ReviewWorkspace.test.tsx` 增加两个用例：

```ts
it('keeps acknowledgement when the same prepared snapshot is delivered again', async () => {
  render(<ReviewWorkspace onClose={vi.fn()} />);
  const checkbox = await screen.findByLabelText('我已阅读并接受以上全部警告');
  fireEvent.click(checkbox);
  expect(screen.getByRole('button', { name: '确认审核' })).toBeEnabled();

  vi.mocked(client.prepareReview).mockResolvedValue({ ...prepared });
  fireEvent.click(screen.getByRole('button', { name: '重新加载审核' }));
  await waitFor(() => expect(client.prepareReview).toHaveBeenCalledTimes(2));
  expect(checkbox).toBeChecked();
  expect(screen.getByRole('button', { name: '确认审核' })).toBeEnabled();
});

it('requires acknowledgement again when the snapshot hash changes', async () => {
  render(<ReviewWorkspace onClose={vi.fn()} />);
  fireEvent.click(await screen.findByLabelText('我已阅读并接受以上全部警告'));
  vi.mocked(client.prepareReview).mockResolvedValue({ ...prepared, snapshot_hash: 'c'.repeat(64) });
  fireEvent.click(screen.getByRole('button', { name: '重新加载审核' }));
  await waitFor(() => expect(client.prepareReview).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('我已阅读并接受以上全部警告')).not.toBeChecked();
  expect(screen.getByRole('button', { name: '确认审核' })).toBeDisabled();
});
```

为测试和用户恢复增加“重新加载审核”按钮，只在 prepared 已存在时可用；文案加入中英文消息表。

使用稳定消息键：中文 `review.reloadPrepared = 重新加载审核`，英文 `review.reloadPrepared = Reload review`。

- [ ] **Step 2: 运行测试并确认至少一个新用例失败**

```bash
cd app && npm test -- src/features/workflow/__tests__/ReviewWorkspace.test.tsx
```

Expected：旧布尔状态在 reload 时被清除，或新 reload 控件尚不存在。

- [ ] **Step 3: 用快照哈希绑定确认状态**

将：

```ts
const [acknowledged, setAcknowledged] = useState(false);
```

替换为：

```ts
const [acknowledgedSnapshotHash, setAcknowledgedSnapshotHash] = useState<string | null>(null);
const acknowledged = prepared !== null && acknowledgedSnapshotHash === prepared.snapshot_hash;
```

复选框改为：

```tsx
checked={acknowledged}
onChange={(event) => {
  setAcknowledgedSnapshotHash(event.target.checked && prepared ? prepared.snapshot_hash : null);
}}
```

- [ ] **Step 4: 让 reload 只在快照变化时清除确认**

用请求序号避免较旧 prepare 响应覆盖较新响应：

```ts
const prepareRequestRef = useRef(0);

const reload = useCallback(async () => {
  setStale(false);
  const requestId = ++prepareRequestRef.current;
  const nextPrepared = await prepareReview();
  if (requestId !== prepareRequestRef.current) return;
  setPrepared(nextPrepared);
  setAcknowledgedSnapshotHash((current) =>
    current === nextPrepared?.snapshot_hash ? current : null,
  );
}, [prepareReview]);
```

不得在请求发出前无条件 `setAcknowledged(false)`。

- [ ] **Step 5: 强化主 UI E2E 断言**

在 `app/e2e/local-workflow.spec.ts` 的审核步骤中改为：

```ts
if (await ack.count()) {
  await ack.check();
  await expect(ack).toBeChecked();
}
const confirmReview = reviewDialog.getByRole('button', { name: '确认审核' });
await expect(confirmReview).toBeEnabled();
await confirmReview.click();
```

这样失败会在确认状态处立即报告，不再等待 90 秒。

- [ ] **Step 6: 写顺序稳定性 E2E**

`review-ack-stability.spec.ts` 使用同一个隔离测试栈连续完成：

1. 创建第一个项目并执行画布断线/删节点操作。
2. 创建第二个项目，生成工作流。
3. 编辑并保存任务指令。
4. 打开审核、勾选警告确认。
5. 触发一次同快照审核准备刷新。
6. 断言复选框仍 checked、确认按钮 enabled。
7. 确认审核并断言工作流进入 reviewed。

不得跳过 UI 改用 API 审核。

- [ ] **Step 7: 运行单元与目标 E2E**

```bash
cd app && npm test -- src/features/workflow/__tests__/ReviewWorkspace.test.tsx
cd app && npm run test:e2e -- e2e/review-ack-stability.spec.ts e2e/local-workflow.spec.ts e2e/review-workflow.spec.ts
```

Expected：全部通过，主 UI 用例不再出现 disabled 超时。

- [ ] **Step 8: 连续复跑目标 E2E 两次**

```bash
cd app && npm run test:e2e -- e2e/review-ack-stability.spec.ts e2e/local-workflow.spec.ts
cd app && npm run test:e2e -- e2e/review-ack-stability.spec.ts e2e/local-workflow.spec.ts
```

Expected：两轮全部通过。

- [ ] **Step 9: 提交**

```bash
git add app/src/features/workflow/ReviewWorkspace.tsx app/src/features/workflow/__tests__/ReviewWorkspace.test.tsx app/e2e/local-workflow.spec.ts app/e2e/review-ack-stability.spec.ts app/src/lib/messages.zh-CN.ts app/src/lib/messages.en.ts
git diff --cached --check
git commit -m "fix: preserve review acknowledgement for the active snapshot"
```

---

### Task 3: 清理直接可修的前端依赖与 lint 警告

**Files:**

- Modify: `app/package-lock.json`
- Modify: `app/e2e/node-setup.spec.ts`
- Modify: `app/e2e/recovery.spec.ts`
- Create: `app/src/features/runs/taskLogRedaction.ts`
- Modify: `app/src/features/runs/TaskLog.tsx`
- Modify: `app/src/features/runs/__tests__/redaction.test.ts`
- Create: `app/src/lib/i18n-core.ts`
- Create: `app/src/lib/i18n-context.ts`
- Create: `app/src/lib/I18nProvider.tsx`
- Replace: `app/src/lib/i18n.tsx` → `app/src/lib/i18n.ts`
- Modify: `app/src/App.tsx`
- Modify: `app/src/features/settings/__tests__/SettingsShell.test.tsx`
- Modify: `app/src/features/settings/__tests__/UpdateSettings.test.tsx`
- Modify: `app/src/features/inspector/__tests__/Inspector.test.tsx`
- Modify: `app/src/features/thinking-models/__tests__/ThinkingModels.test.tsx`
- Modify: `app/src/features/support/__tests__/RecoveryPanel.test.tsx`
- Modify: `app/src/features/navigation/__tests__/WorkspaceNav.test.tsx`
- Modify: `app/src/features/canvas/__tests__/TaskNode.test.tsx`

**Interfaces:**

- Consumes: 现有 `Locale`、`getLocale`、`hasMessage`、`translate`、`useI18n`、`useT` 导出名。
- Produces: 与现有调用方完全相同的公共 i18n API；组件文件仅导出 React component，工具文件不含 JSX。

- [ ] **Step 1: 固定当前警告清单**

```bash
cd app && npm run lint 2>&1 | tee /tmp/xuanji-lint-before.txt
```

Expected：8 条 warnings，至少包含 node-setup unused request、recovery unused run、TaskLog only-export-components、i18n only-export-components。

- [ ] **Step 2: 修复 nanoid 开发依赖漏洞**

```bash
cd app && npm update nanoid
cd app && npm ls nanoid
cd app && npm audit
```

Expected：`nanoid >= 3.3.18`；完整 `npm audit` 为 0 vulnerabilities。不得使用 `npm audit fix --force`。

- [ ] **Step 3: 修复两个 E2E unused 变量**

- `app/e2e/node-setup.spec.ts`：从不使用 request 的测试参数中删除 `request`。
- `app/e2e/recovery.spec.ts`：如果 `run` 只用于创建副作用，改成 `await apiCreateRun(...)`；如果后续合同应核对 run，则增加明确断言后保留变量。

- [ ] **Step 4: 拆出日志脱敏工具**

将 `SECRET_PATTERNS`、`redactLogText()` 和仅用于格式化的纯函数移动到 `taskLogRedaction.ts`。`TaskLog.tsx` 只默认导出组件；`redaction.test.ts` 从新文件导入。

- [ ] **Step 5: 拆分 i18n 组件与工具**

- `i18n-core.ts`：导出 `Locale`、`getLocale`、`hasMessage`、`translate`。
- `i18n-context.ts`：导出 `I18nContext` 和 `I18nContextValue`。
- `I18nProvider.tsx`：只默认导出 `I18nProvider` 组件。
- `i18n.ts`：重新导出 core，并导出 `useI18n()`、`useT()`；不得包含 JSX 或组件。
- `App.tsx` 和测试改为从 `./lib/I18nProvider` 导入 Provider；其余 `../../lib/i18n` 调用保持公共 API 不变。

- [ ] **Step 6: 运行目标测试**

```bash
cd app && npm test -- src/features/runs/__tests__/redaction.test.ts src/__tests__/AppShell.test.tsx src/features/settings/__tests__/SettingsShell.test.tsx
```

Expected：全部通过。

- [ ] **Step 7: 运行 lint 与完整 audit**

```bash
cd app && npm run lint
cd app && npm audit
```

Expected：0 errors、0 warnings、0 vulnerabilities。

- [ ] **Step 8: 运行浏览器 build**

```bash
cd app && npm run build -- --outDir /tmp/xuanji-grok-browser-dist
```

Expected：TypeScript 和 Vite 退出码 0。若仍有约 516 kB chunk warning，只记录为后续代码分割债务，不为消除单一警告进行全局路由重构。

- [ ] **Step 9: 提交**

```bash
git add app/package-lock.json app/e2e/node-setup.spec.ts app/e2e/recovery.spec.ts app/src/features/runs/taskLogRedaction.ts app/src/features/runs/TaskLog.tsx app/src/features/runs/__tests__/redaction.test.ts app/src/lib/i18n-core.ts app/src/lib/i18n-context.ts app/src/lib/I18nProvider.tsx app/src/lib/i18n.ts app/src/App.tsx app/src/features/settings/__tests__/SettingsShell.test.tsx app/src/features/settings/__tests__/UpdateSettings.test.tsx app/src/features/inspector/__tests__/Inspector.test.tsx app/src/features/thinking-models/__tests__/ThinkingModels.test.tsx app/src/features/support/__tests__/RecoveryPanel.test.tsx app/src/features/navigation/__tests__/WorkspaceNav.test.tsx app/src/features/canvas/__tests__/TaskNode.test.tsx
git add -u app/src/lib/i18n.tsx
git diff --cached --name-only
```

检查输出不得包含受保护二进制、`build/` 或 `release/`，然后：

```bash
git diff --cached --check
git commit -m "chore: clear frontend audit and lint debt"
```

---

### Task 4: 加固真实性能与画布清晰度证据

**Files:**

- Modify: `app/src/__tests__/render-performance.test.tsx`
- Modify: `app/e2e/canvas-clarity.spec.ts`
- Modify: `docs/ACCESSIBILITY_CHECKLIST.md`

**Interfaces:**

- Consumes: 真实 `TaskNode`、Zustand store、React Flow node data、Playwright 2x DPR。
- Produces: 真实组件重绘回归测试和可比较的 hover/selected 2x 截图，而不是只测试通用 memo Probe。

- [ ] **Step 1: 替换通用 Probe 性能测试**

当前 `render-performance.test.tsx` 只证明 React `memo` 本身工作。改为挂载真实 `TaskNode`，使用 React Profiler 或测试渲染计数，断言：

1. 选中任务 A 时，任务 B 的 data、selected、attempt 未变化，不触发 B 的 committed render。
2. 更新思考模型 pending action 不改变 TaskNode 渲染计数。
3. 更新任务 B 的 attempt 时只允许 B 重绘。

- [ ] **Step 2: 运行测试并确认旧测试无法证明上述合同**

```bash
cd app && npm test -- src/__tests__/render-performance.test.tsx
```

Expected：新真实组件断言在未完成夹具/隔离前失败。

- [ ] **Step 3: 使用最小 selector/memo 调整通过测试**

只在测试证明必要时修改 `TaskNode.tsx` 或 `WorkflowCanvas.tsx`。优先保持：

```ts
useWorkspaceStore((state) => state.taskAttempts[data.id])
```

不得重新订阅整个 `workspaceStore`，不得为了测试引入产品运行时计数器。

- [ ] **Step 4: 增加截图基线断言**

`canvas-clarity.spec.ts` 已使用 `deviceScaleFactor: 2` 并生成截图。将 hover 和 selected 改为稳定裁剪区域的 `toHaveScreenshot()`：

```ts
await expect(card).toHaveScreenshot('task-card-hover-2x.png', {
  animations: 'disabled',
});
await card.click();
await expect(card).toHaveScreenshot('task-card-selected-2x.png', {
  animations: 'disabled',
});
```

继续断言 computed transform 为 `none` 或单位矩阵。截图基线只能在确认文字没有位移、重影和异常粗细后接受。

- [ ] **Step 5: 运行性能与清晰度测试**

```bash
cd app && npm test -- src/__tests__/render-performance.test.tsx
cd app && npm run test:e2e -- e2e/canvas-clarity.spec.ts
```

Expected：全部通过，并生成稳定 2x snapshot evidence。

- [ ] **Step 6: 更新无障碍清单**

记录自动化只覆盖浏览器 2x DPR、键盘、reduced-motion；真实 macOS VoiceOver、原生缩放和 App WebView 仍是 `not_runtime_verified`。

- [ ] **Step 7: 提交**

```bash
git add app/src/__tests__/render-performance.test.tsx app/e2e/canvas-clarity.spec.ts app/e2e/canvas-clarity.spec.ts-snapshots docs/ACCESSIBILITY_CHECKLIST.md
git diff --cached --check
git commit -m "test: strengthen canvas clarity and render evidence"
```

---

### Task 5: 连续执行两轮完整无 App 门禁

**Files:**

- Modify only after success: `docs/reviews/2026-08-14-codex-style-implementation-review.md`
- Modify only after success: `docs/EVIDENCE_INDEX.md`
- Modify only after success: `docs/CURRENT_STATE.md`
- Create: `docs/reviews/2026-08-18-final-remediation-verification.md`

**Interfaces:**

- Consumes: Tasks 1–4 的提交、动态 E2E 端口、现有 verify-all。
- Produces: 两次连续通过的原始命令、计数、退出码、SHA 和仍未验证层级。

- [ ] **Step 1: 确认只存在允许的源码改动和原有受保护资产**

```bash
git status --short --branch
git diff --check
```

- [ ] **Step 2: 第一轮完整门禁**

```bash
bash scripts/verify-all.sh --skip-tauri-build
```

Expected：退出码 0，E2E 32/32 或实际新增测试后的完整数量全部通过，最后明确显示 Tauri build SKIPPED。

- [ ] **Step 3: 检查第一轮没有残留测试栈**

```bash
ps -axo pid,ppid,lstart,command | rg 'scripts/e2e_stack.py' | rg -v 'rg ' || true
```

Expected：无本轮新残留进程。

- [ ] **Step 4: 第二轮完整门禁**

```bash
bash scripts/verify-all.sh --skip-tauri-build
```

Expected：再次退出码 0；必须使用不同临时数据目录，不能复用第一轮 Coordinator。

- [ ] **Step 5: 单独执行完整 E2E 第三次作为稳定性样本**

```bash
cd app && npm run test:e2e
```

Expected：退出码 0，无 disabled timeout、409 级联或 strict locator 冲突。

- [ ] **Step 6: 记录警告而不隐藏**

验证文档必须分别记录：

- pytest warning 数量和类型；
- Rust dead-code warning 是否仍存在；
- Vite chunk warning 是否仍存在；
- production audit 与 full audit 结果；
- Tauri/App 构建明确 SKIPPED。

- [ ] **Step 7: 更新证据文档**

只在两轮完整门禁和第三次 E2E 都成功后，更新：

- `docs/reviews/2026-08-18-final-remediation-verification.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/CURRENT_STATE.md`
- 原 2026-08-14 review 增加 superseded 链接，不删除历史失败/未验证声明。

每条证据写入：日期、完整 SHA、macOS/架构、命令、退出码、测试数量、警告和证据层级。

- [ ] **Step 8: 不追填无法证明的历史复选框**

不要把原计划 177 项批量改成 `[x]`。在原计划顶部增加“完成度证据见 2026-08-18 verification”的链接，并增加一个按 Task 0–13 的完成矩阵：`source_present / tests_passed / runtime_unverified / release_unverified`。

- [ ] **Step 9: 提交验证文档**

```bash
git add docs/reviews/2026-08-18-final-remediation-verification.md docs/reviews/2026-08-14-codex-style-implementation-review.md docs/EVIDENCE_INDEX.md docs/CURRENT_STATE.md docs/superpowers/plans/2026-08-14-xuanji-codex-style-product-foundation.md
git diff --cached --check
git commit -m "test: record stable product foundation verification"
```

---

### Task 6: 独立审核交接，不冒充发布

**Files:**

- Create: `docs/reviews/2026-08-18-final-remediation-independent-review.md`
- Read: all commits produced by Tasks 0–5

**Interfaces:**

- Consumes: 固定候选 SHA、两轮完整门禁证据和 dirty asset baseline。
- Produces: Reviewer/QA 的独立 verdict；Owner/Grok 自检不得填写独立通过。

- [ ] **Step 1: 固定审核范围**

```bash
git log --oneline --decorate -12
git diff 59c5e196939fcb20be5cdc31d7fabb74009ababb..HEAD --stat
git diff 59c5e196939fcb20be5cdc31d7fabb74009ababb..HEAD -- app/playwright.config.ts scripts/verify-all.sh app/src/features/workflow app/e2e app/src/lib app/src/features/runs docs
```

- [ ] **Step 2: Reviewer 检查 E2E 隔离**

- 默认不能复用现有端口服务。
- 连续门禁使用不同 data directory。
- 失败时清理自己的子进程。
- 不终止其他项目进程。
- CI 与本地使用同一默认隔离语义。

- [ ] **Step 3: Reviewer 检查审核状态合同**

- 同一 snapshot hash 重载保留已确认状态。
- snapshot hash 改变后必须重新确认。
- blocker 永远不能靠勾选 warning 绕过。
- stale snapshot 仍返回稳定 409 并允许重新加载。
- pending review 只禁用当前审核动作，不锁死整个应用。

- [ ] **Step 4: Reviewer 检查边界**

- 没有修改、暂存或提交受保护二进制、`build/`、`release/`。
- 没有真实 OpenAI 调用或凭证泄露。
- 没有 Tauri App build、启动、安装或 Release。
- `0.3.4` 仍明确标为源码候选，不是用户已安装版本。

- [ ] **Step 5: 写审核结论**

独立审核文档只能使用：

```text
PASS
PASS_WITH_NON_BLOCKING_DEBT
FAIL
```

每个结论必须附具体 SHA、命令和发现。若 Grok 本人完成实现且无人独立复核，文档状态写：

```text
NOT_INDEPENDENTLY_REVIEWED — owner self-check only
```

- [ ] **Step 6: 不执行发布动作**

审核结束后停止。本计划不执行 push、PR、merge、版本升级、GitHub Release、DMG/PKG 重建、真实 updater 或用户安装。

---

## Final Acceptance Checklist

- [ ] 默认本地 E2E 不复用旧 Coordinator/Vite。
- [ ] 不再存在本计划新产生的孤儿 `e2e_stack.py` 进程。
- [ ] 同快照审核重载不会清除用户警告确认。
- [ ] 新快照必须重新确认警告。
- [ ] 主 UI 规划→编辑→审核→执行→多节点产物旅程稳定通过。
- [ ] 完整 `verify-all --skip-tauri-build` 连续两轮退出码 0。
- [ ] 完整 Playwright 套件第三次独立运行退出码 0。
- [ ] Backend、Node Agent、Vitest、production audit、lint、browser build、Python compile、Cargo test/check 全部记录新鲜结果。
- [ ] 完整 npm audit 为 0 vulnerabilities，`nanoid >= 3.3.18`。
- [ ] 浏览器 2x DPR 卡片 hover/selected 截图具有稳定基线。
- [ ] 真实 TaskNode 性能测试取代通用 memo Probe。
- [ ] 原有二进制、`build/`、`release/` 哈希和状态未被本计划改动。
- [ ] 没有构建、启动或安装 `.app`。
- [ ] 没有真实 Provider 调用。
- [ ] 没有 push、PR、merge、tag 或 GitHub Release。
- [ ] 远端最新 Release 仍如实记录为 `v0.3.3`，除非用户以后单独授权并完成发布。
- [ ] 独立审核与 Owner 自检被明确区分。

## Grok 最终交付格式

```text
结论：PASS / PASS_WITH_NON_BLOCKING_DEBT / FAIL
候选 SHA：粘贴 `git rev-parse HEAD` 的完整输出
源码状态：source_present / source_incomplete
本地门禁：命令、次数、测试数量、退出码
浏览器运行：E2E 数量、截图、失败/重试
桌面 App：not_built / not_runtime_verified
远端状态：local-only；main/release 分开说明
独立审核：reviewed / not_independently_reviewed
保留脏资产：路径、哈希、未触碰证明
剩余风险：每项必须有文件、命令或外部依赖证据
```
