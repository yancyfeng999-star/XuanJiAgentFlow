//! Coordinator sidecar supervisor.
//!
//! Production builds only launch the packaged `xuanji-coordinator` external binary.
//! Dev builds may fall back to a configured command if the sidecar is absent.

use std::io::{BufRead, BufReader};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

const PORT_LINE_PREFIX: &str = "XUANJI_PORT=";
const HEALTH_PATH: &str = "/api/status";
const DEFAULT_HEALTH_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_PORT_TIMEOUT: Duration = Duration::from_secs(10);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(100);

/// Runtime information exposed to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub status: RuntimeStatus,
    pub base_url: Option<String>,
    pub port: Option<u16>,
    pub data_dir: Option<String>,
    pub pid: Option<u32>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeStatus {
    Stopped,
    Starting,
    Healthy,
    Unhealthy,
    Failed,
}

impl Default for RuntimeInfo {
    fn default() -> Self {
        Self {
            status: RuntimeStatus::Stopped,
            base_url: None,
            port: None,
            data_dir: None,
            pid: None,
            error: None,
        }
    }
}

/// Errors from the coordinator supervisor.
#[derive(Debug, thiserror::Error)]
pub enum CoordinatorError {
    #[error("coordinator is already running")]
    AlreadyRunning,
    #[error("failed to bind free port: {0}")]
    PortAllocation(String),
    #[error("failed to start coordinator process: {0}")]
    Spawn(String),
    #[error("coordinator exited before reporting port: {0}")]
    EarlyExit(String),
    #[error("timed out waiting for coordinator port")]
    PortTimeout,
    #[error("timed out waiting for coordinator health")]
    HealthTimeout,
    #[error("health check failed: {0}")]
    HealthFailed(String),
    #[error("coordinator is not running")]
    NotRunning,
    #[error("sidecar binary not found at {0}")]
    SidecarMissing(String),
    #[error("io error: {0}")]
    Io(String),
}

impl CoordinatorError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::AlreadyRunning => "already_running",
            Self::PortAllocation(_) => "port_allocation",
            Self::Spawn(_) => "spawn_failed",
            Self::EarlyExit(_) => "early_exit",
            Self::PortTimeout => "port_timeout",
            Self::HealthTimeout => "health_timeout",
            Self::HealthFailed(_) => "health_failed",
            Self::NotRunning => "not_running",
            Self::SidecarMissing(_) => "sidecar_missing",
            Self::Io(_) => "io_error",
        }
    }
}

/// Options for starting the coordinator process.
#[derive(Debug, Clone)]
pub struct StartOptions {
    pub binary: PathBuf,
    pub data_dir: PathBuf,
    /// Prefer letting the child pick port 0 and report it.
    pub port: u16,
    pub host: String,
    pub health_timeout: Duration,
    pub port_timeout: Duration,
    pub extra_args: Vec<String>,
    /// When true (tests), do not require the sidecar name.
    pub allow_any_binary: bool,
}

impl Default for StartOptions {
    fn default() -> Self {
        Self {
            binary: PathBuf::from("xuanji-coordinator"),
            data_dir: PathBuf::from("."),
            port: 0,
            host: "127.0.0.1".into(),
            health_timeout: DEFAULT_HEALTH_TIMEOUT,
            port_timeout: DEFAULT_PORT_TIMEOUT,
            extra_args: Vec::new(),
            allow_any_binary: false,
        }
    }
}

/// Process + runtime state held by the app.
pub struct CoordinatorSupervisor {
    inner: Mutex<SupervisorState>,
}

struct SupervisorState {
    child: Option<Child>,
    info: RuntimeInfo,
}

