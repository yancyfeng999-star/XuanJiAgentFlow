import { expect, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function coordinatorUrl(): string {
  if (process.env.E2E_COORDINATOR_URL) return process.env.E2E_COORDINATOR_URL;
  const statePath = path.join(root, '.e2e', 'stack.json');
  if (fs.existsSync(statePath)) {
    const meta = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { coordinator_url: string };
    return meta.coordinator_url;
  }
  return `http://127.0.0.1:${process.env.E2E_COORDINATOR_PORT ?? '18080'}`;
}

export async function waitForRun(
  request: APIRequestContext,
  runId: string,
  expected: string[],
  timeoutMs = 20_000,
): Promise<Record<string, unknown>> {
  const base = coordinatorUrl();
  const deadline = Date.now() + timeoutMs;
  let last: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    const response = await request.get(`${base}/api/runs/${runId}`);
    expect(response.ok()).toBeTruthy();
    last = await response.json();
    if (expected.includes(String(last.status))) return last;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`run ${runId} did not reach ${expected.join('|')}; last=${JSON.stringify(last)}`);
}

export async function apiCreateProject(request: APIRequestContext, name: string) {
  const base = coordinatorUrl();
  const response = await request.post(`${base}/api/projects`, {
    data: { name },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

export async function apiPlan(request: APIRequestContext, projectId: string, goal = 'E2E verified report') {
  const base = coordinatorUrl();
  const response = await request.post(`${base}/api/projects/${projectId}/plan`, {
    data: { goal, context: 'playwright e2e' },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

export async function apiReview(request: APIRequestContext, workflowId: string) {
  const base = coordinatorUrl();
  const prepared = await request.post(`${base}/api/workflows/${workflowId}/review/prepare`);
  expect(prepared.ok()).toBeTruthy();
  const snapshot = await prepared.json();
  const response = await request.post(`${base}/api/workflows/${workflowId}/review`, {
    data: {
      snapshot_hash: snapshot.snapshot_hash,
      acknowledged_warnings: [...new Set(snapshot.warnings.map((w: { code: string }) => w.code))],
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function apiCreateRun(request: APIRequestContext, workflowId: string) {
  const base = coordinatorUrl();
  const response = await request.post(`${base}/api/workflows/${workflowId}/runs`);
  expect(response.status()).toBe(201);
  return response.json();
}

export async function apiStart(request: APIRequestContext, runId: string) {
  const base = coordinatorUrl();
  const response = await request.post(`${base}/api/runs/${runId}/start`);
  expect(response.status()).toBe(202);
  return response.json();
}

export async function ensureWorkspaceReady(page: Page) {
  await page.goto('/');
  await expect(page).toHaveTitle('璇玑智能任务协作');
  await expect(page.getByText('璇玑')).toBeVisible({ timeout: 20_000 });
  // Boot should finish: either workspace rail or (rarely) boot error.
  await expect(page.getByLabel('项目资源栏')).toBeVisible({ timeout: 20_000 });
}
