import { expect, test } from '@playwright/test';

import { apiCreateProject, apiPlan, ensureWorkspaceReady, selectProject } from './helpers';
import { clarityGoal } from './fixtures/workflow';

test.describe('workflow card clarity', () => {
  test.use({ deviceScaleFactor: 2 });

  test('selected and hover cards stay geometrically still', async ({ page, request }) => {
    await ensureWorkspaceReady(page);
    const project = await apiCreateProject(request, `清晰度 ${Date.now()}`);
    await apiPlan(request, project.id, clarityGoal);
    await page.reload();
    await ensureWorkspaceReady(page);
    await selectProject(page, project.id);
    const card = page.locator('.task-node').first();
    await expect(card).toBeVisible();
    await card.hover();
    const hoverCss = await card.evaluate((el) => getComputedStyle(el).transform);
    expect(hoverCss === 'none' || hoverCss === 'matrix(1, 0, 0, 1, 0, 0)').toBeTruthy();
    await expect(card).toHaveScreenshot('task-card-hover-2x.png', {
      animations: 'disabled',
      scale: 'device',
      maxDiffPixelRatio: 0.02,
    });
    await card.click();
    await expect(card).toHaveClass(/is-selected/);
    await expect(card).toHaveScreenshot('task-card-selected-2x.png', {
      animations: 'disabled',
      scale: 'device',
      maxDiffPixelRatio: 0.02,
    });
    const selectedCss = await card.evaluate((el) => getComputedStyle(el).transform);
    expect(selectedCss === 'none' || selectedCss === 'matrix(1, 0, 0, 1, 0, 0)').toBeTruthy();
  });
});
