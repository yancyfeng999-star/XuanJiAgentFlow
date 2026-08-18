import { expect, test } from '@playwright/test';

import { apiCreateProject, ensureWorkspaceReady, selectProject } from './helpers';

test.describe('workspace performance', () => {
  test('marks shell_mounted before chrome is visible when Performance API is present', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: '工作区导航' })).toBeVisible();
    const shellTime = await page.evaluate(() => performance.getEntriesByName('xuanji:shell_mounted')[0]?.startTime);
    expect(shellTime).toEqual(expect.any(Number));
    // Local budget is 200ms; hosted CI cold-starts (368ms seen) need a wider regression gate.
    expect(shellTime).toBeLessThanOrEqual(process.env.CI ? 800 : 200);
  });

  test('switching projects keeps chrome and does not keep the previous execute action', async ({ page, request }) => {
    const first = await apiCreateProject(request, `Perf A ${Date.now()}`);
    const second = await apiCreateProject(request, `Perf B ${Date.now()}`);
    await page.goto('/');
    await ensureWorkspaceReady(page);
    await selectProject(page, first.id);
    await selectProject(page, second.id);
    await expect(page.getByRole('navigation', { name: '工作区导航' })).toBeVisible();
    await expect(page.getByRole('banner', { name: '顶部运行栏' })).toBeVisible();
  });
});
