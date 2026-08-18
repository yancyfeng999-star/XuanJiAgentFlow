import { expect, test } from '@playwright/test';

import {
  acknowledgePreparedReview,
  apiCreateProject,
  apiPlan,
  coordinatorUrl,
  ensureWorkspaceReady,
  selectProject,
} from './helpers';

test('product foundation journey covers models, inspector, review, update check, diagnostics', async ({
  page,
  request,
}) => {
  await ensureWorkspaceReady(page);

  await page.getByRole('navigation', { name: '工作区导航' }).getByRole('button', { name: '思考模型' }).click();
  await expect(page.getByRole('heading', { name: '思考模型' })).toBeVisible();

  const responsesName = `Responses ${Date.now()}`;
  const chatName = `Chat ${Date.now()}`;

  await page.getByLabel('显示名称').fill(responsesName);
  await page.getByLabel('协议').selectOption('responses');
  await page.getByLabel('模型 ID').fill('mock-responses');
  await page.getByLabel('接口密钥（留空表示保留现有）').fill('sk-fake-e2e-responses');
  await page.getByRole('button', { name: '保存思考模型' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: responsesName })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveValue('');

  await page.getByLabel('显示名称').fill(chatName);
  await page.getByLabel('协议').selectOption('chat_completions');
  await page.getByLabel('模型 ID').fill('mock-chat');
  await page.getByLabel('接口密钥（留空表示保留现有）').fill('sk-fake-e2e-chat');
  await page.getByRole('button', { name: '保存思考模型' }).click();
  const chatItem = page.getByRole('listitem').filter({ hasText: chatName });
  await expect(chatItem).toBeVisible();
  await chatItem.getByRole('button', { name: '设为默认' }).click();
  await expect(chatItem.getByText('默认')).toBeVisible();
  const listed = await request.get(`${coordinatorUrl()}/api/thinking-models`);
  expect(listed.ok()).toBeTruthy();
  const models = (await listed.json()).items as Array<{ display_name: string; is_default: boolean }>;
  expect(models.some((item) => item.display_name === responsesName)).toBeTruthy();
  expect(models.find((item) => item.display_name === chatName)?.is_default).toBe(true);
  expect(models.filter((item) => item.is_default)).toHaveLength(1);
  expect(JSON.stringify(models)).not.toContain('sk-fake-e2e');

  const project = await apiCreateProject(request, `E2E Foundation ${Date.now()}`);
  const workflow = await apiPlan(request, project.id);
  await selectProject(page, project.id);

  await page.getByRole('button', { name: /^选择任务：/ }).first().click();
  for (const tab of ['概览', '提示词与输入', '执行', '预期产物', '运行详情']) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
  }
  await page.getByRole('tab', { name: '提示词与输入' }).click();
  await page.getByLabel('任务标题').fill('五标签保存后的标题');
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect.poll(async () => {
    const current = await (await request.get(`${coordinatorUrl()}/api/workflows/${workflow.id}`)).json();
    return current.tasks[0].title;
  }).toBe('五标签保存后的标题');

  await page.getByRole('button', { name: '审核工作流' }).click();
  const dialog = page.getByRole('dialog', { name: '审核工作流' });
  const confirmReview = await acknowledgePreparedReview(dialog);
  await confirmReview.click();
  await expect(page.getByText('已审核，编辑已冻结')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /^选择任务：/ }).first().click();
  await expect(page.getByText('工作流已审核，创建新修订后才能编辑。')).toBeVisible();
  await expect(page.getByLabel('任务标题')).toBeDisabled();

  await page.getByRole('button', { name: '创建新修订' }).click();
  await expect(page.getByText('工作流版本 2')).toBeVisible({ timeout: 10_000 });
  const revised = await (await request.get(`${coordinatorUrl()}/api/projects/${project.id}/workflow`)).json();
  expect(revised.version).toBe(2);
  expect(revised.status).toBe('draft');

  await page.getByRole('navigation', { name: '工作区导航' }).getByRole('button', { name: '设置' }).click();
  await page.getByRole('tab', { name: '更新' }).click();
  await page.getByRole('button', { name: '检查更新' }).click();
  await expect(page.getByTestId('update-state')).toHaveText('desktop_only');
  await expect(page.getByRole('button', { name: '下载更新' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '安装并重启' })).toHaveCount(0);

  await page.getByRole('tab', { name: '诊断与帮助' }).click();
  await page.getByRole('button', { name: '运行诊断' }).click();
  const summary = page.locator('pre');
  await expect(summary).toBeVisible();
  const text = await summary.innerText();
  expect(text).not.toMatch(/Authorization:\s*Bearer\s+(?!\[redacted])/i);
  expect(text).not.toContain('sk-fake-e2e');
  expect(text).not.toContain('/Users/');
  expect(text).not.toMatch(/session_token=/i);
});
