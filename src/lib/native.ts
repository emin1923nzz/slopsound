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
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openExternal(url: string) {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await invoke("open_external", { url });
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
