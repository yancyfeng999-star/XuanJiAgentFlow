import { expect, test } from '@playwright/test';

import { ensureWorkspaceReady } from './helpers';

test('product foundation surfaces exist without launching Tauri', async ({ page }) => {
  await ensureWorkspaceReady(page);
  await expect(page.getByRole('navigation', { name: '工作区导航' })).toBeVisible();
  await page.getByRole('button', { name: '思考模型' }).click();
  await expect(page.getByRole('heading', { name: '思考模型' })).toBeVisible();
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('tab', { name: '更新' }).click();
  await expect(page.getByRole('button', { name: '检查更新' })).toBeVisible();
  await page.getByRole('tab', { name: '诊断与帮助' }).click();
  await expect(page.getByRole('button', { name: '运行诊断' })).toBeVisible();
});
