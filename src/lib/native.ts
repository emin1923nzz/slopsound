import { invoke } from "@tauri-apps/api/core";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";

export type NativeCaptureStatus = {
  os: string;
  graphics_capture: boolean;
  wasapi: boolean;
  note: string;
};

export type OAuthCallback = {
  code?: string;
  state?: string;
  error?: string;
};

export function isTauri() {
  if (typeof window === "undefined") return false;
  const target = window as Window & { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };
  return Boolean(target.__TAURI_INTERNALS__ ?? target.__TAURI__) ||
    (typeof navigator !== "undefined" && navigator.userAgent.includes("Tauri"));
}

export async function openExternal(url: string) {
  if (!isTauri()) {
    if (typeof window === "undefined" || typeof window.open !== "function") {
      throw new Error("Bu bağlantı bu ortamda açılamıyor");
    }
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) throw new Error("Bağlantı açılamadı");
    return;
  }
  await invoke("open_external", { url });
}

export async function openExternalHttp(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Geçersiz bağlantı");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Yalnızca http/https bağlantıları açılabilir");
  }
  await openExternal(parsed.toString());
}

export async function startGoogleOAuthListener() {
  if (!isTauri()) return;
  await invoke("start_oauth_listener");
}

export async function pickSavePath(defaultName: string) {
  if (!isTauri()) return null;
  return invoke<string | null>("pick_save_path", { defaultName });
}

export async function saveRecordingBytes(path: string, data: Uint8Array) {
  if (!isTauri()) throw new Error("Dosya kaydı yalnızca Tauri uygulamasında kullanılabilir");
  await invoke("save_recording_bytes", { path, data: Array.from(data) });
}

export async function ffmpegAvailable() {
  if (!isTauri()) return false;
  return invoke<boolean>("ffmpeg_available");
}

export async function convertToMp4(input: string, output: string) {
  if (!isTauri()) throw new Error("FFmpeg dönüşümü yalnızca Tauri uygulamasında kullanılabilir");
  return invoke<string>("convert_to_mp4", { input, output });
}

export async function notify(title: string, body: string) {
  if (!isTauri()) return;
  await sendNotification({ title, body });
}

export async function setAutostart(enabled: boolean) {
  if (!isTauri()) return;
  if (enabled) await enableAutostart();
  else await disableAutostart();
}

export async function getAutostart() {
  if (!isTauri()) return false;
  return isAutostartEnabled();
}

export async function copyText(text: string) {
  if (!isTauri()) {
    await navigator.clipboard.writeText(text);
    return;
  }
  await writeText(text);
}

export async function pasteText() {
  if (!isTauri()) return navigator.clipboard.readText();
  return readText();
}

export async function nativeCaptureStatus() {
  if (!isTauri()) {
    return {
      os: "web",
      graphics_capture: false,
      wasapi: false,
      note: "Native Windows yakalama yalnızca Tauri derlemesinde kullanılabilir.",
    } satisfies NativeCaptureStatus;
  }
  return invoke<NativeCaptureStatus>("native_capture_status");
}
