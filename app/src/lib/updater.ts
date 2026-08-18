export type UpdateCandidate = {
  version: string;
  notes?: string;
  date?: string;
  bytes?: number | null;
  minOs?: string | null;
};

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up_to_date'; checkedAt: string }
  | { kind: 'available'; candidate: UpdateCandidate }
  | { kind: 'downloading'; candidate: UpdateCandidate; progress: number | null }
  | { kind: 'verifying'; candidate: UpdateCandidate }
  | { kind: 'ready_to_install'; candidate: UpdateCandidate }
  | { kind: 'installing'; candidate: UpdateCandidate }
  | { kind: 'restart_required'; candidate: UpdateCandidate }
  | { kind: 'run_blocked'; candidate: UpdateCandidate }
  | { kind: 'failed'; stage: string; code: string; message: string; retryable: boolean }
  | { kind: 'desktop_only' };

export interface UpdaterAdapter {
  available: boolean;
  check(): Promise<UpdateCandidate | null>;
  download(candidate: UpdateCandidate, onProgress: (progress: number | null) => void): Promise<void>;
  install(candidate: UpdateCandidate): Promise<void>;
  relaunch(): Promise<void>;
}

export interface ApplyGuard {
  canRelaunch: () => boolean;
}

export interface UpdateService {
  getState(): UpdateState;
  subscribe(listener: (state: UpdateState) => void): () => void;
  check(): Promise<void>;
  download(): Promise<void>;
  installAndRestart(): Promise<void>;
  applyAndRelaunch(guard?: ApplyGuard): Promise<void>;
  reset(): void;
}

export const RELAUNCH_BLOCKING_RUN_STATUSES = new Set([
  'running',
  'paused',
  'cancelling',
]);

export function isRunBlockingRelaunch(status: string | null | undefined): boolean {
  return status != null && RELAUNCH_BLOCKING_RUN_STATUSES.has(status);
}

function createDefaultService(adapter: UpdaterAdapter): UpdateService {
  let state: UpdateState = { kind: 'idle' };
  const listeners = new Set<(next: UpdateState) => void>();
  let inflight: Promise<void> | null = null;

  const setState = (next: UpdateState) => {
    state = next;
    listeners.forEach((listener) => listener(next));
  };

  const run = (task: () => Promise<void>): Promise<void> => {
    if (inflight) return inflight;
    inflight = task().finally(() => {
      inflight = null;
    });
    return inflight;
  };

  const downloadCandidate = async (candidate: UpdateCandidate) => {
    setState({ kind: 'downloading', candidate, progress: 0 });
    await adapter.download(candidate, (progress) => {
      if (state.kind === 'downloading') {
        setState({ kind: 'downloading', candidate, progress });
      }
    });
    setState({ kind: 'installing', candidate });
    await adapter.install(candidate);
    setState({ kind: 'restart_required', candidate });
    await adapter.relaunch();
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    reset() {
      setState({ kind: 'idle' });
    },
    check() {
      return run(async () => {
        if (!adapter.available) {
          setState({ kind: 'desktop_only' });
          return;
        }
        setState({ kind: 'checking' });
        try {
          const candidate = await adapter.check();
          if (!candidate) {
            setState({ kind: 'up_to_date', checkedAt: new Date().toISOString() });
            return;
          }
          setState({ kind: 'available', candidate });
        } catch (error) {
          setState(fail('check', error));
        }
      });
    },
    download() {
      return run(async () => {
        const current = state;
        if (current.kind !== 'available' && current.kind !== 'failed') return;
        const candidate = 'candidate' in current && current.candidate ? current.candidate : null;
        if (!candidate) return;
        setState({ kind: 'downloading', candidate, progress: 0 });
        try {
          await adapter.download(candidate, (progress) => {
            if (state.kind === 'downloading') {
              setState({ kind: 'downloading', candidate, progress });
            }
          });
          setState({ kind: 'verifying', candidate });
          setState({ kind: 'ready_to_install', candidate });
        } catch (error) {
          setState(fail('download', error));
        }
      });
    },
    installAndRestart() {
      return run(async () => {
        if (state.kind !== 'ready_to_install') return;
        const { candidate } = state;
        setState({ kind: 'installing', candidate });
        try {
          await adapter.install(candidate);
          setState({ kind: 'restart_required', candidate });
          await adapter.relaunch();
        } catch (error) {
          setState(fail('install', error));
        }
      });
    },
    applyAndRelaunch(guard) {
      return run(async () => {
        if (!adapter.available) {
          setState({ kind: 'desktop_only' });
          return;
        }
        setState({ kind: 'checking' });
        try {
          const candidate = await adapter.check();
          if (!candidate) {
            setState({ kind: 'up_to_date', checkedAt: new Date().toISOString() });
            return;
          }
          if (guard && !guard.canRelaunch()) {
            setState({ kind: 'run_blocked', candidate });
            return;
          }
          await downloadCandidate(candidate);
        } catch (error) {
          setState(fail('apply', error));
        }
      });
    },
  };
}

