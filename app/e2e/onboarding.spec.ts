import { expect, test } from '@playwright/test';

import { apiCreateProject, apiPlan, apiReview, coordinatorUrl, ensureWorkspaceReady, selectProject } from './helpers';

test.describe('onboarding readiness journeys', () => {
  test('first launch shows readiness center with checks', async ({ page, request }) => {
    const project = await apiCreateProject(request, `E2E Onboarding First ${Date.now()}`);
    await page.goto('/');
    await ensureWorkspaceReady(page);
    await selectProject(page, project.id);
    const center = page.getByRole('region', { name: '执行就绪检查' });
    await expect(center).toBeVisible();
    await expect(center.getByText('项目目录', { exact: true })).toBeVisible();
    await expect(center.getByText('思考模型')).toBeVisible();
    await expect(center.getByText('执行节点', { exact: true })).toBeVisible();
    await expect(center.getByText('尚未生成工作流')).toBeVisible();
  });

  test('unreviewed workflow blocks execute with a visible reason', async ({ page, request }) => {
    const project = await apiCreateProject(request, `E2E Onboarding Review ${Date.now()}`);
    await apiPlan(request, project.id);
    await page.goto('/');
    await ensureWorkspaceReady(page);
    await selectProject(page, project.id);
    await expect(page.getByRole('button', { name: '执行全部' })).toBeDisabled();
    await expect(page.getByLabel('顶部运行栏').getByText('工作流未审核')).toBeVisible();
  });

  test('fully ready project enables execute', async ({ page, request }) => {
    const project = await apiCreateProject(request, `E2E Onboarding Ready ${Date.now()}`);
    const workflow = await apiPlan(request, project.id);
    await apiReview(request, workflow.id);
    await page.goto('/');
    await ensureWorkspaceReady(page);
    await selectProject(page, project.id);
    await expect(page.getByRole('button', { name: '执行全部' })).toBeEnabled({ timeout: 15_000 });
  });

  test('readiness API reports task without matching node', async ({ request }) => {
    const project = await apiCreateProject(request, `E2E Onboarding Match ${Date.now()}`);
    const workflow = await apiPlan(request, project.id);
    const tasks = workflow.tasks as Array<Record<string, unknown>>;
    const first = tasks[0] as { execution_policy: Record<string, unknown> };
    first.execution_policy.required_models = ['e2e-nonexistent-model'];
    const update = await request.put(`${coordinatorUrl()}/api/workflows/${workflow.id}`, {
      data: { tasks },
    });
    expect(update.ok()).toBeTruthy();
    await apiReview(request, workflow.id);
    const readiness = await request.get(
      `${coordinatorUrl()}/api/readiness`,
      { params: { project_id: project.id, workflow_id: workflow.id } },
    );
    expect(readiness.ok()).toBeTruthy();
    const payload = await readiness.json();
    expect(payload.ready).toBe(false);
    const codes = payload.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('task_without_matching_node');
  });

  test('readiness API reports unreviewed workflow as blocking', async ({ request }) => {
    const project = await apiCreateProject(request, `E2E Onboarding Gate ${Date.now()}`);
    const workflow = await apiPlan(request, project.id);
    const readiness = await request.get(
      `${coordinatorUrl()}/api/readiness`,
      { params: { project_id: project.id, workflow_id: workflow.id } },
    );
    const payload = await readiness.json();
    expect(payload.ready).toBe(false);
    expect(payload.checks.workflow).toBe('blocked');
    const codes = payload.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('workflow_not_reviewed');
  });
});
