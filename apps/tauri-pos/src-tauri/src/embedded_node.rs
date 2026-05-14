//! Spawns the bundled Node + `desktop-runtime.js` (API + embedded Postgres) for production desktop builds.
//! Writes consolidated diagnostics to `app_data/logs/backend.log` and keeps a short stderr ring for IPC.

use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::json;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;

const STDERR_RING_MAX: usize = 120;

fn now_stamp() -> String {
    use std::time::SystemTime;
    let Ok(d) = SystemTime::now().duration_since(std::time::UNIX_EPOCH) else {
        return "0".to_string();
    };
    format!("{}", d.as_secs())
}

pub fn append_backend_log(log_path: &Path, line: &str) {
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let Ok(mut f) = OpenOptions::new().create(true).append(true).open(log_path) else {
        return;
    };
    let _ = writeln!(f, "[{}] {}", now_stamp(), line);
}

pub fn read_log_tail(path: &Path, max_chars: usize) -> String {
    let Ok(bytes) = std::fs::read(path) else {
        return String::new();
    };
    let s = String::from_utf8_lossy(&bytes);
    if s.len() <= max_chars {
        return s.into_owned();
    }
    s.chars().rev().take(max_chars).collect::<Vec<_>>().into_iter().rev().collect()
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

fn build_enriched_path(resource_dir: &Path, bundled_api_dir: &Path) -> String {
    let mut prefixes: Vec<PathBuf> = Vec::new();
    for p in [
        resource_dir.join("resources/node-runtime/bin"),
        resource_dir.join("node-runtime/bin"),
    ] {
        if p.exists() {
            prefixes.push(p);
        }
    }
    let nm_bin = bundled_api_dir.join("node_modules/.bin");
    if nm_bin.exists() {
        prefixes.push(nm_bin);
    }
    let base = std::env::var("PATH").unwrap_or_default();
    let extra = prefixes
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(&std::path::MAIN_SEPARATOR.to_string());
    if extra.is_empty() {
        base
    } else {
        format!("{extra}{}{base}", std::path::MAIN_SEPARATOR)
    }
}

pub struct EmbeddedBackend {
    pub child: Arc<Mutex<Option<Child>>>,
    pub stderr_ring: Arc<Mutex<Vec<String>>>,
    #[allow(dead_code)]
    pub log_path: PathBuf,
    /// Set `true` after a successful spawn; monitor sets `false` when the process exits.
    pub alive: Arc<AtomicBool>,
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

    pub fn child_pid(&self) -> Option<u32> {
        let Ok(g) = self.child.lock() else {
            return None;
        };
        g.as_ref().map(|c| c.id())
    }

    pub fn kill_child(&self) {
        self.alive.store(false, Ordering::SeqCst);
        if let Ok(mut g) = self.child.lock() {
            if let Some(mut c) = g.take() {
                let _ = c.kill();
                let _ = c.wait();
            }
        }
    }
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
        .env("NODE_ENV", "production")
        .env("PORT", "4000")
        .env("PATH", path_val)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn failed: {e}"))
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

fn monitor_child(
    app: AppHandle,
    log_path: PathBuf,
    child_holder: Arc<Mutex<Option<Child>>>,
    stderr_ring: Arc<Mutex<Vec<String>>>,
    alive: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        let pid = child_holder
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|c| c.id()));
        append_backend_log(
            &log_path,
            &format!("monitor: watching embedded node pid={pid:?}"),
        );
        loop {
            std::thread::sleep(Duration::from_millis(400));
            let mut lock = match child_holder.lock() {
                Ok(l) => l,
                Err(_) => break,
            };
            let Some(mut ch) = lock.take() else {
                break;
            };
            match ch.try_wait() {
                Ok(None) => {
                    *lock = Some(ch);
                }
                Ok(Some(status)) => {
                    let code = status.code();
                    alive.store(false, Ordering::SeqCst);
                    append_backend_log(
                        &log_path,
                        &format!("embedded node exited: code={code:?}"),
                    );
                    log::error!("embedded node exited: {code:?}");
                    let tail = stderr_ring.lock().map(|v| v.join(" | ")).unwrap_or_default();
                    let _ = app.emit(
                        "pos-backend-exit",
                        json!({
                            "pid": pid,
                            "exitCode": code,
                            "stderrTail": tail,
                            "logPath": log_path.to_string_lossy(),
                        }),
                    );
                    break;
                }
                Err(e) => {
                    append_backend_log(&log_path, &format!("try_wait error: {e}"));
                    *lock = Some(ch);
                }
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

    let path_val = build_enriched_path(&resource_dir, &bundled_api_dir);
    let stderr_ring = Arc::new(Mutex::new(Vec::new()));
    let child_holder = Arc::new(Mutex::new(None));
    let alive_flag = Arc::new(AtomicBool::new(false));

    const MAX_ATTEMPTS: u32 = 3;
    let mut spawned = false;
    let mut last_spawn_err = String::new();

    for attempt in 1..=MAX_ATTEMPTS {
        append_backend_log(&log_path, &format!("spawn attempt {attempt}/{MAX_ATTEMPTS}"));
        match spawn_once(
            &app_data,
            &bundled_api_dir,
            &node_exe,
            &runtime_path,
            &env_pos_env_file,
            &path_val,
            &log_path,
        ) {
            Ok(mut child) => {
                append_backend_log(&log_path, &format!("spawn ok pid={}", child.id()));
                if let Some(stdout) = child.stdout.take() {
                    pipe_stream_to_log(
                        "stdout",
                        stdout,
                        log_path.clone(),
                        Arc::clone(&stderr_ring),
                    );
                }
                if let Some(stderr) = child.stderr.take() {
                    pipe_stream_to_log(
                        "stderr",
                        stderr,
                        log_path.clone(),
                        Arc::clone(&stderr_ring),
                    );
                }
                *child_holder.lock().expect("child mutex") = Some(child);
                alive_flag.store(true, Ordering::SeqCst);
                spawned = true;
                break;
            }
            Err(e) => {
                last_spawn_err = e.clone();
                append_backend_log(&log_path, &format!("spawn error: {e}"));
                log::error!("embedded backend spawn attempt {attempt} failed: {e}");
                if attempt < MAX_ATTEMPTS {
                    std::thread::sleep(Duration::from_secs(2));
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
    });

    if spawned {
        monitor_child(
            app.clone(),
            log_path,
            Arc::clone(&child_holder),
            Arc::clone(&stderr_ring),
            Arc::clone(&alive_flag),
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
