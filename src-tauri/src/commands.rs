use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

use tauri::Emitter;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[tauri::command]
pub fn app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn platform_name() -> &'static str {
    std::env::consts::OS
}

#[tauri::command]
pub async fn open_external(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hex = String::from_utf8_lossy(&bytes[index + 1..index + 3]);
                if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                    output.push(byte);
                    index += 3;
                } else {
                    output.push(bytes[index]);
                    index += 1;
                }
            }
            b'+' => {
                output.push(b' ');
                index += 1;
            }
            byte => {
                output.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&output).into_owned()
}

#[derive(Clone, serde::Serialize)]
pub struct OAuthCallback {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn start_oauth_listener(app: tauri::AppHandle) -> Result<(), String> {
    let listener = match TcpListener::bind("127.0.0.1:43127") {
        Ok(listener) => listener,
        Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    thread::spawn(move || {
        let Ok((mut stream, _)) = listener.accept() else { return };
        let mut buffer = [0u8; 4096];
        let read = stream.read(&mut buffer).unwrap_or(0);
        let request = String::from_utf8_lossy(&buffer[..read]);
        let target = request.lines().next().and_then(|line| line.split_whitespace().nth(1)).unwrap_or("");
        let query = target.split('?').nth(1).unwrap_or("");
        let params: HashMap<String, String> = query
            .split('&')
            .filter(|part| !part.is_empty())
            .filter_map(|part| {
                let mut pair = part.splitn(2, '=');
                Some((percent_decode(pair.next().unwrap_or("")), percent_decode(pair.next().unwrap_or(""))))
            })
            .collect();
        let payload = OAuthCallback {
            code: params.get("code").cloned(),
            state: params.get("state").cloned(),
            error: params.get("error").cloned(),
        };
        let body = "<!doctype html><html lang=\"tr\"><meta charset=\"utf-8\"><title>SlopSound</title><body style=\"margin:0;display:grid;place-items:center;min-height:100vh;background:#100E16;color:#F4F1EA;font-family:Segoe UI,sans-serif;text-align:center\"><div><div style=\"width:56px;height:56px;margin:0 auto 18px;border-radius:18px;background:#8B6CFF;color:#100E16;display:grid;place-items:center;font-size:26px;font-weight:900\">S</div><h1 style=\"font-size:20px;margin:0\">Google girişi tamamlandı</h1><p style=\"color:#9b95ad;font-size:13px;margin-top:8px\">SlopSound'a dönebilirsin.</p></div></body></html>";
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(response.as_bytes());
        let _ = app.emit("oauth://google", payload);
    });
    Ok(())
}

#[tauri::command]
pub fn pick_save_path(app: tauri::AppHandle, default_name: String) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .set_title("Kaydı nereye saklayalım?")
        .set_file_name(default_name)
        .add_filter("Video", &["webm", "mp4"])
        .blocking_save_file()?;
    path.into_path().ok().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_recording_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, data).map_err(|e| format!("Kayıt yazılamadı: {e}"))
}

#[tauri::command]
pub fn ffmpeg_available() -> bool {
    std::process::Command::new("ffmpeg")
        .arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn convert_to_mp4(input: String, output: String) -> Result<String, String> {
    let status = std::process::Command::new("ffmpeg")
        .args(["-y", "-i", &input, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", &output])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("FFmpeg başlatılamadı: {e}"))?;
    if status.status.success() {
        Ok(output)
    } else {
        Err(format!("FFmpeg dönüştüremdi: {}", String::from_utf8_lossy(&status.stderr).chars().take(300).collect::<String>()))
    }
}

#[tauri::command]
pub fn update_shortcuts(app: tauri::AppHandle, shortcuts: HashMap<String, String>) -> Result<(), String> {
    let manager = app.global_shortcut();
    manager.unregister_all().map_err(|e| e.to_string())?;
    for (action, accelerator) in shortcuts {
        let event = format!("shortcut://{action}");
        let shortcut = accelerator.parse::<Shortcut>().map_err(|e| e.to_string())?;
        manager
            .on_shortcut(shortcut, move |app, _shortcut, shortcut_event| {
                if shortcut_event.state == ShortcutState::Pressed {
                    let _ = app.emit(&event, ());
                }
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct NativeCaptureStatus {
    pub os: &'static str,
    pub graphics_capture: bool,
    pub wasapi: bool,
    pub note: String,
}

#[tauri::command]
pub fn native_capture_status() -> NativeCaptureStatus {
    let windows = cfg!(target_os = "windows");
    NativeCaptureStatus {
        os: std::env::consts::OS,
        graphics_capture: windows,
        wasapi: windows,
        note: if windows {
            "Windows Graphics Capture ve WASAPI kullanılabilir; WebView2 getDisplayMedia sistem sesini her zaman vermez. Native yakalama ayrıca doğrulanmalı.".into()
        } else {
            "Native Windows yakalama yalnızca Windows derlemesinde kullanılabilir.".into()
        },
    }
}
