mod commands;

use std::collections::HashMap;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::NewWindowResponse,
    window::Color,
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};

fn is_app_origin(url: &tauri::Url) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "http" => match url.host_str() {
            Some("tauri.localhost") => true,
            Some("localhost") => url.port_or_known_default() == Some(1420),
            _ => false,
        },
        _ => false,
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let _main_window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("SlopSound")
                .inner_size(1280.0, 820.0)
                .min_inner_size(900.0, 600.0)
                .resizable(true)
                .center()
                .decorations(false)
                .transparent(true)
                .background_color(Color(0x10, 0x0E, 0x16, 255))
                .on_navigation(|url| {
                    if is_app_origin(url) {
                        return true;
                    }
                    if url.scheme() == "http" || url.scheme() == "https" {
                        let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .on_new_window(|url, _features| {
                    match url.scheme() {
                        "http" | "https" | "mailto" | "tel" => {
                            let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
                        }
                        _ => {}
                    }
                    NewWindowResponse::Deny
                })
                .build()?;

            let show = MenuItem::new(app, "SlopSound'u Göster", true, None::<&str>)?;
            let quit = MenuItem::new(app, "Çık", true, None::<&str>)?;
            let menu = Menu::new(app)?;
            menu.append(&show)?;
            menu.append(&quit)?;
            let icon = app.default_window_icon().cloned();
            let mut tray = TrayIconBuilder::new().menu(&menu).show_menu_on_left_click(false);
            if let Some(icon) = icon {
                tray = tray.icon(icon);
            }
            let tray = tray.build(app)?;
            tray.on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            });
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "SlopSound'u Göster" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "Çık" => app.exit(0),
                _ => {}
            });

            let shortcuts = HashMap::from([
                ("mic".to_string(), "Control+Shift+M".to_string()),
                ("deafen".to_string(), "Control+Shift+D".to_string()),
                ("screen".to_string(), "Control+Shift+S".to_string()),
                ("ptt".to_string(), "Control+Shift+P".to_string()),
            ]);
            commands::update_shortcuts(app.handle().clone(), shortcuts)?;
            let _ = app.emit("shortcut://ready", ());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::platform_name,
            commands::open_external,
            commands::start_oauth_listener,
            commands::pick_save_path,
            commands::save_recording_bytes,
            commands::ffmpeg_available,
            commands::convert_to_mp4,
            commands::native_capture_status,
            commands::update_shortcuts,
        ])
        .run(tauri::generate_context!())
        .expect("SlopSound başlatılamadı");
}
