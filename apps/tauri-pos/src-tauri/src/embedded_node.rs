//! Embedded Node process: packaged `desktop-runtime.js` (Express + Prisma + embedded PostgreSQL).
//! Uses `desktop_log` for `logs/backend.log` and `desktop_paths` for port / PATH enrichment.
//! Emits Tauri events: `pos-backend-ready`, `pos-backend-startup-timeout`, `pos-backend-exit`.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::json;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;

use crate::desktop_log::append_backend_log;
use crate::desktop_paths;

const STDERR_RING_MAX: usize = 120;
const TCP_READY_TIMEOUT: Duration = Duration::from_secs(90);
const TCP_POLL_INTERVAL: Duration = Duration::from_millis(250);
const SPAWN_MAX_ATTEMPTS: u32 = 5;
const SPAWN_BACKOFF_SECS: u64 = 3;
const TCP_CONNECT_PROBE: Duration = Duration::from_millis(400);
const HTTP_HEALTH_PROBE: Duration = Duration::from_millis(900);
const RESTART_MAX: u32 = 12;
const RESTART_BACKOFF_SECS: u64 = 4;

#[derive(Clone)]
struct BackendSpawnParams {
    app_data: PathBuf,
    bundled_api_dir: PathBuf,
    node_exe: PathBuf,
    runtime_path: PathBuf,
    env_pos_env_file: PathBuf,
    path_val: String,
}

fn push_stderr_line(ring: &Arc<Mutex<Vec<String>>>, line: String) {
    if let Ok(mut g) = ring.lock() {
        g.push(line);
        if g.len() > STDERR_RING_MAX {
            let drain = g.len() - STDERR_RING_MAX;
            g.drain(0..drain);
        }
    }
}

pub struct EmbeddedBackend {
    pub child: Arc<Mutex<Option<Child>>>,
    pub stderr_ring: Arc<Mutex<Vec<String>>>,
    #[allow(dead_code)]
    pub log_path: PathBuf,
    pub alive: Arc<AtomicBool>,
    pub ready: Arc<AtomicBool>,
}

impl EmbeddedBackend {
    pub fn stderr_tail_joined(&self) -> String {
        self.stderr_ring
            .lock()
            .map(|v| v.join("\n"))
            .unwrap_or_default()
    }

    pub fn is_running(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::SeqCst)
    }

    pub fn child_pid(&self) -> Option<u32> {
        let Ok(g) = self.child.lock() else {
            return None;
        };
        g.as_ref().map(|c| c.id())
    }

    pub fn kill_child(&self) {
        self.alive.store(false, Ordering::SeqCst);
        self.ready.store(false, Ordering::SeqCst);
        if let Ok(mut g) = self.child.lock() {
            if let Some(mut c) = g.take() {
                let _ = c.kill();
                let _ = c.wait();
            }
        }
    }
}

fn probe_loopback_port(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, TCP_CONNECT_PROBE).is_ok()
}

/// True when our Express `/health` responds 2xx with a success payload (not merely an open TCP port).
fn probe_http_health(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = match TcpStream::connect_timeout(&addr, HTTP_HEALTH_PROBE) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(HTTP_HEALTH_PROBE));
    let _ = stream.set_write_timeout(Some(HTTP_HEALTH_PROBE));
    let req = format!(
        "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 1024];
    let Ok(n) = stream.read(&mut buf) else {
        return false;
    };
    let text = String::from_utf8_lossy(&buf[..n]);
    let status_ok = text.starts_with("HTTP/1.1 200") || text.starts_with("HTTP/1.0 200");
    let body_ok = text.contains("\"success\":true")
        || text.contains("Service healthy")
        || text.contains("\"status\":\"ok\"");
    status_ok && body_ok
}

