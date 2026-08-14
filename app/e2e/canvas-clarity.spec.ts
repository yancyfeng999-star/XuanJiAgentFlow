import { expect, test } from '@playwright/test';

import { apiCreateProject, apiPlan, ensureWorkspaceReady } from './helpers';
import { clarityGoal } from './fixtures/workflow';

test.describe('workflow card clarity', () => {
  test.use({ deviceScaleFactor: 2 });

  test('selected and hover cards stay geometrically still', async ({ page, request }, testInfo) => {
    await ensureWorkspaceReady(page);
    const project = await apiCreateProject(request, `清晰度 ${Date.now()}`);
    await apiPlan(request, project.id, clarityGoal);
    await page.reload();
    await ensureWorkspaceReady(page);
    const card = page.locator('.task-node').first();
    await expect(card).toBeVisible();
    await card.hover();
    await page.screenshot({
      path: testInfo.outputPath('hover-2x.png'),
      animations: 'disabled',
    });
    await card.click();
    await expect(card).toHaveClass(/is-selected/);
    await page.screenshot({
      path: testInfo.outputPath('selected-2x.png'),
      animations: 'disabled',
    });
    const hoverCss = await card.evaluate((el) => getComputedStyle(el).transform);
    expect(hoverCss === 'none' || hoverCss === 'matrix(1, 0, 0, 1, 0, 0)').toBeTruthy();
  });
});
