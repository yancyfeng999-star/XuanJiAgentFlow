import { expect, test } from '@playwright/test';

import { ensureWorkspaceReady } from './helpers';

test.describe('responsive workspace layout', () => {
  test('narrow window keeps layout without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await ensureWorkspaceReady(page);

    await page.setViewportSize({ width: 980, height: 700 });
    await expect(page.getByLabel('项目资源栏')).toBeVisible();
    await expect(page.getByRole('banner', { name: '顶部运行栏' })).toBeVisible();
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noOverflow).toBeTruthy();

    await page.getByRole('button', { name: '执行节点' }).click();
    await expect(page.getByRole('heading', { name: '执行节点' })).toBeVisible();
    const overlayOk = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(overlayOk).toBeTruthy();
  });

  test('large window keeps three-column structure intact', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await ensureWorkspaceReady(page);
    await expect(page.getByLabel('项目资源栏')).toBeVisible();
    await expect(page.getByRole('banner', { name: '顶部运行栏' })).toBeVisible();
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noOverflow).toBeTruthy();
  });
});
