import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getCoordinatorStatus,
  waitForHealthyRuntime,
  type RuntimeInfo,
} from '../runtime';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('runtime', () => {
  it('returns a dev healthy default outside Tauri', async () => {
    const info = await getCoordinatorStatus();
    expect(info.status).toBe('healthy');
    expect(info.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1/);
  });

  it('waits until healthy before resolving', async () => {
    const sequence: RuntimeInfo[] = [
      {
        status: 'starting',
        baseUrl: null,
        port: null,
        dataDir: null,
        pid: null,
        error: null,
      },
      {
        status: 'healthy',
        baseUrl: 'http://127.0.0.1:9876',
        port: 9876,
        dataDir: '/tmp',
        pid: 42,
        error: null,
      },
    ];
    let i = 0;
    const poll = vi.fn(async () => sequence[Math.min(i++, sequence.length - 1)]!);

    const info = await waitForHealthyRuntime({
      poll,
      intervalMs: 1,
      timeoutMs: 1000,
    });

    expect(info.baseUrl).toBe('http://127.0.0.1:9876');
    expect(poll.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects on failed status', async () => {
    await expect(
      waitForHealthyRuntime({
        intervalMs: 1,
        timeoutMs: 500,
        poll: async () => ({
          status: 'failed',
          baseUrl: null,
          port: null,
          dataDir: null,
          pid: null,
          error: 'spawn_failed',
        }),
      }),
    ).rejects.toThrow(/spawn_failed/);
  });

  it('rejects on timeout', async () => {
    await expect(
      waitForHealthyRuntime({
        intervalMs: 5,
        timeoutMs: 20,
        poll: async () => ({
          status: 'starting',
          baseUrl: null,
          port: null,
          dataDir: null,
          pid: null,
          error: null,
        }),
      }),
    ).rejects.toThrow(/timed out/i);
  });
});