fn spawn_backend_ready_poller(
    app: AppHandle,
    log_path: PathBuf,
    alive: Arc<AtomicBool>,
    ready: Arc<AtomicBool>,
    port: u16,
) {
    std::thread::spawn(move || {
        let started = Instant::now();
        append_backend_log(
            &log_path,
            &format!(
                "ready-poller: waiting for GET /health on 127.0.0.1:{port} (timeout {}s)",
                TCP_READY_TIMEOUT.as_secs()
            ),
        );
        while started.elapsed() < TCP_READY_TIMEOUT {
            if !alive.load(Ordering::SeqCst) {
                append_backend_log(&log_path, "ready-poller: stopped (process not alive)");
                return;
            }
            if probe_http_health(port) {
                ready.store(true, Ordering::SeqCst);
                append_backend_log(
                    &log_path,
                    &format!("ready-poller: GET /health ok on 127.0.0.1:{port}"),
                );
                let _ = app.emit(
                    "pos-backend-ready",
                    json!({ "port": port, "listenHost": "127.0.0.1" }),
                );
                return;
            }
            std::thread::sleep(TCP_POLL_INTERVAL);
        }
        if alive.load(Ordering::SeqCst) && !ready.load(Ordering::SeqCst) {
            let tcp_only = probe_loopback_port(port);
            let msg = format!(
                "ready-poller: TIMEOUT after {}s — Node still running but /health never returned success (tcpOpen={tcp_only}). See backend.log.",
                TCP_READY_TIMEOUT.as_secs()
            );
            append_backend_log(&log_path, &msg);
            log::error!("{msg}");
            let _ = app.emit(
                "pos-backend-startup-timeout",
                json!({
                    "port": port,
                    "timeoutSec": TCP_READY_TIMEOUT.as_secs(),
                    "logPath": log_path.to_string_lossy(),
                }),
            );
        }
    });
}

fn spawn_once(
    app_data: &Path,
    bundled_api_dir: &Path,
    node_exe: &Path,
    runtime_path: &Path,
    env_pos_env_file: &Path,
    path_val: &str,
    log_path: &Path,
) -> Result<Child, String> {
    append_backend_log(
        log_path,
        &format!(
            "spawn: exe={node_exe:?} script={runtime_path:?} cwd={bundled_api_dir:?} POS_ENV_FILE={env_pos_env_file:?} POS_APP_DATA_DIR={app_data:?} POS_BUNDLE_ROOT={bundled_api_dir:?}"
        ),
    );
    append_backend_log(log_path, &format!("PATH={path_val}"));

    Command::new(node_exe)
        .arg(runtime_path)
        .current_dir(bundled_api_dir)
        .env("POS_ENV_FILE", env_pos_env_file)
        .env("POS_APP_DATA_DIR", app_data)
        .env("POS_BUNDLE_ROOT", bundled_api_dir)
        .env("POS_DESKTOP_RUNTIME", "1")
        .env("POS_DESKTOP_LOG_STDERR", "1")
        .env("NODE_ENV", "production")
        .env("PORT", format!("{}", desktop_paths::LOCAL_API_PORT))
        .env("PATH", path_val)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn failed: {e}"))
}

fn attach_child_pipes(
    child: &mut Child,
    log_path: &Path,
    stderr_ring: &Arc<Mutex<Vec<String>>>,
) {
    if let Some(stdout) = child.stdout.take() {
        pipe_stream_to_log("stdout", stdout, log_path.to_path_buf(), Arc::clone(stderr_ring));
    }
    if let Some(stderr) = child.stderr.take() {
        pipe_stream_to_log("stderr", stderr, log_path.to_path_buf(), Arc::clone(stderr_ring));
    }
}

fn try_spawn_child(
    params: &BackendSpawnParams,
    log_path: &Path,
) -> Result<Child, String> {
    spawn_once(
        &params.app_data,
        &params.bundled_api_dir,
        &params.node_exe,
        &params.runtime_path,
        &params.env_pos_env_file,
        &params.path_val,
        log_path,
    )
}

