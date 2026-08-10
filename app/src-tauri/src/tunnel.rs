//! Owned per-task SSH tunnel bookkeeping on the desktop shell side.
//!
//! Python Coordinator owns real `ssh -N -L` processes. This module tracks
//! owner ids, local ports, and optional child PIDs so the Tauri app can force
//! cleanup on exit and reap orphans that survive a crashed coordinator.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

/// Tunnel handle exposed to the frontend / diagnostics.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TunnelRecord {
    pub owner_id: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub pid: Option<u32>,
}

#[allow(dead_code)]
#[derive(Debug, thiserror::Error)]
pub enum TunnelError {
    #[error("该任务的 SSH 隧道已经存在：{0}")]
    AlreadyOpen(String),
    #[error("未找到该任务的 SSH 隧道：{0}")]
    NotFound(String),
    #[error("SSH 隧道进程操作失败")]
    Io(String),
}

impl TunnelError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::AlreadyOpen(_) => "tunnel_already_open",
            Self::NotFound(_) => "tunnel_not_found",
            Self::Io(_) => "io_error",
        }
    }
}

/// Tracks per-attempt tunnel ownership for orphan cleanup.
pub struct TunnelRegistry {
    inner: Mutex<HashMap<String, TunnelRecord>>,
}

#[allow(dead_code)]
impl TunnelRegistry {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, record: TunnelRecord) -> Result<(), TunnelError> {
        let mut guard = self.inner.lock().expect("tunnel registry lock");
        if guard.contains_key(&record.owner_id) {
            return Err(TunnelError::AlreadyOpen(record.owner_id));
        }
        guard.insert(record.owner_id.clone(), record);
        Ok(())
    }

    pub fn unregister(&self, owner_id: &str) -> Result<TunnelRecord, TunnelError> {
        let mut guard = self.inner.lock().expect("tunnel registry lock");
        guard
            .remove(owner_id)
            .ok_or_else(|| TunnelError::NotFound(owner_id.to_string()))
    }

    pub fn list(&self) -> Vec<TunnelRecord> {
        let guard = self.inner.lock().expect("tunnel registry lock");
        guard.values().cloned().collect()
    }

    pub fn owners(&self) -> Vec<String> {
        let guard = self.inner.lock().expect("tunnel registry lock");
        guard.keys().cloned().collect()
    }

    /// Drop all ownership records and best-effort kill associated PIDs.
    pub fn close_all(&self) -> Vec<TunnelRecord> {
        let mut guard = self.inner.lock().expect("tunnel registry lock");
        let records: Vec<TunnelRecord> = guard.drain().map(|(_, record)| record).collect();
        drop(guard);
        for record in &records {
            if let Some(pid) = record.pid {
                let _ = terminate_pid(pid);
            }
        }
        records
    }

    /// Kill PIDs that still look like live SSH tunnel processes for owned records.
    pub fn reap_orphans(&self) -> usize {
        let records = {
            let guard = self.inner.lock().expect("tunnel registry lock");
            guard.values().cloned().collect::<Vec<_>>()
        };
        let mut reaped = 0usize;
        for record in records {
            if let Some(pid) = record.pid {
                if process_alive(pid) {
                    if terminate_pid(pid).is_ok() {
                        reaped += 1;
                    }
                }
                let _ = self.unregister(&record.owner_id);
            }
        }
        reaped
    }
}

impl Default for TunnelRegistry {
    fn default() -> Self {
        Self::new()
    }
}

pub type SharedTunnelRegistry = Arc<TunnelRegistry>;

pub fn new_shared_tunnel_registry() -> SharedTunnelRegistry {
    Arc::new(TunnelRegistry::new())
}

/// Build the SSH argv used by both documentation and process audits.
/// Token/credentials must never appear in this list.
#[allow(dead_code)]
pub fn build_ssh_tunnel_argv(
    local_port: u16,
    remote_port: u16,
    user: &str,
    host: &str,
    port: u16,
    key_path: Option<&str>,
    known_hosts_path: &str,
) -> Vec<String> {
    let mut argv = vec![
        "ssh".into(),
        "-N".into(),
        "-L".into(),
        format!("{local_port}:127.0.0.1:{remote_port}"),
        "-o".into(),
        "ExitOnForwardFailure=yes".into(),
        "-o".into(),
        "StrictHostKeyChecking=yes".into(),
        "-o".into(),
        format!("UserKnownHostsFile={known_hosts_path}"),
        "-o".into(),
        "BatchMode=yes".into(),
        "-o".into(),
        "ConnectTimeout=10".into(),
        "-p".into(),
        port.to_string(),
    ];
    if let Some(key) = key_path {
        argv.push("-i".into());
        argv.push(key.into());
    }
    argv.push(format!("{user}@{host}"));
    argv
}

#[allow(dead_code)]
fn process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // Safety: kill(pid, 0) only probes existence.
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

fn terminate_pid(pid: u32) -> Result<(), TunnelError> {
    #[cfg(unix)]
    {
        let term = unsafe { libc::kill(pid as i32, libc::SIGTERM) };
        if term != 0 {
            // Already dead is fine.
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
        let still = unsafe { libc::kill(pid as i32, 0) == 0 };
        if still {
            let _ = unsafe { libc::kill(pid as i32, libc::SIGKILL) };
        }
        Ok(())
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_list_and_close_all() {
        let registry = TunnelRegistry::new();
        registry
            .register(TunnelRecord {
                owner_id: "attempt-1".into(),
                local_port: 18080,
                remote_host: "127.0.0.1".into(),
                remote_port: 8642,
                pid: None,
            })
            .unwrap();
        registry
            .register(TunnelRecord {
                owner_id: "attempt-2".into(),
                local_port: 18081,
                remote_host: "127.0.0.1".into(),
                remote_port: 8642,
                pid: None,
            })
            .unwrap();
        assert_eq!(registry.list().len(), 2);
        let closed = registry.close_all();
        assert_eq!(closed.len(), 2);
        assert!(registry.list().is_empty());
    }

    #[test]
    fn duplicate_owner_rejected() {
        let registry = TunnelRegistry::new();
        let record = TunnelRecord {
            owner_id: "a".into(),
            local_port: 1,
            remote_host: "127.0.0.1".into(),
            remote_port: 8642,
            pid: None,
        };
        registry.register(record.clone()).unwrap();
        let err = registry.register(record).unwrap_err();
        assert_eq!(err.code(), "tunnel_already_open");
    }

    #[test]
    fn ssh_argv_has_required_security_flags() {
        let argv = build_ssh_tunnel_argv(
            19090,
            8642,
            "ubuntu",
            "remote.test",
            22,
            Some("/tmp/id_ed25519"),
            "/tmp/xuanji/known_hosts",
        );
        assert_eq!(argv[0], "ssh");
        assert!(argv.contains(&"-N".into()));
        assert!(argv.contains(&"19090:127.0.0.1:8642".into()));
        assert!(argv.contains(&"ExitOnForwardFailure=yes".into()));
        assert!(argv.contains(&"StrictHostKeyChecking=yes".into()));
        assert!(argv.contains(&"UserKnownHostsFile=/tmp/xuanji/known_hosts".into()));
        assert!(argv.contains(&"ubuntu@remote.test".into()));
        let joined = argv.join(" ");
        assert!(!joined.to_lowercase().contains("bearer"));
        assert!(!joined.contains("token="));
    }

    #[test]
    fn unregister_missing_owner() {
        let registry = TunnelRegistry::new();
        let err = registry.unregister("missing").unwrap_err();
        assert_eq!(err.code(), "tunnel_not_found");
    }
}
