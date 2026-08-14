mod coordinator;
mod tunnel;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::image::Image;
use tauri::menu::{AboutMetadataBuilder, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, State};

use coordinator::{
    new_shared_supervisor, production_start_options, resolve_sidecar_path, CoordinatorError,
    CoordinatorSupervisor, RuntimeInfo, SharedSupervisor, StartOptions,
};
use tunnel::{new_shared_tunnel_registry, SharedTunnelRegistry, TunnelRecord};

const STATUS_TRAY_ID: &str = "xuanji-status";
const STATUS_TRAY_SHOW_ID: &str = "xuanji-status-show";
const STATUS_TRAY_STATE_ID: &str = "xuanji-status-state";
const STATUS_TRAY_QUIT_ID: &str = "xuanji-status-quit";

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
fn restart_coordinator(
    app: AppHandle,
    supervisor: State<'_, SharedSupervisor>,
    shutdown: State<'_, Arc<AtomicBool>>,
) -> Result<RuntimeInfo, CommandError> {
    let _ = supervisor.stop();
    shutdown.store(false, Ordering::Relaxed);
    match bootstrap_coordinator(&app, supervisor.as_ref()) {
        Some(options) => {
            monitor_coordinator(
                Arc::clone(supervisor.inner()),
                options,
                Arc::clone(shutdown.inner()),
            );
            Ok(supervisor.status())
        }
        None => Err(CommandError::from(
            "Coordinator 辅助程序不可用，无法重启".to_string(),
        )),
    }
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
struct MenuLabels<'a> {
    about: &'a str,
    hide: &'a str,
    hide_others: &'a str,
    quit: &'a str,
    file: &'a str,
    close_window: &'a str,
    edit: &'a str,
    undo: &'a str,
    redo: &'a str,
    cut: &'a str,
    copy: &'a str,
    paste: &'a str,
    select_all: &'a str,
    view: &'a str,
    fullscreen: &'a str,
    window: &'a str,
    minimize: &'a str,
    maximize: &'a str,
    tray_show: &'a str,
    tray_state: &'a str,
    tray_quit: &'a str,
    tray_tooltip: &'a str,
}

fn menu_labels(locale: &str) -> MenuLabels<'static> {
    if locale == "en" {
        MenuLabels {
            about: "About 璇玑",
            hide: "Hide 璇玑",
            hide_others: "Hide Others",
            quit: "Quit 璇玑",
            file: "File",
            close_window: "Close Window",
            edit: "Edit",
            undo: "Undo",
            redo: "Redo",
            cut: "Cut",
            copy: "Copy",
            paste: "Paste",
            select_all: "Select All",
            view: "View",
            fullscreen: "Enter Full Screen",
            window: "Window",
            minimize: "Minimize",
            maximize: "Zoom",
            tray_show: "Show 璇玑",
            tray_state: "璇玑 is running",
            tray_quit: "Quit 璇玑",
            tray_tooltip: "璇玑 · AI Agent Orchestration",
        }
    } else {
        MenuLabels {
            about: "关于璇玑",
            hide: "隐藏璇玑",
            hide_others: "隐藏其他应用",
            quit: "退出璇玑",
            file: "文件",
            close_window: "关闭窗口",
            edit: "编辑",
            undo: "撤销",
            redo: "重做",
            cut: "剪切",
            copy: "复制",
            paste: "粘贴",
            select_all: "全选",
            view: "显示",
            fullscreen: "进入全屏",
            window: "窗口",
            minimize: "最小化",
            maximize: "最大化",
            tray_show: "显示璇玑",
            tray_state: "璇玑正在运行",
            tray_quit: "退出璇玑",
            tray_tooltip: "璇玑 · 智能任务协作",
        }
    }
}

