mod coordinator;
mod tunnel;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::menu::{Menu, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, State};

use coordinator::{
    new_shared_supervisor, production_start_options, resolve_sidecar_path, CoordinatorError,
    CoordinatorSupervisor, RuntimeInfo, SharedSupervisor, StartOptions,
};
use tunnel::{new_shared_tunnel_registry, SharedTunnelRegistry, TunnelRecord};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandError {
    code: String,
    message: String,
}

impl From<CoordinatorError> for CommandError {
    fn from(value: CoordinatorError) -> Self {
        Self {
            code: value.code().into(),
            message: value.to_string(),
        }
    }
}

impl From<String> for CommandError {
    fn from(message: String) -> Self {
        Self {
            code: "command_error".into(),
            message,
        }
    }
}

#[tauri::command]
fn coordinator_status(supervisor: State<'_, SharedSupervisor>) -> RuntimeInfo {
    supervisor.status()
}

#[tauri::command]
fn list_tunnels(tunnels: State<'_, SharedTunnelRegistry>) -> Vec<TunnelRecord> {
    tunnels.list()
}

#[tauri::command]
fn close_all_tunnels(tunnels: State<'_, SharedTunnelRegistry>) -> Vec<TunnelRecord> {
    tunnels.close_all()
}

#[tauri::command]
fn select_project_dir(app: AppHandle) -> Result<Option<String>, CommandError> {
    select_path(app, false)
}

#[tauri::command]
fn select_ssh_key(app: AppHandle) -> Result<Option<String>, CommandError> {
    select_path(app, true)
}

fn select_path(app: AppHandle, file: bool) -> Result<Option<String>, CommandError> {
    // Prefer rfd when dialog plugin is unavailable at compile-time.
    // Use a blocking native dialog via `rfd`.
    let picked = if file {
        rfd::FileDialog::new()
            .set_title("选择 SSH 私钥")
            .pick_file()
    } else {
        rfd::FileDialog::new()
            .set_title("选择项目目录")
            .pick_folder()
    };

    // Keep AppHandle referenced so the API signature matches Tauri expectations
    // and future multi-window dialogs can scope to the app.
    let _ = app;
    Ok(picked.map(|p| p.display().to_string()))
}

fn data_dir_for_app(app: &AppHandle) -> Result<PathBuf, CommandError> {
    let dir = app.path().app_data_dir().map_err(|_e| CommandError {
        code: "data_dir".into(),
        message: "无法确定应用数据目录".into(),
    })?;
    std::fs::create_dir_all(&dir).map_err(|_e| CommandError {
        code: "data_dir".into(),
        message: "无法创建应用数据目录".into(),
    })?;
    Ok(dir)
}

fn sidecar_binary(app: &AppHandle) -> PathBuf {
    // Production: externalBin sidecar beside resources.
    if let Ok(resource_dir) = app.path().resource_dir() {
        let resolved = resolve_sidecar_path(&resource_dir);
        if resolved.exists() {
            return resolved;
        }
    }
    // Also check executable directory (macOS MacOS folder).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidate = parent.join("xuanji-coordinator");
            if candidate.exists() {
                return candidate;
            }
        }
    }
    PathBuf::from("xuanji-coordinator")
}

fn bootstrap_coordinator(
    app: &AppHandle,
    supervisor: &CoordinatorSupervisor,
) -> Option<StartOptions> {
    // Production packages must only run the sidecar binary — never source Python.
    let data_dir = match data_dir_for_app(app) {
        Ok(d) => d,
        Err(err) => {
            eprintln!("[璇玑] 应用数据目录错误：{}", err.message);
            return None;
        }
    };
    let binary = sidecar_binary(app);
    #[cfg(debug_assertions)]
    {
        if !binary.exists() {
            eprintln!(
                "[璇玑] 调试模式：未找到 Coordinator 辅助程序（{}），未自动启动",
                binary.display()
            );
            return None;
        }
    }
    #[cfg(not(debug_assertions))]
    {
        if !binary.exists() {
            eprintln!(
                "[璇玑] 生产模式：缺少 Coordinator 辅助程序（{}）",
                binary.display()
            );
            return None;
        }
    }

    let options = production_start_options(binary, data_dir);
    match supervisor.start(options.clone()) {
        Ok(info) => {
            eprintln!(
                "[璇玑] Coordinator 已就绪：{}",
                info.base_url.unwrap_or_default()
            );
        }
        Err(err) => {
            eprintln!("[璇玑] Coordinator 启动失败：{err}");
        }
    }
    Some(options)
}

