import { expect, test } from '@playwright/test';

import { ensureWorkspaceReady } from './helpers';

test('keyboard can reach thinking models and inspector tabs', async ({ page }) => {
  await ensureWorkspaceReady(page);
  const nav = page.getByRole('navigation', { name: '工作区导航' });
  await nav.getByRole('button', { name: '工作流' }).focus();
  await expect(nav.getByRole('button', { name: '工作流' })).toBeFocused();
  await nav.getByRole('button', { name: '思考模型' }).click();
  await expect(page.getByRole('heading', { name: '思考模型' })).toBeVisible();
});
