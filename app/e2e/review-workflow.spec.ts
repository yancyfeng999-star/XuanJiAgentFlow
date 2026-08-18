import { expect, test } from '@playwright/test';

import {
  acknowledgePreparedReview,
  apiCreateProject,
  apiPlan,
  apiReview,
  coordinatorUrl,
  ensureWorkspaceReady,
  selectProject,
} from './helpers';

test.describe('review workspace with immutable snapshots', () => {
  test('UI review binds snapshot and revision reopens editing', async ({ page, request }) => {
    const project = await apiCreateProject(request, `E2E Review ${Date.now()}`);
    const workflow = await apiPlan(request, project.id);
    await page.goto('/');
    await ensureWorkspaceReady(page);
    await selectProject(page, project.id);

    await page.getByRole('button', { name: '审核工作流' }).click();
    const dialog = page.getByRole('dialog', { name: '审核工作流' });
    const confirmReview = await acknowledgePreparedReview(dialog);
    await confirmReview.click();
    await expect(page.getByText('已审核，编辑已冻结')).toBeVisible({ timeout: 10_000 });

    const reviewed = await (
      await request.get(`${coordinatorUrl()}/api/workflows/${workflow.id}`)
    ).json();
    expect(reviewed.review_snapshot_hash).toBeTruthy();
    expect(reviewed.reviewed_by).toBe('user');

    await page.getByRole('button', { name: '创建修订' }).click();
    await expect(page.getByText('工作流版本 2')).toBeVisible({ timeout: 10_000 });
    const active = await (
      await request.get(`${coordinatorUrl()}/api/projects/${project.id}/workflow`)
    ).json();
    expect(active.version).toBe(2);
    expect(active.status).toBe('draft');
    expect(active.id).not.toBe(workflow.id);

    const original = await (
      await request.get(`${coordinatorUrl()}/api/workflows/${workflow.id}`)
    ).json();
    expect(original.status).toBe('reviewed');
  });

  test('stale snapshot is rejected with a stable error code', async ({ request }) => {
    const project = await apiCreateProject(request, `E2E Stale ${Date.now()}`);
    const workflow = await apiPlan(request, project.id);
    const prepared = await (
      await request.post(`${coordinatorUrl()}/api/workflows/${workflow.id}/review/prepare`)
    ).json();
    const tasks = workflow.tasks as Array<Record<string, unknown>>;
    tasks[0].title = '已在审核准备后修改';
    const update = await request.put(`${coordinatorUrl()}/api/workflows/${workflow.id}`, {
      data: { tasks },
    });
    expect(update.ok()).toBeTruthy();
    const review = await request.post(`${coordinatorUrl()}/api/workflows/${workflow.id}/review`, {
      data: { snapshot_hash: prepared.snapshot_hash, acknowledged_warnings: [] },
    });
    expect(review.status()).toBe(409);
    expect((await review.json()).error.code).toBe('review_snapshot_stale');
  });

  test('run payload binds reviewed workflow version and snapshot hash', async ({ request }) => {
    const project = await apiCreateProject(request, `E2E Bind ${Date.now()}`);
    const workflow = await apiPlan(request, project.id);
    const reviewed = await apiReview(request, workflow.id);
    const run = await (
      await request.post(`${coordinatorUrl()}/api/workflows/${workflow.id}/runs`)
    ).json();
    expect(run.workflow_version).toBe(workflow.version);
    expect(run.review_snapshot_hash).toBe(reviewed.review_snapshot_hash);
  });
});
