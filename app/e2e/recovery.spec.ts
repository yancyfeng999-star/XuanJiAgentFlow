import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  apiCreateProject,
  apiCreateRun,
  apiPlan,
  apiReview,
  apiStart,
  coordinatorUrl,
  ensureWorkspaceReady,
  selectProject,
  waitForRun,
} from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function stackMeta() {
  const statePath = path.join(root, '.e2e', 'stack.json');
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
    coordinator_url: string;
    data_dir: string;
    nodes: Record<string, string>;
    node_tokens: Record<string, string>;
  };
}

test.describe('recovery and control paths', () => {
  test('cancel pending run without illegal transition', async ({ request }) => {
    const project = await apiCreateProject(request, `E2E Cancel ${Date.now()}`);
    const workflow = await apiPlan(request, project.id);
    await apiReview(request, workflow.id);
    const run = await apiCreateRun(request, workflow.id);
    const cancelled = await request.post(`${coordinatorUrl()}/api/runs/${run.id}/cancel`);
    expect(cancelled.ok()).toBeTruthy();
    expect((await cancelled.json()).status).toBe('cancelled');
  });

  test('start then cancel running run reaches cancelled or terminal non-stub state', async ({
    request,
  }) => {
    const project = await apiCreateProject(request, `E2E CancelRun ${Date.now()}`);
    const workflow = await apiPlan(request, project.id);
    await apiReview(request, workflow.id);
    const run = await apiCreateRun(request, workflow.id);
    await apiStart(request, run.id);
    const cancel = await request.post(`${coordinatorUrl()}/api/runs/${run.id}/cancel`);
    // Fast FakeNode may already be success before cancel arrives.
    expect([200, 409]).toContain(cancel.status());
    const finished = await waitForRun(request, run.id, [
      'cancelled',
      'cancelling',
      'success',
      'blocked',
      'failed',
    ]);
    expect(['cancelled', 'cancelling', 'success', 'blocked', 'failed']).toContain(
      String(finished.status),
    );
  });

  test('skip then fresh run success covers control surface and multi-node completion', async ({
    request,
  }) => {
    const project = await apiCreateProject(request, `E2E Retry ${Date.now()}`);
    const workflow = await apiPlan(request, project.id);
    await apiReview(request, workflow.id);
    const run = await apiCreateRun(request, workflow.id);
    const skip = await request.post(
      `${coordinatorUrl()}/api/runs/${run.id}/tasks/research/skip`,
    );
    expect(skip.ok()).toBeTruthy();
    const afterSkip = await skip.json();
    const research = (afterSkip.attempts as Array<{ task_id: string; status: string }>).find(
      (item) => item.task_id === 'research',
    );
    expect(research?.status).toBe('skipped');

    const run2 = await apiCreateRun(request, workflow.id);
    await apiStart(request, run2.id);
    const finished = await waitForRun(request, run2.id, ['success']);
    expect(finished.status).toBe('success');
    const artifacts = await (
      await request.get(`${coordinatorUrl()}/api/runs/${run2.id}/artifacts`)
    ).json();
    expect(artifacts.artifacts.length).toBeGreaterThanOrEqual(1);
  });

  test('offline fixed node does not silently report success for that node', async ({ request }) => {
    const offlineId = `offline-${Date.now()}`;
    const created = await request.post(`${coordinatorUrl()}/api/nodes`, {
      data: {
        id: offlineId,
        name: 'Offline Probe',
        kind: 'local',
        api_url: 'http://127.0.0.1:9',
        status: 'online',
        capabilities_json: {
          models: ['fake-model'],
          tools: ['terminal'],
          tags: ['fake'],
        },
        max_concurrency: 1,
        credential: 'offline-token',
      },
    });
    expect([200, 201]).toContain(created.status());

    const project = await apiCreateProject(request, `E2E Offline ${Date.now()}`);
    const workflow = await apiPlan(request, project.id, 'offline only');
    const tasks = workflow.tasks.map((task: Record<string, unknown>) => ({
      ...task,
      execution_policy: {
        mode: 'fixed',
        node_id: offlineId,
        node_group: null,
        required_models: [],
        required_tools: [],
        required_tags: [],
        timeout_seconds: 30,
      },
    }));
    const updated = await request.put(`${coordinatorUrl()}/api/workflows/${workflow.id}`, {
      data: { tasks },
    });
    expect(updated.ok()).toBeTruthy();
    await apiReview(request, workflow.id);
    // 固定离线节点时，服务端就绪门禁必须拒绝创建 Run，而不是静默派发后谎报成功
    const createResponse = await request.post(
      `${coordinatorUrl()}/api/workflows/${workflow.id}/runs`,
    );
    expect(createResponse.status()).toBe(409);
    const error = await createResponse.json();
    expect(error.error.code).toBe('run_not_ready');
    const codes = error.error.details.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('task_without_matching_node');
  });

  test('websocket reconnect replays with strictly increasing event_id', async ({ page }) => {
    await ensureWorkspaceReady(page);
    const base = coordinatorUrl();

    // Seed a finished run so WS has events to replay
    const create = await page.evaluate(async (coordinator) => {
      const project = await (
        await fetch(`${coordinator}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `WS-${Date.now()}` }),
        })
      ).json();
      const workflow = await (
        await fetch(`${coordinator}/api/projects/${project.id}/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal: 'ws replay', context: 'e2e' }),
        })
      ).json();
      const prepared = await (
        await fetch(`${coordinator}/api/workflows/${workflow.id}/review/prepare`, { method: 'POST' })
      ).json();
      await fetch(`${coordinator}/api/workflows/${workflow.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot_hash: prepared.snapshot_hash,
          acknowledged_warnings: [...new Set(prepared.warnings.map((w) => w.code))],
        }),
      });
      const run = await (
        await fetch(`${coordinator}/api/workflows/${workflow.id}/runs`, { method: 'POST' })
      ).json();
      await fetch(`${coordinator}/api/runs/${run.id}/start`, { method: 'POST' });
      const deadline = Date.now() + 15_000;
      let status = run.status;
      while (Date.now() < deadline && !['success', 'blocked', 'failed', 'cancelled'].includes(status)) {
        const current = await (await fetch(`${coordinator}/api/runs/${run.id}`)).json();
        status = current.status;
        await new Promise((r) => setTimeout(r, 40));
      }
      return { runId: run.id as string, status: status as string };
    }, base);

    expect(['success', 'blocked', 'failed']).toContain(create.status);

    const events = await page.evaluate(async ({ coordinator, runId }) => {
      const wsUrl = coordinator.replace(/^http/, 'ws') + `/ws/runs/${runId}?last_event_id=0`;
      const firstBatch: Array<{ event_id: number; type: string }> = await new Promise((resolve, reject) => {
        const collected: Array<{ event_id: number; type: string }> = [];
        const ws = new WebSocket(wsUrl);
        const timer = setTimeout(() => {
          ws.close();
          resolve(collected);
        }, 2000);
        ws.onmessage = (message) => {
          const data = JSON.parse(String(message.data)) as { event_id: number; type: string };
          collected.push({ event_id: data.event_id, type: data.type });
          if (collected.length >= 3) {
            clearTimeout(timer);
            ws.close();
            resolve(collected);
          }
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error('websocket error'));
        };
      });

      if (firstBatch.length === 0) {
        return { firstBatch, secondBatch: [] as Array<{ event_id: number; type: string }> };
      }
      const cursor = firstBatch[0].event_id;
      const secondBatch: Array<{ event_id: number; type: string }> = await new Promise((resolve, reject) => {
        const collected: Array<{ event_id: number; type: string }> = [];
        const ws = new WebSocket(
          coordinator.replace(/^http/, 'ws') + `/ws/runs/${runId}?last_event_id=${cursor}`,
        );
        const timer = setTimeout(() => {
          ws.close();
          resolve(collected);
        }, 2000);
        ws.onmessage = (message) => {
          const data = JSON.parse(String(message.data)) as { event_id: number; type: string };
          collected.push({ event_id: data.event_id, type: data.type });
          if (collected.length >= 2) {
            clearTimeout(timer);
            ws.close();
            resolve(collected);
          }
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error('websocket error'));
        };
      });
      return { firstBatch, secondBatch };
    }, { coordinator: base, runId: create.runId });

    expect(events.firstBatch.length).toBeGreaterThan(0);
    for (let i = 1; i < events.firstBatch.length; i += 1) {
      expect(events.firstBatch[i].event_id).toBeGreaterThan(events.firstBatch[i - 1].event_id);
    }
    if (events.secondBatch.length > 0) {
      expect(events.secondBatch[0].event_id).toBeGreaterThan(events.firstBatch[0].event_id);
    }
  });

  test('durable SQLite retains run across mid-run query (API restart precondition)', async ({
    request,
  }) => {
    const meta = await stackMeta();
    expect(meta).toBeTruthy();
    expect(fs.existsSync(path.join(meta!.data_dir, 'coordinator.db'))).toBeTruthy();

    const project = await apiCreateProject(request, `E2E Restart ${Date.now()}`);
    const workflow = await apiPlan(request, project.id);
    await apiReview(request, workflow.id);
    const run = await apiCreateRun(request, workflow.id);
    await apiStart(request, run.id);
    const mid = await (await request.get(`${coordinatorUrl()}/api/runs/${run.id}`)).json();
    expect(mid.id).toBe(run.id);
    const finished = await waitForRun(request, run.id, [
      'success',
      'blocked',
      'failed',
      'running',
      'paused',
    ]);
    expect(finished.id).toBe(run.id);
    // RecoveryService is exercised by backend integration on process restart;
    // here we assert the durable preconditions the supervisor relies on.
    expect(fs.statSync(path.join(meta!.data_dir, 'coordinator.db')).size).toBeGreaterThan(0);
  });

  test('switching back to a project restores its latest non-terminal run', async ({ page, request }) => {
    const project = await apiCreateProject(request, `E2E Restore ${Date.now()}`);
    const workflow = await apiPlan(request, project.id);
    await apiReview(request, workflow.id);
    await apiCreateRun(request, workflow.id);

    await page.goto('/');
    await ensureWorkspaceReady(page);
    await selectProject(page, project.id);
    await expect(page.getByLabel('顶部运行栏').getByText('等待调度')).toBeVisible({ timeout: 15_000 });

    const other = await apiCreateProject(request, `E2E Restore Other ${Date.now()}`);
    await page.reload();
    await ensureWorkspaceReady(page);
    await selectProject(page, other.id);
    await expect(page.getByLabel('顶部运行栏').getByText('待运行')).toBeVisible();

    await selectProject(page, project.id);
    await expect(page.getByLabel('顶部运行栏').getByText('等待调度')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('运行历史')).toBeVisible();
  });
});
