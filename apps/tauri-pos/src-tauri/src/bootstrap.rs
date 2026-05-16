//! Production desktop: locate packaged resources, spawn embedded Node + API, register managed state.
//! In `tauri dev`, `resolve_bundled_api_dir` also checks `src-tauri/resources/bundled-api` (see `build.rs` env).

use std::path::Path;
use tauri::AppHandle;
use tauri::Manager;

use crate::desktop_log::append_backend_log;
use crate::desktop_paths;
use crate::embedded_node;

fn log_resource_dir_sample(resource_dir: &Path, log_path: &Path) {
    append_backend_log(
        log_path,
        &format!("diagnostics: listing resource_dir (first 40): {resource_dir:?}"),
    );
    if let Ok(rd) = std::fs::read_dir(resource_dir) {
        for e in rd.flatten().take(40) {
            append_backend_log(log_path, &format!("  entry: {:?}", e.path()));
        }
    }
}

/// Starts the embedded backend when `dist/desktop-runtime.js` exists in a known packaged location.
pub fn start_embedded_pos_if_packaged(app: &AppHandle) {
    let Ok(app_data) = app.path().app_data_dir() else {
        log::error!("pos-desktop: app_data_dir() unavailable");
        return;
    };
    let Ok(resource_dir) = app.path().resource_dir() else {
        log::error!("pos-desktop: resource_dir() unavailable");
        return;
    };

    log::info!(
        "pos-desktop: app_data={:?} resource_dir={:?}",
        app_data,
        resource_dir
    );

    let logs_dir = app_data.join("logs");
    if let Err(e) = std::fs::create_dir_all(&logs_dir) {
        log::error!("pos-desktop: failed to create logs dir {:?}: {e}", logs_dir);
    }
    let probe_log = logs_dir.join("backend.log");

    let Some(bundled_api_dir) = desktop_paths::resolve_bundled_api_dir(&resource_dir) else {
        log::error!(
            "pos-desktop: no packaged bundled-api (expected dist/desktop-runtime.js under resource_dir). Dev server? Start API separately."
        );
        append_backend_log(
            &probe_log,
            "bootstrap: bundled-api not found — skipping embedded Node (typical in tauri dev without resources copy)",
        );
        log_resource_dir_sample(&resource_dir, &probe_log);
        return;
    };

    let node_exe = match desktop_paths::resolve_bundled_node_exe(&resource_dir) {
        Some(node_path) => {
            #[cfg(target_os = "macos")]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(metadata) = std::fs::metadata(&node_path) {
                    let mut perms = metadata.permissions();
                    if perms.mode() & 0o111 == 0 {
                        log::info!("pos-desktop: chmod +x {:?}", node_path);
                        perms.set_mode(perms.mode() | 0o111);
                        if let Err(e) = std::fs::set_permissions(&node_path, perms) {
                            log::error!("pos-desktop: chmod node failed: {e}");
                        }
                    }
                }
            }
            node_path
        }
        None => {
            log::warn!(
                "pos-desktop: embedded Node not under resource_dir; falling back to `node` on PATH ({:?})",
                resource_dir
            );
            std::path::PathBuf::from("node")
        }
    };

    let runtime_path = bundled_api_dir.join("dist").join("desktop-runtime.js");
    let env_file = bundled_api_dir.join(".env");

    log::info!(
        "pos-desktop: bundled_api_dir={:?} node_exe={:?} runtime={:?}",
        bundled_api_dir,
        node_exe,
        runtime_path
    );

    embedded_node::start_embedded_backend_with_retries(
        app,
        app_data,
        resource_dir.clone(),
        bundled_api_dir,
        node_exe,
        runtime_path,
        env_file,
    );
}
