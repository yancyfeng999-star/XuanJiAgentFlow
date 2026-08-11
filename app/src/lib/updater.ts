/**
 * 静默自动更新：启动后后台检查 GitHub Releases 最新版本，
 * 有更新则下载、安装并重启；任何失败（离线、无新版本、未打包环境）都静默忽略。
 * 用户在设置页关闭后不再检查；存在进行中的运行时不重启（更新在下次启动生效）。
 */

import { useWorkspaceStore } from '../store/workspaceStore';

const STORAGE_KEY = 'xuanji.updater.enabled';

export function isAutoUpdateEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAutoUpdateEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, 'off');
    }
  } catch {
    /* 忽略持久化失败 */
  }
}

const ACTIVE_RUN_STATUSES = new Set(['accepted', 'pending', 'running', 'paused', 'cancelling']);

function hasActiveRun(): boolean {
  const state = useWorkspaceStore.getState();
  const status = state.run?.status ?? state.runStatus;
  return ACTIVE_RUN_STATUSES.has(status);
}

export async function runSilentUpdate(): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) return;
  if (!isAutoUpdateEnabled()) return;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return;
    await update.downloadAndInstall();
    if (hasActiveRun()) return;
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch {
    /* 静默失败：保持当前版本运行 */
  }
}
