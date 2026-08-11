/**
 * 静默自动更新：启动后后台检查 GitHub Releases 最新版本，
 * 有更新则下载、安装并重启；任何失败（离线、无新版本、未打包环境）都静默忽略。
 */
export async function runSilentUpdate(): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) return;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return;
    await update.downloadAndInstall();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch {
    /* 静默失败：保持当前版本运行 */
  }
}
