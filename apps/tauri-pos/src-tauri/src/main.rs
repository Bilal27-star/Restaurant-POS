#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod embedded_node;
mod print_dispatch;

use embedded_node::EmbeddedBackend;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind, TimezoneStrategy};

fn main() {
    #[cfg(debug_assertions)]
    {
        std::env::set_var("RUST_LOG", std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()));
    }

    let mut builder = tauri::Builder::default();

    builder = builder.plugin(
        tauri_plugin_log::Builder::new()
            .timezone_strategy(TimezoneStrategy::UseLocal)
            .targets([
                Target::new(TargetKind::Stdout),
                Target::new(TargetKind::LogDir {
                    file_name: Some("pos".into()),
                }),
            ])
            .build(),
    );

    builder = builder.plugin(tauri_plugin_shell::init());
    builder = builder.plugin(tauri_plugin_dialog::init());

    builder = builder.plugin(
        tauri_plugin_autostart::Builder::new()
            .arg("--from-autostart")
            .build(),
    );

    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }));

    builder = builder
        .invoke_handler(tauri::generate_handler![
            commands::print_escpos_base64,
            commands::list_usb_printer_paths,
            commands::pos_desktop_paths,
            commands::pos_backend_status,
            commands::pos_set_launch_on_login,
            commands::pos_app_metadata,
        ])
        .setup(|app| {
            if std::env::var("POS_KIOSK").unwrap_or_default() == "1" {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_fullscreen(true);
                }
            }

            if let (Ok(app_data), Ok(resource_dir)) = (app.path().app_data_dir(), app.path().resource_dir()) {
                log::info!("Tauri paths: app_data={:?}, resource_dir={:?}", app_data, resource_dir);

                let bundled_api_dir = if resource_dir.join("resources/bundled-api").exists() {
                    resource_dir.join("resources/bundled-api")
                } else {
                    resource_dir.join("bundled-api")
                };

                let node_bin = if resource_dir.join("resources/node-runtime/bin/node").exists() {
                    resource_dir.join("resources/node-runtime/bin/node")
                } else {
                    resource_dir.join("node-runtime/bin/node")
                };

                let runtime_path = bundled_api_dir.join("dist/desktop-runtime.js");

                log::info!(
                    "Resolved paths: bundled_api_dir={:?}, node_bin={:?}, runtime_path={:?}",
                    bundled_api_dir,
                    node_bin,
                    runtime_path
                );

                let node_exe = if node_bin.exists() {
                    #[cfg(target_os = "macos")]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        if let Ok(metadata) = std::fs::metadata(&node_bin) {
                            let mut perms = metadata.permissions();
                            if perms.mode() & 0o111 == 0 {
                                log::info!("Making node binary executable: {:?}", node_bin);
                                perms.set_mode(perms.mode() | 0o111);
                                if let Err(e) = std::fs::set_permissions(&node_bin, perms) {
                                    log::error!("Failed to set permissions for node binary: {}", e);
                                }
                            }
                        }
                    }
                    node_bin.clone()
                } else {
                    log::warn!(
                        "Bundled node binary not found at {:?}, falling back to system 'node'",
                        node_bin
                    );
                    std::path::PathBuf::from("node")
                };

                if !runtime_path.exists() {
                    log::error!("Backend runtime script not found at {:?}", runtime_path);
                }

                let env_pos_env_file = bundled_api_dir.join(".env");

                embedded_node::start_embedded_backend_with_retries(
                    &app.handle(),
                    app_data.clone(),
                    resource_dir.clone(),
                    bundled_api_dir.clone(),
                    node_exe,
                    runtime_path,
                    env_pos_env_file,
                );
            } else {
                log::error!("Failed to resolve app_data or resource_dir paths");
            }

            log::info!("POS desktop shell started");
            Ok(())
        });

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<EmbeddedBackend>() {
                state.kill_child();
            }
        }
    });
}