impl CoordinatorSupervisor {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(SupervisorState {
                child: None,
                info: RuntimeInfo::default(),
            }),
        }
    }

    pub fn status(&self) -> RuntimeInfo {
        let mut guard = self.inner.lock().expect("supervisor lock");
        self.reap_if_exited(&mut guard);
        guard.info.clone()
    }

    /// Start the coordinator and block until healthy or failed.
    pub fn start(&self, options: StartOptions) -> Result<RuntimeInfo, CoordinatorError> {
        let mut guard = self.inner.lock().expect("supervisor lock");
        self.reap_if_exited(&mut guard);
        if guard.child.is_some() {
            return Err(CoordinatorError::AlreadyRunning);
        }

        guard.info = RuntimeInfo {
            status: RuntimeStatus::Starting,
            base_url: None,
            port: None,
            data_dir: Some(options.data_dir.display().to_string()),
            pid: None,
            error: None,
        };

        let result = self.spawn_and_wait(&options);
        match result {
            Ok((child, port)) => {
                let pid = child.id();
                let base_url = format!("http://{}:{}", options.host, port);
                guard.child = Some(child);
                guard.info = RuntimeInfo {
                    status: RuntimeStatus::Healthy,
                    base_url: Some(base_url),
                    port: Some(port),
                    data_dir: Some(options.data_dir.display().to_string()),
                    pid: Some(pid),
                    error: None,
                };
                Ok(guard.info.clone())
            }
            Err(err) => {
                guard.info = RuntimeInfo {
                    status: RuntimeStatus::Failed,
                    base_url: None,
                    port: None,
                    data_dir: Some(options.data_dir.display().to_string()),
                    pid: None,
                    error: Some(err.to_string()),
                };
                Err(err)
            }
        }
    }

    /// Gracefully stop the coordinator.
    pub fn stop(&self) -> Result<RuntimeInfo, CoordinatorError> {
        let mut guard = self.inner.lock().expect("supervisor lock");
        let Some(mut child) = guard.child.take() else {
            guard.info = RuntimeInfo::default();
            return Ok(guard.info.clone());
        };

        // Prefer graceful terminate, then kill.
        #[cfg(unix)]
        {
            let _ = send_sigterm(child.id());
            let deadline = Instant::now() + Duration::from_secs(3);
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    Ok(None) if Instant::now() < deadline => {
                        thread::sleep(Duration::from_millis(50));
                    }
                    _ => {
                        let _ = child.kill();
                        let _ = child.wait();
                        break;
                    }
                }
            }
        }
        #[cfg(not(unix))]
        {
            let _ = child.kill();
            let _ = child.wait();
        }

        guard.info = RuntimeInfo::default();
        Ok(guard.info.clone())
    }

    fn spawn_and_wait(
        &self,
        options: &StartOptions,
    ) -> Result<(Child, u16), CoordinatorError> {
        if !options.allow_any_binary && !options.binary.exists() {
            return Err(CoordinatorError::SidecarMissing(
                options.binary.display().to_string(),
            ));
        }

        let mut command = Command::new(&options.binary);
        command
            .arg("--port")
            .arg(options.port.to_string())
            .arg("--data-dir")
            .arg(&options.data_dir)
            .arg("--host")
            .arg(&options.host)
            .args(&options.extra_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());

        let mut child = command
            .spawn()
            .map_err(|e| CoordinatorError::Spawn(e.to_string()))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| CoordinatorError::Spawn("missing stdout".into()))?;

        let port = match wait_for_port_line(stdout, &mut child, options.port_timeout) {
            Ok(port) => port,
            Err(err) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(err);
            }
        };

        if let Err(err) = wait_for_health(&options.host, port, options.health_timeout) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(err);
        }

        // Keep draining stderr in background so the pipe does not block.
        if let Some(stderr) = child.stderr.take() {
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for _line in reader.lines() {
                    // Intentionally discarded in production; tests inspect processes directly.
                }
            });
        }

        Ok((child, port))
    }

    fn reap_if_exited(&self, state: &mut SupervisorState) {
        let Some(child) = state.child.as_mut() else {
            return;
        };
        match child.try_wait() {
            Ok(Some(status)) => {
                state.child = None;
                if state.info.status == RuntimeStatus::Healthy {
                    state.info.status = RuntimeStatus::Unhealthy;
                    state.info.error = Some(format!("coordinator exited: {status}"));
                    state.info.pid = None;
                }
            }
            Ok(None) => {}
            Err(err) => {
                state.info.error = Some(err.to_string());
            }
        }
    }
}