fn build_menu(app: &AppHandle, locale: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let labels = menu_labels(locale);
    let about_metadata = AboutMetadataBuilder::new()
        .name(Some("璇玑"))
        .version(Some(app.package_info().version.to_string()))
        .icon(app.default_window_icon().cloned())
        .build();
    let app_menu = Submenu::with_items(
        app,
        "璇玑",
        true,
        &[
            &PredefinedMenuItem::about(app, Some(labels.about), Some(about_metadata))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some(labels.hide))?,
            &PredefinedMenuItem::hide_others(app, Some(labels.hide_others))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some(labels.quit))?,
        ],
    )?;
    let file_menu = Submenu::with_items(
        app,
        labels.file,
        true,
        &[&PredefinedMenuItem::close_window(
            app,
            Some(labels.close_window),
        )?],
    )?;
    let edit_menu = Submenu::with_items(
        app,
        labels.edit,
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(labels.undo))?,
            &PredefinedMenuItem::redo(app, Some(labels.redo))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(labels.cut))?,
            &PredefinedMenuItem::copy(app, Some(labels.copy))?,
            &PredefinedMenuItem::paste(app, Some(labels.paste))?,
            &PredefinedMenuItem::select_all(app, Some(labels.select_all))?,
        ],
    )?;
    let view_menu = Submenu::with_items(
        app,
        labels.view,
        true,
        &[&PredefinedMenuItem::fullscreen(
            app,
            Some(labels.fullscreen),
        )?],
    )?;
    let window_menu = Submenu::with_items(
        app,
        labels.window,
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some(labels.minimize))?,
            &PredefinedMenuItem::maximize(app, Some(labels.maximize))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some(labels.close_window))?,
        ],
    )?;
    Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
    )
}

fn build_status_tray_menu(app: &AppHandle, locale: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let labels = menu_labels(locale);
    let show = MenuItem::with_id(
        app,
        STATUS_TRAY_SHOW_ID,
        labels.tray_show,
        true,
        None::<&str>,
    )?;
    let state = MenuItem::with_id(
        app,
        STATUS_TRAY_STATE_ID,
        labels.tray_state,
        false,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app,
        STATUS_TRAY_QUIT_ID,
        labels.tray_quit,
        true,
        None::<&str>,
    )?;
    Menu::with_items(
        app,
        &[
            &show,
            &PredefinedMenuItem::separator(app)?,
            &state,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn handle_status_tray_menu(app: &AppHandle, item_id: &str) {
    match item_id {
        STATUS_TRAY_SHOW_ID => show_main_window(app),
        STATUS_TRAY_QUIT_ID => app.exit(0),
        _ => {}
    }
}

fn build_status_tray(app: &AppHandle, locale: &str) -> tauri::Result<()> {
    let labels = menu_labels(locale);
    let menu = build_status_tray_menu(app, locale)?;
    let icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?;
    TrayIconBuilder::with_id(STATUS_TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip(labels.tray_tooltip)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_status_tray_menu(app, event.id().as_ref()))
        .build(app)?;
    Ok(())
}

#[tauri::command]
fn set_app_locale(app: AppHandle, locale: String) -> Result<(), CommandError> {
    let menu = build_menu(&app, &locale).map_err(|e| CommandError {
        code: "menu_locale".into(),
        message: e.to_string(),
    })?;
    app.set_menu(menu).map_err(|e| CommandError {
        code: "menu_locale".into(),
        message: e.to_string(),
    })?;
    if let Some(tray) = app.tray_by_id(STATUS_TRAY_ID) {
        let tray_menu = build_status_tray_menu(&app, &locale).map_err(|e| CommandError {
            code: "menu_locale".into(),
            message: e.to_string(),
        })?;
        tray.set_menu(Some(tray_menu)).map_err(|e| CommandError {
            code: "menu_locale".into(),
            message: e.to_string(),
        })?;
        tray.set_tooltip(Some(menu_labels(&locale).tray_tooltip))
            .map_err(|e| CommandError {
                code: "menu_locale".into(),
                message: e.to_string(),
            })?;
    }
    Ok(())
}

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
        .menu(|app| build_menu(app, "zh-CN"))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(supervisor)
        .manage(tunnels)
        .manage(Arc::clone(&monitor_shutdown))
        .setup(move |app| {
            build_status_tray(&app.handle(), "zh-CN")?;
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
            restart_coordinator,
            select_project_dir,
            select_ssh_key,
            list_tunnels,
            close_all_tunnels,
            set_app_locale,
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

    #[test]
    fn menu_labels_localize_status_tray() {
        let chinese = super::menu_labels("zh-CN");
        assert_eq!(chinese.tray_show, "显示璇玑");
        assert_eq!(chinese.tray_state, "璇玑正在运行");

        let english = super::menu_labels("en");
        assert_eq!(english.tray_show, "Show 璇玑");
        assert_eq!(english.tray_state, "璇玑 is running");
    }
}
