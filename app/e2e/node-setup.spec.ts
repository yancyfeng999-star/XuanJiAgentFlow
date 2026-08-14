import { expect, test } from '@playwright/test';

import { coordinatorUrl, ensureWorkspaceReady, openProjectsPanel } from './helpers';

test.describe('node setup journeys', () => {
  test('wizard offers explicit local/remote choice and local discovery', async ({ page }) => {
    await ensureWorkspaceReady(page);
    await page.getByRole('button', { name: '节点' }).click();
    await expect(page.getByRole('button', { name: /本机节点/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /远程节点/ })).toBeVisible();

    await page.getByRole('button', { name: /本机节点/ }).click();
    await expect(page.getByText(/已发现本机 Hermes|未发现本机 Hermes/)).toBeVisible();

    await page.getByRole('button', { name: '返回' }).click();
    await page.getByRole('button', { name: /远程节点/ }).click();
    await expect(page.getByLabel('远程连接主机地址')).toBeVisible();
    await expect(page.getByRole('button', { name: '选择私钥文件' })).toBeVisible();
  });

  test('local discover API responds without overwriting node config', async ({ request }) => {
    const before = await (await request.get(`${coordinatorUrl()}/api/nodes`)).json();
    const response = await request.post(`${coordinatorUrl()}/api/nodes/local/discover`);
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(typeof payload.found).toBe('boolean');
    const after = await (await request.get(`${coordinatorUrl()}/api/nodes`)).json();
    expect(after.length).toBe(before.length);
  });

  test('diagnose failure reports layered steps', async ({ request }) => {
    const nodeId = `unreachable-${Date.now()}`;
    const created = await request.post(`${coordinatorUrl()}/api/nodes`, {
      data: {
        id: nodeId,
        name: 'Unreachable',
        kind: 'local',
        api_url: 'http://127.0.0.1:9',
        credential: 'tok',
      },
    });
    expect([200, 201]).toContain(created.status());
    const diagnose = await request.post(`${coordinatorUrl()}/api/nodes/${nodeId}/diagnose`);
    expect(diagnose.status()).toBe(503);
    const details = (await diagnose.json()).error.details;
    const steps = details.steps.map((step: { step: string }) => step.step);
    expect(steps).toEqual(['dns', 'tcp', 'ssh', 'node_agent', 'hermes']);
    await request.delete(`${coordinatorUrl()}/api/nodes/${nodeId}`);
  });

  test('project rename and delete flow via API-backed UI', async ({ page, request }) => {
    await ensureWorkspaceReady(page);
    await openProjectsPanel(page);
    const name = `E2E Project ${Date.now()}`;
    if (!(await page.getByLabel('项目名称').isVisible())) {
      await page.locator('.project-create-details summary').click();
    }
    await page.locator('#project-name').fill(name);
    await page.getByRole('button', { name: '创建项目' }).click();
    await expect(page.locator('.project-select')).toHaveValue(/.+/, { timeout: 10_000 });

    await page.getByRole('button', { name: '重命名项目' }).click();
    await page.locator('.project-rename input').fill(`${name} 改名`);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByLabel('顶部运行栏').getByText(`${name} 改名`)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: '删除项目' }).click();
    const dialog = page.getByRole('dialog', { name: '删除项目' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('输入项目名以确认删除').fill(`${name} 改名`);
    await dialog.getByRole('button', { name: '永久删除' }).click();
    await expect(
      page.locator('.project-select option', { hasText: `${name} 改名` }),
    ).toHaveCount(0, { timeout: 10_000 });
  });
});