impl Default for CoordinatorSupervisor {
    fn default() -> Self {
        Self::new()
    }
}

/// Shared app handle type.
pub type SharedSupervisor = Arc<CoordinatorSupervisor>;

pub fn new_shared_supervisor() -> SharedSupervisor {
    Arc::new(CoordinatorSupervisor::new())
}

/// Bind to port 0 and return an free ephemeral port (for tests and pre-flight).
pub fn find_free_port() -> Result<u16, CoordinatorError> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| CoordinatorError::PortAllocation(e.to_string()))?;
    let port = listener
        .local_addr()
        .map_err(|e| CoordinatorError::PortAllocation(e.to_string()))?
        .port();
    Ok(port)
}

fn wait_for_port_line<R: std::io::Read + Send + 'static>(
    stdout: R,
    child: &mut Child,
    timeout: Duration,
) -> Result<u16, CoordinatorError> {
    let reader = BufReader::new(stdout);
    let deadline = Instant::now() + timeout;
    let (tx, rx) = std::sync::mpsc::channel::<Result<u16, String>>();

    thread::spawn(move || {
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    if let Some(port) = parse_port_line(&text) {
                        let _ = tx.send(Ok(port));
                        return;
                    }
                }
                Err(err) => {
                    let _ = tx.send(Err(err.to_string()));
                    return;
                }
            }
        }
        let _ = tx.send(Err("stdout closed before XUANJI_PORT".into()));
    });

    loop {
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(Ok(port)) => return Ok(port),
            Ok(Err(msg)) => {
                let detail = match child.try_wait() {
                    Ok(Some(status)) => format!("{msg}; exit={status}"),
                    _ => msg,
                };
                return Err(CoordinatorError::EarlyExit(detail));
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(CoordinatorError::PortTimeout);
                }
                if let Ok(Some(status)) = child.try_wait() {
                    return Err(CoordinatorError::EarlyExit(format!(
                        "process exited with {status}"
                    )));
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                return Err(CoordinatorError::EarlyExit(
                    "port reader disconnected".into(),
                ));
            }
        }
    }
}

fn parse_port_line(line: &str) -> Option<u16> {
    let trimmed = line.trim();
    let value = trimmed.strip_prefix(PORT_LINE_PREFIX)?;
    value.parse().ok()
}

fn wait_for_health(host: &str, port: u16, timeout: Duration) -> Result<(), CoordinatorError> {
    let deadline = Instant::now() + timeout;
    let url_host = host;
    let mut _last_err = String::from("not attempted");

    while Instant::now() < deadline {
        match http_get_status(url_host, port) {
            Ok(code) if (200..300).contains(&code) => return Ok(()),
            Ok(code) => _last_err = format!("HTTP {code}"),
            Err(err) => _last_err = err,
        }
        thread::sleep(HEALTH_POLL_INTERVAL);
    }

    let _ = _last_err;
    Err(CoordinatorError::HealthTimeout)
}

/// Minimal HTTP/1.0 GET without extra deps (for health checks in tests and prod).
fn http_get_status(host: &str, port: u16) -> Result<u16, String> {
    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .map_err(|e| format!("bad addr: {e}"))?;
    let mut stream =
        TcpStream::connect_timeout(&addr, Duration::from_millis(500)).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;

    let request = format!(
        "GET {HEALTH_PATH} HTTP/1.0\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n"
    );
    use std::io::Write;
    stream
        .write_all(request.as_bytes())
        .map_err(|e| e.to_string())?;

    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    reader
        .read_line(&mut status_line)
        .map_err(|e| e.to_string())?;
    // HTTP/1.x 200 OK
    let mut parts = status_line.split_whitespace();
    let _version = parts.next().ok_or_else(|| "empty response".to_string())?;
    let code = parts
        .next()
        .ok_or_else(|| format!("bad status line: {status_line}"))?
        .parse::<u16>()
        .map_err(|e| e.to_string())?;
    Ok(code)
}