fn monitor_coordinator(
    supervisor: SharedSupervisor,
    options: StartOptions,
    shutdown: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        while !shutdown.load(Ordering::Relaxed) {
            for _ in 0..10 {
                if shutdown.load(Ordering::Relaxed) {
                    return;
                }
                thread::sleep(Duration::from_millis(200));
            }
            if shutdown.load(Ordering::Relaxed) {
                return;
            }
            if let Err(err) = supervisor.recover_if_needed(&options, 3) {
                eprintln!("[璇玑] Coordinator 自动恢复失败：{err}");
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let supervisor = new_shared_supervisor();
    let supervisor_for_setup = Arc::clone(&supervisor);
    let supervisor_for_exit = Arc::clone(&supervisor);
    let monitor_shutdown = Arc::new(AtomicBool::new(false));
    let monitor_shutdown_for_setup = Arc::clone(&monitor_shutdown);
    let monitor_shutdown_for_exit = Arc::clone(&monitor_shutdown);
    let tunnels = new_shared_tunnel_registry();
    let tunnels_for_exit = Arc::clone(&tunnels);

    tauri::Builder::default()
        .menu(|app| {
            let app_menu = Submenu::with_items(
                app,
                "璇玑",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("关于璇玑"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, Some("隐藏璇玑"))?,
                    &PredefinedMenuItem::hide_others(app, Some("隐藏其他应用"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, Some("退出璇玑"))?,
                ],
            )?;
            let file_menu = Submenu::with_items(
                app,
                "文件",
                true,
                &[&PredefinedMenuItem::close_window(app, Some("关闭窗口"))?],
            )?;
            let edit_menu = Submenu::with_items(
                app,
                "编辑",
                true,
                &[
                    &PredefinedMenuItem::undo(app, Some("撤销"))?,
                    &PredefinedMenuItem::redo(app, Some("重做"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, Some("剪切"))?,
                    &PredefinedMenuItem::copy(app, Some("复制"))?,
                    &PredefinedMenuItem::paste(app, Some("粘贴"))?,
                    &PredefinedMenuItem::select_all(app, Some("全选"))?,
                ],
            )?;
            let view_menu = Submenu::with_items(
                app,
                "显示",
                true,
                &[&PredefinedMenuItem::fullscreen(app, Some("进入全屏"))?],
            )?;
            let window_menu = Submenu::with_items(
                app,
                "窗口",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, Some("最小化"))?,
                    &PredefinedMenuItem::maximize(app, Some("最大化"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, Some("关闭窗口"))?,
                ],
            )?;
            Menu::with_items(
                app,
                &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
            )
        })
        .plugin(tauri_plugin_opener::init())
        .manage(supervisor)
        .manage(tunnels)
        .setup(move |app| {
            if let Some(options) =
                bootstrap_coordinator(&app.handle(), supervisor_for_setup.as_ref())
            {
                monitor_coordinator(
                    Arc::clone(&supervisor_for_setup),
                    options,
                    Arc::clone(&monitor_shutdown_for_setup),
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            coordinator_status,
            select_project_dir,
            select_ssh_key,
            list_tunnels,
            close_all_tunnels,
        ])
        .build(tauri::generate_context!())
        .expect("构建璇玑桌面应用失败")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Orphan cleanup: terminate any tracked tunnel PIDs, then stop sidecar.
                monitor_shutdown_for_exit.store(true, Ordering::Relaxed);
                let _ = tunnels_for_exit.close_all();
                let _ = supervisor_for_exit.stop();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::coordinator::*;

    #[test]
    fn reexports_runtime_info_default_stopped() {
        let info = RuntimeInfo::default();
        assert_eq!(info.status, RuntimeStatus::Stopped);
    }
}