function fail(stage: string, error: unknown): UpdateState {
  const message = error instanceof Error ? error.message : String(error);
  return { kind: 'failed', stage, code: `${stage}_failed`, message, retryable: true };
}

export function createUpdateService(adapter: UpdaterAdapter): UpdateService {
  return createDefaultService(adapter);
}

function reportDownloadProgress(
  onProgress: (progress: number | null) => void,
): (event: { event: string; data: { chunkLength?: number; contentLength?: number } }) => void {
  let total = 0;
  let received = 0;
  return (event) => {
    if (event.event === 'Started' && event.data.contentLength) {
      total = event.data.contentLength;
      received = 0;
    }
    if (event.event === 'Progress' && event.data.chunkLength) {
      received += event.data.chunkLength;
      onProgress(total > 0 ? received / total : null);
    }
  };
}

export function browserUpdaterAdapter(): UpdaterAdapter {
  return {
    available: false,
    async check() {
      return null;
    },
    async download() {},
    async install() {},
    async relaunch() {},
  };
}

export function createTauriUpdaterAdapter(): UpdaterAdapter {
  return {
    available: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
    async check() {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) return null;
      return { version: update.version, notes: update.body ?? undefined, date: update.date ?? undefined, bytes: null };
    },
    async download(candidate, onProgress) {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update || update.version !== candidate.version) throw new Error('update_changed');
      await update.download(reportDownloadProgress(onProgress));
    },
    async install(candidate) {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update || update.version !== candidate.version) throw new Error('update_missing');
      await update.install();
    },
    async relaunch() {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    },
  };
}

let shared: UpdateService | null = null;

export async function bindNativeUpdateMenu(options: {
  listen: (event: string, handler: () => void | Promise<void>) => Promise<() => void>;
  check: () => Promise<void>;
  openUpdates: () => void;
}): Promise<() => void> {
  return options.listen('xuanji://check-for-updates', () => {
    options.openUpdates();
    return options.check();
  });
}

export function getUpdateService(): UpdateService {
  if (!shared) {
    const adapter = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
      ? createTauriUpdaterAdapter()
      : browserUpdaterAdapter();
    shared = createUpdateService(adapter);
  }
  return shared;
}

export function setUpdateServiceForTests(service: UpdateService): void {
  shared = service;
}

export function isAutoUpdateEnabled(): boolean {
  return false;
}

export function setAutoUpdateEnabled(_enabled: boolean): void {
  /* Launch and idle time never auto-install. */
}

/** Launch must not download or install. */
export async function runSilentUpdate(): Promise<void> {
  return undefined;
}

export async function checkForUpdateManually(guard?: ApplyGuard): Promise<
  | { kind: 'up-to-date' }
  | { kind: 'installed'; version: string; relaunchBlocked: boolean }
  | { kind: 'error' }
> {
  const service = getUpdateService();
  await service.applyAndRelaunch(guard);
  const state = service.getState();
  if (state.kind === 'up_to_date') return { kind: 'up-to-date' };
  if (state.kind === 'run_blocked') {
    return { kind: 'installed', version: state.candidate.version, relaunchBlocked: true };
  }
  if (state.kind === 'restart_required') {
    return { kind: 'installed', version: state.candidate.version, relaunchBlocked: false };
  }
  return { kind: 'error' };
}

export async function relaunchApp(): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) return;
  try {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch {
    /* ignore */
  }
}