fn pipe_stream_to_log(
    label: &'static str,
    stream: impl Read + Send + 'static,
    log_path: PathBuf,
    stderr_ring: Arc<Mutex<Vec<String>>>,
) {
    std::thread::spawn(move || {
        use std::io::BufRead;
        let reader = std::io::BufReader::new(stream);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let row = format!("[{label}] {l}");
                    append_backend_log(&log_path, &row);
                    if label == "stderr" {
                        push_stderr_line(&stderr_ring, l);
                        log::error!("[node-stderr] {row}");
                    } else {
                        log::info!("[node-stdout] {row}");
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn monitor_child_with_restart(
    app: AppHandle,
    log_path: PathBuf,
    params: BackendSpawnParams,
    child_holder: Arc<Mutex<Option<Child>>>,
    stderr_ring: Arc<Mutex<Vec<String>>>,
    alive: Arc<AtomicBool>,
    ready: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        let mut restart_failures: u32 = 0;

        loop {
            let pid = child_holder
                .lock()
                .ok()
                .and_then(|g| g.as_ref().map(|c| c.id()));
            append_backend_log(
                &log_path,
                &format!("monitor: watching embedded node pid={pid:?}"),
            );

            let mut exit_code: Option<i32> = None;
            loop {
                std::thread::sleep(Duration::from_millis(400));
                let mut lock = match child_holder.lock() {
                    Ok(l) => l,
                    Err(_) => return,
                };
                let Some(mut ch) = lock.take() else {
                    break;
                };
                match ch.try_wait() {
                    Ok(None) => {
                        *lock = Some(ch);
                    }
                    Ok(Some(status)) => {
                        exit_code = status.code();
                        break;
                    }
                    Err(e) => {
                        append_backend_log(&log_path, &format!("try_wait error: {e}"));
                        *lock = Some(ch);
                    }
                }
            }

            alive.store(false, Ordering::SeqCst);
            ready.store(false, Ordering::SeqCst);
            append_backend_log(
                &log_path,
                &format!(
                    "embedded node exited: code={exit_code:?} (failure_streak={restart_failures})"
                ),
            );
            log::error!("embedded node exited: {exit_code:?}");

            restart_failures += 1;
            if restart_failures > RESTART_MAX {
                let tail = stderr_ring.lock().map(|v| v.join(" | ")).unwrap_or_default();
                let _ = app.emit(
                    "pos-backend-exit",
                    json!({
                        "pid": pid,
                        "exitCode": exit_code,
                        "stderrTail": tail,
                        "logPath": log_path.to_string_lossy(),
                    }),
                );
                return;
            }

            append_backend_log(
                &log_path,
                &format!(
                    "monitor: restarting embedded backend in {RESTART_BACKOFF_SECS}s ({restart_failures}/{RESTART_MAX})"
                ),
            );
            std::thread::sleep(Duration::from_secs(RESTART_BACKOFF_SECS));

            let mut respawned = false;
            for respawn_try in 1..=3u32 {
                match try_spawn_child(&params, &log_path) {
                    Ok(mut child) => {
                        append_backend_log(
                            &log_path,
                            &format!("monitor: respawn ok pid={} try={respawn_try}", child.id()),
                        );
                        attach_child_pipes(&mut child, &log_path, &stderr_ring);
                        if let Ok(mut guard) = child_holder.lock() {
                            *guard = Some(child);
                        }
                        alive.store(true, Ordering::SeqCst);
                        spawn_backend_ready_poller(
                            app.clone(),
                            log_path.clone(),
                            Arc::clone(&alive),
                            Arc::clone(&ready),
                            desktop_paths::LOCAL_API_PORT,
                        );
                        restart_failures = 0;
                        respawned = true;
                        break;
                    }
                    Err(e) => {
                        append_backend_log(
                            &log_path,
                            &format!("monitor: respawn try {respawn_try}/3 failed: {e}"),
                        );
                        push_stderr_line(&stderr_ring, format!("respawn failed: {e}"));
                        std::thread::sleep(Duration::from_secs(2));
                    }
                }
            }

            if !respawned {
                append_backend_log(&log_path, "monitor: all respawn tries failed this round");
            }
        }
    });
}

/// Starts the embedded backend with retries. Registers `EmbeddedBackend` for lifecycle + diagnostics.
pub fn start_embedded_backend_with_retries(
    app: &AppHandle,
    app_data: PathBuf,
    resource_dir: PathBuf,
    bundled_api_dir: PathBuf,
    node_exe: PathBuf,
    runtime_path: PathBuf,
    env_pos_env_file: PathBuf,
) {
    let logs_dir = app_data.join("logs");
    let _ = std::fs::create_dir_all(&logs_dir);
    let log_path = logs_dir.join("backend.log");
    append_backend_log(&log_path, "=== POS embedded backend bootstrap ===");
    append_backend_log(
        &log_path,
        &format!("resource_dir={resource_dir:?} bundled_api_dir={bundled_api_dir:?}"),
    );

    if !runtime_path.exists() {
        let m = format!("CRITICAL: desktop-runtime.js missing at {runtime_path:?}");
        append_backend_log(&log_path, &m);
        log::error!("{m}");
        let stderr_ring = Arc::new(Mutex::new(vec![m.clone()]));
        let _ = app.manage(EmbeddedBackend {
            child: Arc::new(Mutex::new(None)),
            stderr_ring: Arc::clone(&stderr_ring),
            log_path: log_path.clone(),
            alive: Arc::new(AtomicBool::new(false)),
            ready: Arc::new(AtomicBool::new(false)),
        });
        let tail = stderr_ring.lock().map(|v| v.join("\n")).unwrap_or_default();
        let _ = app.emit(
            "pos-backend-exit",
            json!({
                "pid": null,
                "exitCode": null,
                "stderrTail": tail,
                "logPath": log_path.to_string_lossy(),
                "spawnFailed": true,
                "lastSpawnError": m,
            }),
        );
        return;
    }

    let path_val = desktop_paths::enriched_process_path(&resource_dir, &bundled_api_dir);
    let spawn_params = BackendSpawnParams {
        app_data: app_data.clone(),
        bundled_api_dir: bundled_api_dir.clone(),
        node_exe: node_exe.clone(),
        runtime_path: runtime_path.clone(),
        env_pos_env_file: env_pos_env_file.clone(),
        path_val: path_val.clone(),
    };
    let stderr_ring = Arc::new(Mutex::new(Vec::new()));
    let child_holder = Arc::new(Mutex::new(None));
    let alive_flag = Arc::new(AtomicBool::new(false));
    let ready_flag = Arc::new(AtomicBool::new(false));

    const MAX_ATTEMPTS: u32 = SPAWN_MAX_ATTEMPTS;
    let mut spawned = false;
    let mut last_spawn_err = String::new();

    for attempt in 1..=MAX_ATTEMPTS {
        append_backend_log(&log_path, &format!("spawn attempt {attempt}/{MAX_ATTEMPTS}"));
        match try_spawn_child(&spawn_params, &log_path) {
            Ok(mut child) => {
                append_backend_log(&log_path, &format!("spawn ok pid={}", child.id()));
                attach_child_pipes(&mut child, &log_path, &stderr_ring);
                if let Ok(mut guard) = child_holder.lock() {
                    *guard = Some(child);
                } else {
                    append_backend_log(&log_path, "CRITICAL: child_holder mutex poisoned after spawn");
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = app.emit(
                        "pos-backend-exit",
                        json!({
                            "pid": null,
                            "exitCode": null,
                            "stderrTail": "mutex poisoned",
                            "logPath": log_path.to_string_lossy(),
                            "spawnFailed": true,
                            "lastSpawnError": "internal mutex error",
                        }),
                    );
                    return;
                }
                alive_flag.store(true, Ordering::SeqCst);
                spawned = true;
                spawn_backend_ready_poller(
                    app.clone(),
                    log_path.clone(),
                    Arc::clone(&alive_flag),
                    Arc::clone(&ready_flag),
                    desktop_paths::LOCAL_API_PORT,
                );
                break;
            }
            Err(e) => {
                last_spawn_err = e.clone();
                append_backend_log(&log_path, &format!("spawn error: {e}"));
                log::error!("embedded backend spawn attempt {attempt} failed: {e}");
                if attempt < MAX_ATTEMPTS {
                    std::thread::sleep(Duration::from_secs(SPAWN_BACKOFF_SECS));
                } else {
                    push_stderr_line(
                        &stderr_ring,
                        format!("All {MAX_ATTEMPTS} spawn attempts failed: {e}"),
                    );
                }
            }
        }
    }

    let _ = app.manage(EmbeddedBackend {
        child: Arc::clone(&child_holder),
        stderr_ring: Arc::clone(&stderr_ring),
        log_path: log_path.clone(),
        alive: Arc::clone(&alive_flag),
        ready: Arc::clone(&ready_flag),
    });

    if spawned {
        monitor_child_with_restart(
            app.clone(),
            log_path,
            spawn_params,
            Arc::clone(&child_holder),
            Arc::clone(&stderr_ring),
            Arc::clone(&alive_flag),
            Arc::clone(&ready_flag),
        );
    } else {
        let tail = stderr_ring.lock().map(|v| v.join("\n")).unwrap_or_default();
        let _ = app.emit(
            "pos-backend-exit",
            json!({
                "pid": null,
                "exitCode": null,
                "stderrTail": tail,
                "logPath": log_path.to_string_lossy(),
                "spawnFailed": true,
                "lastSpawnError": last_spawn_err,
            }),
        );
    }
}
