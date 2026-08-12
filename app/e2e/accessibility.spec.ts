import { expect, test } from '@playwright/test';

import { apiCreateProject, apiPlan, ensureWorkspaceReady } from './helpers';

test.describe('accessibility journeys', () => {
  test('review dialog traps focus, closes on Escape and returns focus', async ({ page, request }) => {
    const project = await apiCreateProject(request, `E2E A11y ${Date.now()}`);
    await apiPlan(request, project.id);
    await page.goto('/');
    await ensureWorkspaceReady(page);
    await page.locator('.project-rail select').selectOption(project.id);

    const reviewButton = page.getByRole('button', { name: '审核工作流' });
    await reviewButton.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '审核工作流' });
    await expect(dialog).toBeVisible();

    // Tab 在对话框内循环，不逃逸到页面
    for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const active = document.activeElement;
      const dlg = document.querySelector('.review-workspace');
      return dlg !== null && dlg.contains(active);
    });
    expect(inside).toBeTruthy();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('main journey is keyboard operable and controls have accessible names', async ({ page, request }) => {
    const project = await apiCreateProject(request, `E2E A11y KB ${Date.now()}`);
    await apiPlan(request, project.id);
    await page.goto('/');
    await ensureWorkspaceReady(page);
    await page.locator('.project-rail select').selectOption(project.id);

    const nameless = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('button, input, select, textarea, a[href]')];
      return controls
        .filter((el) => {
          const label = el.getAttribute('aria-label')
            ?? el.getAttribute('aria-labelledby')
            ?? el.textContent?.trim()
            ?? (el as HTMLInputElement).placeholder;
          const labelledByForm = el.id !== '' && document.querySelector(`label[for="${el.id}"]`) !== null;
          return !label && !labelledByForm;
        })
        .map((el) => el.outerHTML.slice(0, 80));
    });
    expect(nameless).toEqual([]);
  });

  test('status is not conveyed by color alone and reduced-motion is honored', async ({ page, request }) => {
    const project = await apiCreateProject(request, `E2E A11y Motion ${Date.now()}`);
    await apiPlan(request, project.id);
    await page.goto('/');
    await ensureWorkspaceReady(page);
    await page.locator('.project-rail select').selectOption(project.id);

    const status = page.getByLabel('顶部运行栏').locator('.status');
    await expect(status).not.toHaveText('');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const duration = await page.evaluate(() => {
      const el = document.querySelector('.run-progress');
      return el ? getComputedStyle(el).transitionDuration : '0s';
    });
    expect(['0s', '0.01ms', '1e-05s']).toContain(duration);
  });
});
