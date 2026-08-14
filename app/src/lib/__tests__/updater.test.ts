import { describe, expect, it, vi } from 'vitest';

import { createUpdateService, type UpdateCandidate, type UpdaterAdapter } from '../updater';

function adapter(overrides: Partial<UpdaterAdapter> = {}): UpdaterAdapter & { downloads: number; installs: number; checks: number } {
  const candidate: UpdateCandidate = { version: '0.3.5', notes: 'notes', bytes: 10 };
  const recorded = {
    downloads: 0,
    installs: 0,
    checks: 0,
    available: true,
    async check() {
      recorded.checks += 1;
      return candidate;
    },
    async download() {
      recorded.downloads += 1;
    },
    async install() {
      recorded.installs += 1;
    },
    ...overrides,
  };
  return recorded;
}

describe('UpdateService', () => {
  it('check does not download or install', async () => {
    const mock = adapter();
    const service = createUpdateService(mock);
    await service.check();
    expect(service.getState().kind).toBe('available');
    expect(mock.downloads).toBe(0);
    expect(mock.installs).toBe(0);
  });

  it('download and install require their own actions', async () => {
    const mock = adapter();
    const service = createUpdateService(mock);
    await service.download();
    expect(mock.downloads).toBe(0);
    await service.check();
    await service.download();
    expect(mock.downloads).toBe(1);
    expect(mock.installs).toBe(0);
    expect(service.getState().kind).toBe('ready_to_install');
    await service.installAndRestart();
    expect(mock.installs).toBe(1);
    expect(service.getState().kind).toBe('restart_required');
  });

  it('dedupes concurrent checks', async () => {
    let resolveCheck!: (value: UpdateCandidate | null) => void;
    const pending = new Promise<UpdateCandidate | null>((resolve) => {
      resolveCheck = resolve;
    });
    const mock = adapter({
      check: vi.fn(() => pending),
    });
    const service = createUpdateService(mock);
    const first = service.check();
    const second = service.check();
    resolveCheck(null);
    await Promise.all([first, second]);
    expect(mock.check).toHaveBeenCalledTimes(1);
  });
});
