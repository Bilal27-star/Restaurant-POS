//! Canonical paths for the packaged desktop POS shell.
//!
//! **Keep in sync** with `tauri.conf.json` → `bundle.resources` (directories under `src-tauri/resources/`
//! are copied next to the app binary / inside the `.app` bundle). The web client expects the local API at
//! `http://127.0.0.1:{LOCAL_API_PORT}` — see `apps/web/src/lib/app-api.ts`.
//!
//! **App data layout** (see `pos_desktop_paths` command): `logs/`, `postgres/`, `sync/`, `runtime/cache/`,
//! `offline/outbox/`, etc., under the OS app data directory.

use std::path::{Path, PathBuf};

/// Local HTTP API (embedded Express). Must match Vite/Tauri webview `resolvedApiOrigin()`.
pub const LOCAL_API_PORT: u16 = 4000;

#[cfg(debug_assertions)]
fn dev_resource_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(dir) = option_env!("POS_DEV_BUNDLED_API_DIR") {
        out.push(PathBuf::from(dir));
    }
    out
}

#[cfg(not(debug_assertions))]
fn dev_resource_candidates() -> Vec<PathBuf> {
    Vec::new()
}

/// Candidate roots for the self-contained Node bundle (`npm install --omit=dev` output + `dist/`).
pub fn bundled_api_roots(resource_dir: &Path) -> Vec<PathBuf> {
    let mut roots = vec![
        resource_dir.join("resources").join("bundled-api"),
        resource_dir.join("bundled-api"),
    ];
    roots.extend(dev_resource_candidates());
    roots
}

/// Resolves the packaged API tree; requires `dist/desktop-runtime.js` (not only an empty folder).
pub fn resolve_bundled_api_dir(resource_dir: &Path) -> Option<PathBuf> {
    for p in bundled_api_roots(resource_dir) {
        if p.join("dist").join("desktop-runtime.js").is_file() {
            return Some(p);
        }
    }
    None
}

/// Official Node runtime shipped under `resources/node-runtime/` (see `package-bundled-backend.mjs`).
pub fn node_runtime_bin_dirs(resource_dir: &Path) -> Vec<PathBuf> {
    let mut dirs = vec![
        resource_dir.join("resources").join("node-runtime").join("bin"),
        resource_dir.join("node-runtime").join("bin"),
    ];
    #[cfg(debug_assertions)]
    if let Some(bin) = option_env!("POS_DEV_NODE_RUNTIME_BIN") {
        dirs.push(PathBuf::from(bin));
    }
    dirs
}

/// Prefer `node.exe` on Windows; otherwise the `node` binary next to the shipped runtime.
pub fn resolve_bundled_node_exe(resource_dir: &Path) -> Option<PathBuf> {
    for base in node_runtime_bin_dirs(resource_dir) {
        #[cfg(target_os = "windows")]
        {
            let win = base.join("node.exe");
            if win.is_file() {
                return Some(win);
            }
        }
        let nix = base.join("node");
        if nix.is_file() {
            return Some(nix);
        }
    }
    None
}

/// Prepends bundled `node-runtime/bin` and `bundled-api/node_modules/.bin` to `PATH` for child processes.
pub fn enriched_process_path(resource_dir: &Path, bundled_api_dir: &Path) -> String {
    let mut prefixes: Vec<PathBuf> = Vec::new();
    for base in node_runtime_bin_dirs(resource_dir) {
        if base.exists() {
            prefixes.push(base);
        }
    }
    let nm_bin = bundled_api_dir.join("node_modules").join(".bin");
    if nm_bin.exists() {
        prefixes.push(nm_bin);
    }
    let base = std::env::var("PATH").unwrap_or_default();
    #[cfg(windows)]
    const PATH_SEP: &str = ";";
    #[cfg(not(windows))]
    const PATH_SEP: &str = ":";
    let extra = prefixes
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(PATH_SEP);
    if extra.is_empty() {
        base
    } else if base.is_empty() {
        extra
    } else {
        format!("{extra}{PATH_SEP}{base}")
    }
}
