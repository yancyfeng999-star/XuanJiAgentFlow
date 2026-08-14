import { invoke } from '@tauri-apps/api/core';

import { getLocale, translate } from './i18n';

export type RuntimeStatus =
  | 'stopped'
  | 'starting'
  | 'healthy'
  | 'unhealthy'
  | 'failed';

export interface RuntimeInfo {
  status: RuntimeStatus;
  baseUrl: string | null;
  port: number | null;
  dataDir: string | null;
  pid: number | null;
  sessionToken?: string | null;
  error: string | null;
}

const DEFAULT_INFO: RuntimeInfo = {
  status: 'stopped',
  baseUrl: null,
  port: null,
  dataDir: null,
  pid: null,
  sessionToken: null,
  error: null,
};

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function runtimeErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (/[\u4e00-\u9fff]/.test(message)) return message;
  }
  if (error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)) return error.message;
  return translate(getLocale(), 'app.bootError.fallback');
}

export async function getCoordinatorStatus(): Promise<RuntimeInfo> {
  if (!isTauriRuntime()) {
    // Browser/dev without Tauri: assume local default or env override.
    const fromEnv =
      (typeof import.meta !== 'undefined' &&
        (import.meta as ImportMeta & { env?: Record<string, string> }).env
          ?.VITE_COORDINATOR_URL) ||
      'http://127.0.0.1:8000';
    return {
      status: 'healthy',
      baseUrl: fromEnv,
      port: null,
      dataDir: null,
      pid: null,
      sessionToken: null,
      error: null,
    };
  }

  try {
    const info = await invoke<RuntimeInfo>('coordinator_status');
    return {
      status: info.status ?? 'stopped',
      baseUrl: info.baseUrl ?? null,
      port: info.port ?? null,
      dataDir: info.dataDir ?? null,
      pid: info.pid ?? null,
      sessionToken: info.sessionToken ?? null,
      error: info.error ?? null,
    };
  } catch (error) {
    return {
      ...DEFAULT_INFO,
      status: 'failed',
      error: runtimeErrorMessage(error),
    };
  }
}

export async function selectProjectDir(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  return invoke<string | null>('select_project_dir');
}

export async function restartCoordinator(): Promise<RuntimeInfo | null> {
  if (!isTauriRuntime()) return null;
  return invoke<RuntimeInfo>('restart_coordinator');
}

export async function selectSshKey(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  return invoke<string | null>('select_ssh_key');
}

export interface WaitForRuntimeOptions {
  timeoutMs?: number;
  intervalMs?: number;
  poll?: () => Promise<RuntimeInfo>;
}

/**
 * Poll until coordinator is healthy (or timeout).
 * Frontend must only load the workspace after this resolves successfully.
 */
export async function waitForHealthyRuntime(
  options: WaitForRuntimeOptions = {},
): Promise<RuntimeInfo> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 200;
  const poll = options.poll ?? getCoordinatorStatus;
  const deadline = Date.now() + timeoutMs;
  let last: RuntimeInfo = DEFAULT_INFO;

  while (Date.now() < deadline) {
    last = await poll();
    if (last.status === 'healthy' && last.baseUrl) {
      return last;
    }
    if (last.status === 'failed') {
      throw new Error(last.error ?? translate(getLocale(), 'runtime.startFailed'));
    }
    await sleep(intervalMs);
  }

  throw new Error(last.error ?? translate(getLocale(), 'runtime.startTimeout'));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
