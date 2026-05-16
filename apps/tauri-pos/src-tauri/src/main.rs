#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bootstrap;
mod commands;
mod desktop_log;
mod desktop_paths;
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
                    file_name: Some("pos-shell".into()),
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

            bootstrap::start_embedded_pos_if_packaged(&app.handle());

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
