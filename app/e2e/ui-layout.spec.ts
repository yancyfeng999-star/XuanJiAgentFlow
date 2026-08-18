import { expect, test } from '@playwright/test';

import { apiCreateProject, apiPlan, ensureWorkspaceReady, selectProject } from './helpers';

const viewports = [
  { width: 1288, height: 832 },
  { width: 1100, height: 800 },
  { width: 860, height: 760 },
];

test.describe('workspace layout', () => {
  test('header stays 52px and does not overflow or wrap into vertical glyphs', async ({ page, request }) => {
    const project = await apiCreateProject(request, `Layout ${Date.now()}`);
    await apiPlan(request, project.id);
    await page.goto('/');
    await ensureWorkspaceReady(page);
    await selectProject(page, project.id);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const bar = page.locator('.run-bar');
      await expect(bar).toHaveCSS('height', '52px');
      expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBeTruthy();
      const primary = bar.locator('.run-primary-action');
      const box = await primary.boundingBox();
      expect(box?.height ?? 99).toBeLessThan(48);
      const writingMode = await primary.evaluate((el) => getComputedStyle(el).writingMode);
      expect(writingMode).toContain('horizontal');
      if (viewport.width === 1288 && process.env.LAYOUT_SHOT) {
        await page.screenshot({ path: process.env.LAYOUT_SHOT, fullPage: false });
      }
    }
  });

  test('readiness details overlay does not change canvas height', async ({ page, request }) => {
    const project = await apiCreateProject(request, `Layout ready ${Date.now()}`);
    await page.goto('/');
    await ensureWorkspaceReady(page);
    await selectProject(page, project.id);
    const canvas = page.locator('.workflow-stage .workflow-canvas, .workflow-stage [data-testid="workspace-canvas-skeleton"]').first();
    const strip = page.locator('.readiness-strip');
    if (await strip.count()) {
      const before = await canvas.evaluate((el) => el.clientHeight);
      await page.getByRole('button', { name: '查看详情' }).click();
      const after = await canvas.evaluate((el) => el.clientHeight);
      expect(after).toBe(before);
    }
    expect(await page.locator('.inspector').count()).toBe(0);
  });
});
