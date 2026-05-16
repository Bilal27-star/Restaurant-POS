//! Append-only file log under the app data directory (`logs/backend.log`), shared by the Rust shell
//! and the embedded Node `desktop-runtime` (which uses ISO timestamps in its own lines).

use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

fn now_stamp() -> String {
    use std::time::SystemTime;
    let Ok(d) = SystemTime::now().duration_since(std::time::UNIX_EPOCH) else {
        return "0".to_string();
    };
    format!("{}.{:03}", d.as_secs(), d.subsec_millis())
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
    s.chars()
        .rev()
        .take(max_chars)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect()
}
