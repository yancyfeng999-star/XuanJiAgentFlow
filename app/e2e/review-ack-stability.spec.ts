import { expect, test, type Page } from '@playwright/test';

import {
  coordinatorUrl,
  ensureWorkspaceReady,
  openProjectsPanel,
  openWorkflowPanel,
} from './helpers';

async function createProjectViaUi(page: Page, projectName: string) {
  await openProjectsPanel(page);
  if (!(await page.getByLabel('项目名称').isVisible())) {
    await page.locator('.project-create-details summary').click();
  }
  await page.getByLabel('项目名称').fill(projectName);
  await page.getByRole('button', { name: '创建项目' }).click();
  await expect(page.getByRole('banner', { name: '顶部运行栏' })).toContainText(projectName, {
    timeout: 10_000,
  });
}

test.describe('review acknowledgement stability', () => {
  test('same-snapshot reload keeps warning acknowledgement through UI review', async ({
    page,
    request,
  }) => {
    await ensureWorkspaceReady(page);

    const firstProjectName = `审核确认前序画布 ${Date.now()}`;
    await createProjectViaUi(page, firstProjectName);
    await openWorkflowPanel(page);
    await page.locator('#workflow-goal').fill('验证画布断线和删节点');
    await page.getByRole('main', { name: '工作流画布' }).getByRole('button', { name: '生成规划' }).click();
    await expect(page.getByRole('button', { name: '选择任务：资料研究' })).toBeVisible({
      timeout: 15_000,
    });

    const firstProjects = await (await request.get(`${coordinatorUrl()}/api/projects`)).json();
    const firstProject = firstProjects.find((item: { name: string }) => item.name === firstProjectName);
    expect(firstProject).toBeTruthy();

    const researchEdge = page.locator('.react-flow__edge[data-id="research-write"]');
    await expect(researchEdge).toBeVisible();
    await researchEdge.dispatchEvent('contextmenu', { clientX: 520, clientY: 300 });
    await expect(page.getByRole('menu', { name: '连线操作' })).toBeVisible();
    await page.getByRole('menuitem', { name: '断开连线' }).click();
    await expect.poll(async () => {
      const current = await (
        await request.get(`${coordinatorUrl()}/api/projects/${firstProject.id}/workflow`)
      ).json();
      return current.tasks.find((task: { id: string }) => task.id === 'write')?.dependencies;
    }).toEqual(['analyze']);

    await page.getByRole('button', { name: '选择任务：资料研究' }).click({ button: 'right' });
    await expect(page.getByRole('menu', { name: '节点操作' })).toBeVisible();
    await page.getByRole('menuitem', { name: '删除节点' }).click();
    await expect.poll(async () => {
      const current = await (
        await request.get(`${coordinatorUrl()}/api/projects/${firstProject.id}/workflow`)
      ).json();
      return current.tasks.map((task: { id: string }) => task.id);
    }).toEqual(['analyze', 'write']);
    await expect(page.getByRole('button', { name: '选择任务：资料研究' })).toHaveCount(0);

    const reviewProjectName = `审核确认稳定性 ${Date.now()}`;
    await createProjectViaUi(page, reviewProjectName);
    await openWorkflowPanel(page);
    await page.locator('#workflow-goal').fill('生成一份需要警告确认的研究报告');
    await page.getByRole('main', { name: '工作流画布' }).getByRole('button', { name: '生成规划' }).click();
    await expect(page.getByText(/工作流版本 \d+/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: '选择任务：资料研究' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: '选择任务：资料研究' }).click();
    const prompt = page.getByLabel('任务指令');
    await expect(prompt).toBeVisible();
    await prompt.fill('同快照重载后仍应保留警告确认');
    await page.getByRole('button', { name: '保存任务' }).click();
    await expect(page.locator('[data-save-state="saved"]')).toBeVisible();

    const projects = await (await request.get(`${coordinatorUrl()}/api/projects`)).json();
    const project = projects.find((item: { name: string }) => item.name === reviewProjectName);
    expect(project).toBeTruthy();
    const workflow = await (
      await request.get(`${coordinatorUrl()}/api/projects/${project.id}/workflow`)
    ).json();
    const research = workflow.tasks.find((task: { id: string }) => task.id === 'research');
    expect(research.prompt).toContain('同快照重载后仍应保留警告确认');
    expect(workflow.status).toBe('draft');

    await page.getByRole('button', { name: '审核工作流' }).click();
    const reviewDialog = page.getByRole('dialog', { name: '审核工作流' });
    await expect(reviewDialog).toBeVisible();
    const ack = reviewDialog.getByLabel('我已阅读并接受以上全部警告');
    await expect(ack).toBeVisible();
    await ack.check();
    await expect(ack).toBeChecked();
    const confirmReview = reviewDialog.getByRole('button', { name: '确认审核' });
    await expect(confirmReview).toBeEnabled();

    const reloadPrepared = reviewDialog.getByRole('button', { name: '重新加载审核' });
    await expect(reloadPrepared).toBeEnabled();
    const prepareResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST'
      && /\/api\/workflows\/[^/]+\/review\/prepare$/.test(new URL(response.url()).pathname),
    );
    await reloadPrepared.click();
    expect((await prepareResponse).ok()).toBeTruthy();
    await expect(ack).toBeChecked();
    await expect(confirmReview).toBeEnabled();

    await confirmReview.click();
    await expect(page.getByText('已审核，编辑已冻结')).toBeVisible({ timeout: 10_000 });
    const reviewed = await (
      await request.get(`${coordinatorUrl()}/api/projects/${project.id}/workflow`)
    ).json();
    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.id).toBe(workflow.id);
    expect(reviewed.review_snapshot_hash).toBeTruthy();
  });
});
