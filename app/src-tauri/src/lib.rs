mod coordinator;
mod tunnel;

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use coordinator::{
    new_shared_supervisor, production_start_options, resolve_sidecar_path, CoordinatorError,
    CoordinatorSupervisor, RuntimeInfo, SharedSupervisor,
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
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| CommandError {
            code: "data_dir".into(),
            message: e.to_string(),
        })?;
    std::fs::create_dir_all(&dir).map_err(|e| CommandError {
        code: "data_dir".into(),
        message: e.to_string(),
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

fn bootstrap_coordinator(app: &AppHandle, supervisor: &CoordinatorSupervisor) {
    // Production packages must only run the sidecar binary — never source Python.
    let data_dir = match data_dir_for_app(app) {
        Ok(d) => d,
        Err(err) => {
            eprintln!("[xuanji] data dir error: {}", err.message);
            return;
        }
    };
    let binary = sidecar_binary(app);
    #[cfg(debug_assertions)]
    {
        if !binary.exists() {
            eprintln!(
                "[xuanji] debug: sidecar not found at {}, coordinator not auto-started",
                binary.display()
            );
            return;
        }
    }
    #[cfg(not(debug_assertions))]
    {
        if !binary.exists() {
            eprintln!(
                "[xuanji] production: sidecar missing at {}",
                binary.display()
            );
            return;
        }
    }

    let options = production_start_options(binary, data_dir);
    match supervisor.start(options) {
        Ok(info) => {
            eprintln!(
                "[xuanji] coordinator healthy on {}",
                info.base_url.unwrap_or_default()
            );
        }
        Err(err) => {
            eprintln!("[xuanji] coordinator start failed: {err}");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let supervisor = new_shared_supervisor();
    let supervisor_for_setup = Arc::clone(&supervisor);
    let supervisor_for_exit = Arc::clone(&supervisor);
    let tunnels = new_shared_tunnel_registry();
    let tunnels_for_exit = Arc::clone(&tunnels);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(supervisor)
        .manage(tunnels)
        .setup(move |app| {
            bootstrap_coordinator(&app.handle(), supervisor_for_setup.as_ref());
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
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Orphan cleanup: terminate any tracked tunnel PIDs, then stop sidecar.
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
