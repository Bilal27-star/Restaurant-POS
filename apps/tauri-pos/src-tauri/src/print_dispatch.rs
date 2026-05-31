//! Local ESC/POS dispatch: TCP (port 9100), Windows spooler RAW, spool file, or device path (COM/USB).
#[cfg(windows)]
use crate::win_spool;

use std::fs::OpenOptions;
use std::io::Write;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Deserialize)]
struct PrintMeta {
    /// Full `connection_json` from `RestaurantPrinter` or normalized `{ "transport": "tcp", ... }`.
    connection: Option<Value>,
}

fn transport(conn: &Value) -> Option<&str> {
    conn.get("transport").and_then(|v| v.as_str())
}

fn tcp_target(conn: &Value) -> Option<(String, u16)> {
    let host = conn.get("host").and_then(|v| v.as_str())?;
    let port = conn.get("port").and_then(|v| v.as_u64()).or_else(|| conn.get("port").and_then(|v| v.as_i64().map(|i| i as u64)))?;
    if port == 0 || port > u16::MAX as u64 {
        return None;
    }
    Some((host.to_string(), port as u16))
}

fn file_relative_path(conn: &Value) -> Option<String> {
    conn.get("path").and_then(|v| v.as_str()).map(str::to_string)
}

fn device_path(conn: &Value) -> Option<String> {
    conn.get("devicePath").and_then(|v| v.as_str()).map(str::to_string)
}

fn winspool_printer_name(conn: &Value) -> Option<String> {
    conn.get("printerName").and_then(|v| v.as_str()).map(str::to_string)
}

fn spool_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?
        .join("printer-spool");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create spool dir: {e}"))?;
    Ok(dir)
}

fn ensure_under_spool(spool: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() || rel.contains("..") || Path::new(rel).is_absolute() {
        return Err("invalid spool path (use a simple file name under app printer-spool)".into());
    }
    let out = spool.join(rel);
    let canon_spool = spool.canonicalize().unwrap_or_else(|_| spool.to_path_buf());
    let parent = out.parent().ok_or_else(|| "invalid path".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    let canon_out = out.canonicalize().unwrap_or(out.clone());
    if !canon_out.starts_with(&canon_spool) {
        return Err("path escaped spool directory".into());
    }
    Ok(out)
}

fn print_tcp(host: &str, port: u16, payload: &[u8]) -> Result<(), String> {
    use std::net::ToSocketAddrs;
    let addr_s = format!("{host}:{port}");
    let mut addrs = addr_s
        .to_socket_addrs()
        .map_err(|e| format!("resolve {addr_s}: {e}"))?;
    let sockaddr = addrs
        .next()
        .ok_or_else(|| format!("no addresses for {addr_s}"))?;
    let mut stream = TcpStream::connect_timeout(&sockaddr, Duration::from_secs(8))
        .map_err(|e| format!("tcp connect {addr_s}: {e}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(12)))
        .map_err(|e| format!("tcp set_write_timeout: {e}"))?;
    stream
        .write_all(payload)
        .map_err(|e| format!("tcp write: {e}"))?;
    stream.flush().map_err(|e| format!("tcp flush: {e}"))?;
    Ok(())
}

fn print_file(path: &Path, payload: &[u8]) -> Result<(), String> {
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("open {}: {e}", path.display()))?;
    f.write_all(payload).map_err(|e| format!("write: {e}"))?;
    f.flush().map_err(|e| format!("flush: {e}"))?;
    Ok(())
}

fn print_device(path: &str, payload: &[u8]) -> Result<(), String> {
    let mut f = OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|e| format!("open device {path}: {e}"))?;
    f.write_all(payload).map_err(|e| format!("device write: {e}"))?;
    f.flush().map_err(|e| format!("device flush: {e}"))?;
    Ok(())
}

/// Sends pre-rendered ESC/POS bytes to a local printer. `meta_json` should include `connection` (API shape) or legacy `transport` fields.
pub fn dispatch_escpos(app: &AppHandle, escpos_base64: &str, meta_json: Option<&str>) -> Result<(), String> {
    let bytes = B64
        .decode(escpos_base64.as_bytes())
        .map_err(|e| format!("base64: {e}"))?;
    if bytes.is_empty() {
        return Err("empty print payload".into());
    }

    let meta: PrintMeta = meta_json
        .map(|s| serde_json::from_str(s).unwrap_or(PrintMeta { connection: None }))
        .unwrap_or(PrintMeta { connection: None });

    let conn = meta.connection.as_ref().ok_or_else(|| {
        "missing connection in print meta (expected API printer connectionJson)".to_string()
    })?;

    let t = transport(conn).unwrap_or("");

    match t {
        "tcp" => {
            let (host, port) = tcp_target(conn).ok_or_else(|| "tcp: need host and port".to_string())?;
            print_tcp(&host, port, &bytes)
        }
        "file" => {
            let rel = file_relative_path(conn).ok_or_else(|| "file: need path (relative file name)".to_string())?;
            let spool = spool_dir(app)?;
            let path = ensure_under_spool(&spool, &rel)?;
            print_file(&path, &bytes)
        }
        "usb" => {
            let dev = device_path(conn).ok_or_else(|| "usb: need devicePath".to_string())?;
            print_device(&dev, &bytes)
        }
        "winspool" => {
            let name = winspool_printer_name(conn).ok_or_else(|| "winspool: need printerName".to_string())?;
            #[cfg(windows)]
            {
                win_spool::print_raw_winspool(&name, &bytes)
            }
            #[cfg(not(windows))]
            {
                let _ = name;
                Err("winspool transport requires Windows".into())
            }
        }
        "" => {
            // Try implicit tcp if host+port at top level
            if let Some((host, port)) = tcp_target(conn) {
                return print_tcp(&host, port, &bytes);
            }
            Err("unknown or missing transport in connection (use tcp, usb, winspool, or file)".into())
        }
        other => Err(format!("unsupported transport: {other}")),
    }
}

/// Installed Windows printer queue names; empty on non-Windows targets.
pub fn list_spooler_printers() -> Vec<String> {
    #[cfg(windows)]
    {
        win_spool::list_installed_printers().unwrap_or_else(|e| {
            log::warn!("list_spooler_printers: {e}");
            vec![]
        })
    }
    #[cfg(not(windows))]
    {
        vec![]
    }
}

pub fn list_serial_candidates() -> Vec<String> {
    #[cfg(windows)]
    {
        (1..=32).map(|n| format!(r"\\.\COM{n}")).collect()
    }
    #[cfg(unix)]
    {
        let mut v = vec![];
        for p in ["/dev/usb/lp0", "/dev/usb/lp1", "/dev/usb/lp2"] {
            v.push(p.to_string());
        }
        if let Ok(entries) = std::fs::read_dir("/dev") {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if name.starts_with("ttyUSB") || name.starts_with("ttyACM") {
                    v.push(format!("/dev/{name}"));
                }
            }
        }
        v
    }
    #[cfg(not(any(windows, unix)))]
    {
        vec![]
    }
}