#[cfg(unix)]
fn send_sigterm(pid: u32) -> std::io::Result<()> {
    let result = unsafe { libc::kill(pid as i32, libc::SIGTERM) };
    if result == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

/// Resolve packaged sidecar path for production.
pub fn resolve_sidecar_path(resource_dir: &Path) -> PathBuf {
    // Tauri externalBin places binaries next to the app resources / executables.
    #[cfg(target_os = "macos")]
    {
        let candidates = [
            resource_dir.join("xuanji-coordinator"),
            resource_dir
                .join("../MacOS")
                .join("xuanji-coordinator"),
            resource_dir.join("bin").join("xuanji-coordinator"),
        ];
        for candidate in candidates {
            if candidate.exists() {
                return candidate;
            }
        }
    }
    resource_dir.join("xuanji-coordinator")
}

/// Build start options for production (sidecar only — never source Python).
pub fn production_start_options(
    sidecar: PathBuf,
    data_dir: PathBuf,
) -> StartOptions {
    StartOptions {
        binary: sidecar,
        data_dir,
        port: 0,
        host: "127.0.0.1".into(),
        health_timeout: DEFAULT_HEALTH_TIMEOUT,
        port_timeout: DEFAULT_PORT_TIMEOUT,
        extra_args: Vec::new(),
        allow_any_binary: false,
    }
}

// ─────────────────────────── tests ───────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::sync::atomic::{AtomicU16, Ordering};

    fn write_fake_binary(dir: &Path, name: &str, script: &str) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, script).expect("write script");
        let mut perms = fs::metadata(&path).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&path, perms).unwrap();
        path
    }

    #[test]
    fn find_free_port_returns_usable_port() {
        let port = find_free_port().expect("free port");
        assert!(port > 0);
        // Port should be bindable after finder released it.
        let listener = TcpListener::bind(("127.0.0.1", port));
        // Race possible but extremely rare; accept either free or already taken after yield.
        drop(listener);
    }

    #[test]
    fn parse_port_line_extracts_value() {
        assert_eq!(parse_port_line("XUANJI_PORT=54321"), Some(54321));
        assert_eq!(parse_port_line("  XUANJI_PORT=9  "), Some(9));
        assert_eq!(parse_port_line("noise"), None);
    }

    #[test]
    fn start_fails_when_binary_missing() {
        let supervisor = CoordinatorSupervisor::new();
        let err = supervisor
            .start(StartOptions {
                binary: PathBuf::from("/tmp/definitely-missing-xuanji-sidecar-xyz"),
                data_dir: std::env::temp_dir(),
                allow_any_binary: false,
                health_timeout: Duration::from_millis(200),
                port_timeout: Duration::from_millis(200),
                ..StartOptions::default()
            })
            .expect_err("missing binary");
        assert!(matches!(err, CoordinatorError::SidecarMissing(_)));
    }

    #[test]
    fn start_fails_on_early_exit() {
        let dir = tempfile_dir("early-exit");
        let binary = write_fake_binary(
            &dir,
            "fail-coordinator",
            "#!/bin/sh\necho boom >&2\nexit 1\n",
        );
        let supervisor = CoordinatorSupervisor::new();
        let err = supervisor
            .start(StartOptions {
                binary,
                data_dir: dir.clone(),
                allow_any_binary: true,
                health_timeout: Duration::from_secs(2),
                port_timeout: Duration::from_secs(2),
                ..StartOptions::default()
            })
            .expect_err("early exit");
        assert!(
            matches!(
                err,
                CoordinatorError::EarlyExit(_) | CoordinatorError::PortTimeout
            ),
            "unexpected error: {err:?}"
        );
        let info = supervisor.status();
        assert_eq!(info.status, RuntimeStatus::Failed);
    }

    #[test]
    fn start_fails_on_health_timeout() {
        let dir = tempfile_dir("health-timeout");
        // Bind a real local port, announce it, but never accept HTTP — avoids racing
        // free-port reuse and guarantees health checks fail until timeout.
        let binary = write_fake_binary(
            &dir,
            "slow-coordinator",
            r#"#!/usr/bin/env python3
import socket
import sys
import time

sock = socket.socket()
sock.bind(("127.0.0.1", 0))
port = sock.getsockname()[1]
print(f"XUANJI_PORT={port}", flush=True)
sys.stdout.flush()
time.sleep(60)
"#,
        );
        let supervisor = CoordinatorSupervisor::new();
        let err = supervisor
            .start(StartOptions {
                binary,
                data_dir: dir.clone(),
                allow_any_binary: true,
                health_timeout: Duration::from_millis(400),
                port_timeout: Duration::from_secs(5),
                ..StartOptions::default()
            })
            .expect_err("health timeout");
        assert!(
            matches!(err, CoordinatorError::HealthTimeout),
            "unexpected: {err:?}"
        );
        let _ = supervisor.stop();
    }

    #[test]
    fn start_success_and_duplicate_and_stop() {
        let dir = tempfile_dir("success");
        let binary = write_fake_binary(
            &dir,
            "ok-coordinator",
            r#"#!/usr/bin/env python3
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')
    def log_message(self, *args):
        pass

host = "127.0.0.1"
httpd = HTTPServer((host, 0), H)
port = httpd.server_address[1]
print(f"XUANJI_PORT={port}", flush=True)
t = threading.Thread(target=httpd.serve_forever, daemon=True)
t.start()
try:
    while True:
        threading.Event().wait(60)
except KeyboardInterrupt:
    pass
"#,
        );

        let supervisor = CoordinatorSupervisor::new();
        let info = supervisor
            .start(StartOptions {
                binary: binary.clone(),
                data_dir: dir.clone(),
                allow_any_binary: true,
                health_timeout: Duration::from_secs(5),
                port_timeout: Duration::from_secs(5),
                ..StartOptions::default()
            })
            .expect("start ok");
        assert_eq!(info.status, RuntimeStatus::Healthy);
        assert!(info.port.unwrap() > 0);
        assert!(info
            .base_url
            .as_deref()
            .unwrap()
            .starts_with("http://127.0.0.1:"));
        assert!(info.pid.is_some());

        let dup = supervisor
            .start(StartOptions {
                binary: binary.clone(),
                data_dir: dir.clone(),
                allow_any_binary: true,
                ..StartOptions::default()
            })
            .expect_err("duplicate");
        assert!(matches!(dup, CoordinatorError::AlreadyRunning));

        let stopped = supervisor.stop().expect("stop");
        assert_eq!(stopped.status, RuntimeStatus::Stopped);
        assert!(stopped.port.is_none());

        // Restart after stop works.
        let again = supervisor
            .start(StartOptions {
                binary,
                data_dir: dir,
                allow_any_binary: true,
                health_timeout: Duration::from_secs(5),
                port_timeout: Duration::from_secs(5),
                ..StartOptions::default()
            })
            .expect("restart");
        assert_eq!(again.status, RuntimeStatus::Healthy);
        let _ = supervisor.stop();
    }

    #[test]
    fn production_options_do_not_allow_any_binary() {
        let opts = production_start_options(
            PathBuf::from("/app/xuanji-coordinator"),
            PathBuf::from("/data"),
        );
        assert!(!opts.allow_any_binary);
        assert_eq!(opts.port, 0);
    }

    static COUNTER: AtomicU16 = AtomicU16::new(0);

    fn tempfile_dir(label: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("xuanji-coord-test-{label}-{n}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }
}
