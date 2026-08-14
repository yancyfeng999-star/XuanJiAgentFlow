import { expect, test } from '@playwright/test';

import {
  apiCreateProject,
  apiCreateRun,
  apiPlan,
  apiReview,
  apiStart,
  coordinatorUrl,
  ensureWorkspaceReady,
  openProjectsPanel,
  openWorkflowPanel,
  waitForRun,
} from './helpers';

/**
 * Full local workflow:
 * plan → edit → review → Fake multi-node execute → artifacts.
 *
 * UI drives project/plan/edit/review/execute where possible;
 * run/artifact assertions use Coordinator API for deterministic verification
 * against the same Fake multi-node stack.
 */
test.describe('local workflow (plan → edit → review → multi-node execute)', () => {
  test('canvas context menus disconnect an edge and delete a node', async ({
    page,
    request,
  }, testInfo) => {
    await ensureWorkspaceReady(page);
    await openProjectsPanel(page);

    const projectName = `画布交互测试 ${Date.now()}`;
    if (!(await page.getByLabel('项目名称').isVisible())) {
      await page.locator('.project-create-details summary').click();
    }
    await page.getByLabel('项目名称').fill(projectName);
    await page.getByRole('button', { name: '创建项目' }).click();
    await expect(page.getByRole('banner', { name: '顶部运行栏' })).toContainText(projectName);
    await openWorkflowPanel(page);

    await page.locator('#workflow-goal').fill('验证画布拖动和右键菜单功能');
    await page.getByRole('button', { name: '生成规划' }).click();
    await expect(page.getByRole('button', { name: '选择任务：资料研究' })).toBeVisible();

    const projects = await (await request.get(`${coordinatorUrl()}/api/projects`)).json();
    const project = projects.find((item: { name: string }) => item.name === projectName);
    expect(project).toBeTruthy();

    const researchNode = page.locator('.react-flow__node[data-id="research"]');
    const beforeDrag = await researchNode.boundingBox();
    expect(beforeDrag).toBeTruthy();
    if (!beforeDrag) throw new Error('资料研究节点未显示');
    await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + beforeDrag.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      beforeDrag.x + beforeDrag.width / 2 + 100,
      beforeDrag.y + beforeDrag.height / 2 + 60,
      { steps: 5 },
    );
    const duringDrag = await researchNode.boundingBox();
    expect(duringDrag?.x).toBeGreaterThan(beforeDrag.x + 50);
    await testInfo.attach('节点拖动实时预览', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await page.mouse.up();

    await expect.poll(async () => {
      const current = await (
        await request.get(`${coordinatorUrl()}/api/projects/${project.id}/workflow`)
      ).json();
      return current.tasks.find((task: { id: string }) => task.id === 'research')?.ui_position.x;
    }).toBeGreaterThan(80);

    const researchEdge = page.locator('.react-flow__edge[data-id="research-write"]');
    await expect(researchEdge).toBeVisible();
    await researchEdge.dispatchEvent('contextmenu', { clientX: 520, clientY: 300 });
    await expect(page.getByRole('menu', { name: '连线操作' })).toBeVisible();
    await testInfo.attach('edge-context-menu', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await page.getByRole('menuitem', { name: '断开连线' }).click();

    await expect.poll(async () => {
      const current = await (
        await request.get(`${coordinatorUrl()}/api/projects/${project.id}/workflow`)
      ).json();
      return current.tasks.find((task: { id: string }) => task.id === 'write')?.dependencies;
    }).toEqual(['analyze']);

    await page.getByRole('button', { name: '选择任务：资料研究' }).click({ button: 'right' });
    await expect(page.getByRole('menu', { name: '节点操作' })).toBeVisible();
    await testInfo.attach('node-context-menu', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await page.getByRole('menuitem', { name: '删除节点' }).click();

    await expect.poll(async () => {
      const current = await (
        await request.get(`${coordinatorUrl()}/api/projects/${project.id}/workflow`)
      ).json();
      return current.tasks.map((task: { id: string }) => task.id);
    }).toEqual(['analyze', 'write']);
    await expect(page.getByRole('button', { name: '选择任务：资料研究' })).toHaveCount(0);
  });

  test('UI plans, edits, reviews and executes; multi-node artifacts appear', async ({
    page,
    request,
  }) => {
    await ensureWorkspaceReady(page);
    await openProjectsPanel(page);

    // 1) Create project via UI
    if (!(await page.getByLabel('项目名称').isVisible())) {
      await page.locator('.project-create-details summary').click();
    }
    const projectName = `端到端本地工作流 ${Date.now()}`;
    await page.getByLabel('项目名称').fill(projectName);
    await page.getByRole('button', { name: '创建项目' }).click();
    // <option> content is not "visible" to Playwright; assert via select value/text
    await expect
      .poll(async () => page.locator('#project-select option', { hasText: projectName }).count(), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
    await expect(page.locator('#project-select')).not.toHaveValue('', { timeout: 10_000 });
    await expect(page.getByRole('banner', { name: '顶部运行栏' })).toContainText(projectName, {
      timeout: 10_000,
    });
    await openWorkflowPanel(page);

    // 2) Plan
    await expect(page.getByLabel('工作流画布')).toBeVisible();
    const goal = page.locator('#workflow-goal');
    await expect(goal).toBeVisible({ timeout: 10_000 });
    await goal.fill('生成一份经过多节点核验的研究报告');
    await page.getByRole('button', { name: '生成规划' }).click();
    await expect(page.getByText(/工作流版本 \d+/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: '选择任务：资料研究' })).toBeVisible({
      timeout: 15_000,
    });

    // 3) Edit a task prompt before review
    await page.getByRole('button', { name: '选择任务：资料研究' }).click();
    const prompt = page.getByLabel('任务指令');
    await expect(prompt).toBeVisible();
    await prompt.fill('端到端测试修改后的研究指令，审核前必须成功保存');
    await page.getByRole('button', { name: '保存任务' }).click();
    await expect(page.locator('[data-save-state="saved"]')).toBeVisible();

    // Confirm edit via API (same Coordinator)
    const projects = await (await request.get(`${coordinatorUrl()}/api/projects`)).json();
    const project = projects.find((item: { name: string }) => item.name === projectName);
    expect(project).toBeTruthy();
    const workflow = await (
      await request.get(`${coordinatorUrl()}/api/projects/${project.id}/workflow`)
    ).json();
    const research = workflow.tasks.find((task: { id: string }) => task.id === 'research');
    expect(research.prompt).toContain('端到端测试修改后的研究指令');

    // 4) Review (freeze) — 审核工作区：确认警告后提交快照哈希
    await page.getByRole('button', { name: '审核工作流' }).click();
    const reviewDialog = page.getByRole('dialog', { name: '审核工作流' });
    await expect(reviewDialog).toBeVisible();
    const ack = reviewDialog.getByLabel('我已阅读并接受以上全部警告');
    if (await ack.count()) await ack.check();
    await reviewDialog.getByRole('button', { name: '确认审核' }).click();
    await expect(page.getByText('已审核，编辑已冻结')).toBeVisible({ timeout: 10_000 });

    // 5) Execute
    const uiRunResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST'
      && response.url().endsWith(`/api/workflows/${workflow.id}/runs`),
    );
    await page.getByRole('button', { name: '执行全部' }).click();
    const uiRun = await (await uiRunResponse).json() as { id: string };

    // Wait for UI to reflect acceptance / progress
    await expect
      .poll(async () => page.locator('.run-bar .status').textContent(), { timeout: 30_000 })
      .toMatch(/已完成|运行中|已接受/);

    // Verify the exact run created by the UI click; do not substitute an API-created run.
    const runId = uiRun.id;
    const finished = await waitForRun(request, runId, ['success']);
    expect(finished.status).toBe('success');
    const attempts = finished.attempts as Array<{ task_id: string; node_id: string; status: string }>;
    expect(attempts.length).toBeGreaterThanOrEqual(3);
    const nodeIds = new Set(attempts.map((item) => item.node_id).filter(Boolean));
    const nodes = await (await request.get(`${coordinatorUrl()}/api/nodes`)).json();
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(nodeIds.size).toBeGreaterThanOrEqual(2);

    const artifacts = await (
      await request.get(`${coordinatorUrl()}/api/runs/${runId}/artifacts`)
    ).json();
    expect(artifacts.artifacts.length).toBeGreaterThanOrEqual(1);
    const first = artifacts.artifacts[0];
    const download = await request.get(
      `${coordinatorUrl()}/api/runs/${runId}/artifacts/download?path=${encodeURIComponent(first.relative_path)}`,
    );
    expect(download.ok()).toBeTruthy();
    expect((await download.body()).byteLength).toBe(first.size);
  });

  test('API multi-node parallel path produces distinct assignments when capacity allows', async ({
    request,
  }) => {
    const project = await apiCreateProject(request, `E2E Multi ${Date.now()}`);
    const workflow = await apiPlan(request, project.id, 'parallel multi-node goal');
    await apiReview(request, workflow.id);
    const run = await apiCreateRun(request, workflow.id);
    await apiStart(request, run.id);
    const finished = await waitForRun(request, run.id, ['success']);
    const attempts = finished.attempts as Array<{ node_id: string; task_id: string }>;
    const nodesUsed = new Set(attempts.map((a) => a.node_id));
    // With 2 online Fake nodes and 2 independent tasks first, scheduling should prefer multi-node
    // when concurrency allows.
    expect(attempts.every((a) => a.node_id)).toBeTruthy();
    expect(nodesUsed.size).toBeGreaterThanOrEqual(2);
    const artifacts = await (
      await request.get(`${coordinatorUrl()}/api/runs/${run.id}/artifacts`)
    ).json();
    expect(artifacts.artifacts.length).toBeGreaterThanOrEqual(1);
  });
});
