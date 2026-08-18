import { describe, expect, it, vi } from 'vitest';

import {
  bindNativeUpdateMenu,
  createUpdateService,
  type UpdateCandidate,
  type UpdaterAdapter,
} from '../updater';

function adapter(overrides: Partial<UpdaterAdapter> = {}): UpdaterAdapter & {
  downloads: number;
  installs: number;
  checks: number;
  relaunches: number;
} {
  const candidate: UpdateCandidate = { version: '0.3.5', notes: 'notes', bytes: 10 };
  const recorded = {
    downloads: 0,
    installs: 0,
    checks: 0,
    relaunches: 0,
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
    async relaunch() {
      recorded.relaunches += 1;
    },
    ...overrides,
  };
  return recorded;
}

describe('UpdateService', () => {
  it('check does not download, install, or relaunch', async () => {
    const mock = adapter();
    const service = createUpdateService(mock);
    await service.check();
    expect(service.getState().kind).toBe('available');
    expect(mock.downloads).toBe(0);
    expect(mock.installs).toBe(0);
    expect(mock.relaunches).toBe(0);
  });

  it('applyAndRelaunch downloads, installs, then relaunches', async () => {
    const mock = adapter();
    const service = createUpdateService(mock);
    await service.applyAndRelaunch();
    expect(mock.checks).toBe(1);
    expect(mock.downloads).toBe(1);
    expect(mock.installs).toBe(1);
    expect(mock.relaunches).toBe(1);
    expect(service.getState().kind).toBe('restart_required');
  });

  it('applyAndRelaunch stays up to date without writing files', async () => {
    const mock = adapter({
      async check() {
        return null;
      },
    });
    const service = createUpdateService(mock);
    await service.applyAndRelaunch();
    expect(mock.downloads).toBe(0);
    expect(mock.installs).toBe(0);
    expect(mock.relaunches).toBe(0);
    expect(service.getState().kind).toBe('up_to_date');
  });

  it('applyAndRelaunch does not download when relaunch is blocked', async () => {
    const mock = adapter();
    const service = createUpdateService(mock);
    await service.applyAndRelaunch({ canRelaunch: () => false });
    expect(mock.downloads).toBe(0);
    expect(mock.installs).toBe(0);
    expect(mock.relaunches).toBe(0);
    expect(service.getState().kind).toBe('run_blocked');
  });

  it('never applies on a missing desktop adapter', async () => {
    const mock = adapter({ available: false });
    const service = createUpdateService(mock);
    await service.applyAndRelaunch();
    expect(mock.checks).toBe(0);
    expect(service.getState().kind).toBe('desktop_only');
  });

  it('native check-for-updates event opens updates and applies', async () => {
    const service = createUpdateService(adapter());
    const openUpdates = vi.fn();
    let handler: (() => void) | undefined;
    const unlisten = await bindNativeUpdateMenu({
      listen: async (event, next) => {
        expect(event).toBe('xuanji://check-for-updates');
        handler = next;
        return () => {
          handler = undefined;
        };
      },
      check: () => service.applyAndRelaunch(),
      openUpdates,
    });
    expect(handler).toBeDefined();
    await handler?.();
    expect(openUpdates).toHaveBeenCalledOnce();
    expect(service.getState().kind).toBe('restart_required');
    unlisten();
  });
});
