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
  | { kind: 'failed'; stage: string; code: string; message: string; retryable: boolean }
  | { kind: 'desktop_only' };

export interface UpdaterAdapter {
  available: boolean;
  check(): Promise<UpdateCandidate | null>;
  download(candidate: UpdateCandidate, onProgress: (progress: number | null) => void): Promise<void>;
  install(candidate: UpdateCandidate): Promise<void>;
}

export interface UpdateService {
  getState(): UpdateState;
  subscribe(listener: (state: UpdateState) => void): () => void;
  check(): Promise<void>;
  download(): Promise<void>;
  installAndRestart(): Promise<void>;
  reset(): void;
}

class DefaultService implements UpdateService {
  private state: UpdateState = { kind: 'idle' };
  private listeners = new Set<(state: UpdateState) => void>();
  private inflight: Promise<void> | null = null;

  constructor(private readonly adapter: UpdaterAdapter) {}

  getState(): UpdateState {
    return this.state;
  }

  subscribe(listener: (state: UpdateState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.setState({ kind: 'idle' });
  }

  async check(): Promise<void> {
    return this.run(async () => {
      if (!this.adapter.available) {
        this.setState({ kind: 'desktop_only' });
        return;
      }
      this.setState({ kind: 'checking' });
      try {
        const candidate = await this.adapter.check();
        if (!candidate) {
          this.setState({ kind: 'up_to_date', checkedAt: new Date().toISOString() });
          return;
        }
        this.setState({ kind: 'available', candidate });
      } catch (error) {
        this.setState(fail('check', error));
      }
    });
  }

  async download(): Promise<void> {
    return this.run(async () => {
      const current = this.state;
      if (current.kind !== 'available' && current.kind !== 'failed') return;
      const candidate = 'candidate' in current && current.candidate
        ? current.candidate
        : null;
      if (!candidate) return;
      this.setState({ kind: 'downloading', candidate, progress: 0 });
      try {
        await this.adapter.download(candidate, (progress) => {
          if (this.state.kind === 'downloading') {
            this.setState({ kind: 'downloading', candidate, progress });
          }
        });
        this.setState({ kind: 'verifying', candidate });
        this.setState({ kind: 'ready_to_install', candidate });
      } catch (error) {
        this.setState(fail('download', error));
      }
    });
  }

  async installAndRestart(): Promise<void> {
    return this.run(async () => {
      if (this.state.kind !== 'ready_to_install') return;
      const { candidate } = this.state;
      this.setState({ kind: 'installing', candidate });
      try {
        await this.adapter.install(candidate);
        this.setState({ kind: 'restart_required', candidate });
      } catch (error) {
        this.setState(fail('install', error));
      }
    });
  }

  private run(task: () => Promise<void>): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = task().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private setState(state: UpdateState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}

function fail(stage: string, error: unknown): UpdateState {
  const message = error instanceof Error ? error.message : String(error);
  return { kind: 'failed', stage, code: `${stage}_failed`, message, retryable: true };
}

export function createUpdateService(adapter: UpdaterAdapter): UpdateService {
  return new DefaultService(adapter);
}

export function browserUpdaterAdapter(): UpdaterAdapter {
  return {
    available: false,
    async check() {
      return null;
    },
    async download() {},
    async install() {},
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
      await update.download((event) => {
        if (event.event === 'Progress' && event.data.contentLength) {
          onProgress(event.data.chunkLength / event.data.contentLength);
        }
      });
    },
    async install() {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) throw new Error('update_missing');
      await update.install();
    },
  };
}

let shared: UpdateService | null = null;

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
  /* P1: no silent auto-install */
}

/** Launch must not download or install. */
export async function runSilentUpdate(): Promise<void> {
  return undefined;
}

export async function checkForUpdateManually(): Promise<{ kind: 'up-to-date' } | { kind: 'installed'; version: string; relaunchBlocked: boolean } | { kind: 'error' }> {
  const service = getUpdateService();
  await service.check();
  const state = service.getState();
  if (state.kind === 'up_to_date') return { kind: 'up-to-date' };
  if (state.kind === 'available') return { kind: 'error' };
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
