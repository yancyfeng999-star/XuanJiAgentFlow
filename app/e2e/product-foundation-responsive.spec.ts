import { expect, test } from '@playwright/test';

import { ensureWorkspaceReady } from './helpers';

const sizes = [
  { width: 1288, height: 832 },
  { width: 1440, height: 900 },
  { width: 1100, height: 800 },
  { width: 860, height: 760 },
];

test('core actions remain available across breakpoints', async ({ page }) => {
  await ensureWorkspaceReady(page);
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expect(page.getByRole('navigation', { name: '工作区导航' })).toBeVisible();
    await expect(page.getByRole('banner', { name: '顶部运行栏' })).toBeVisible();
  }
});
