use serde_json::json;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_autostart::ManagerExt;

use crate::embedded_node::{read_log_tail, EmbeddedBackend};
use crate::print_dispatch;

#[tauri::command]
pub fn print_escpos_base64(
    app: AppHandle,
    escpos_base64: String,
    meta_json: Option<String>,
) -> Result<(), String> {
    print_dispatch::dispatch_escpos(
        &app,
        &escpos_base64,
        meta_json.as_deref(),
    )
}

#[tauri::command]
pub fn list_usb_printer_paths() -> Result<Vec<String>, String> {
    Ok(print_dispatch::list_serial_candidates())
}

/// Stable directories for backups, exports, logs, and offline sync files (create parents as needed).
#[tauri::command]
pub fn pos_desktop_paths(app: AppHandle) -> Result<serde_json::Value, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let logs = app_data.join("logs");
    let backups = app_data.join("backups");
    let exports = app_data.join("exports");
    let sync = app_data.join("sync");
    let spool = app_data.join("printer-spool");
    for d in [&logs, &backups, &exports, &sync, &spool] {
        std::fs::create_dir_all(d).map_err(|e| format!("{}: {e}", d.display()))?;
    }
    Ok(json!({
        "appDataDir": app_data.to_string_lossy(),
        "logsDir": logs.to_string_lossy(),
        "backupsDir": backups.to_string_lossy(),
        "exportsDir": exports.to_string_lossy(),
        "syncDir": sync.to_string_lossy(),
        "printerSpoolDir": spool.to_string_lossy(),
    }))
}

/// Embedded Node + API process status (for login / diagnostics).
#[tauri::command]
pub fn pos_backend_status(app: AppHandle) -> Result<serde_json::Value, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let log_path = app_data.join("logs").join("backend.log");
    let log_tail = read_log_tail(&log_path, 12_000);

    let Some(st) = app.try_state::<EmbeddedBackend>() else {
        return Ok(json!({
            "managed": false,
            "running": false,
            "pid": serde_json::Value::Null,
            "logTail": log_tail,
            "stderrTail": "",
        }));
    };

    Ok(json!({
        "managed": true,
        "running": st.is_running(),
        "pid": st.child_pid(),
        "logTail": log_tail,
        "stderrTail": st.stderr_tail_joined(),
        "logPath": log_path.to_string_lossy(),
    }))
}

#[tauri::command]
pub fn pos_set_launch_on_login(app: AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch
            .enable()
            .map_err(|e: tauri_plugin_autostart::Error| e.to_string())?;
    } else {
        autolaunch
            .disable()
            .map_err(|e: tauri_plugin_autostart::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pos_app_metadata(app: AppHandle) -> Result<serde_json::Value, String> {
    let pkg = app.package_info();
    Ok(json!({
        "name": pkg.name,
        "version": pkg.version.to_string(),
    }))
}
