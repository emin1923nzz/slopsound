import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type VideoCodec = "vp8" | "vp9" | "h264";
export type ResolutionId = "360p" | "480p" | "720p" | "1080p";
export type QualityId = "low" | "medium" | "high";
export type ScreenSource = "monitor" | "window";

export const resolutions: { id: ResolutionId; label: string; width: number; height: number; bitrate: number }[] = [
  { id: "360p", label: "360p • hafif", width: 640, height: 360, bitrate: 600_000 },
  { id: "480p", label: "480p • dengeli", width: 854, height: 480, bitrate: 1_200_000 },
  { id: "720p", label: "720p • net", width: 1280, height: 720, bitrate: 2_500_000 },
  { id: "1080p", label: "1080p • sinema", width: 1920, height: 1080, bitrate: 4_500_000 },
];

export const fpsOptions = [15, 24, 30, 60] as const;
export const qualityOptions: { id: QualityId; label: string; multiplier: number }[] = [
  { id: "low", label: "Düşük • tasarruf", multiplier: 0.55 },
  { id: "medium", label: "Orta • önerilen", multiplier: 1 },
  { id: "high", label: "Yüksek • net", multiplier: 1.6 },
];
export const codecOptions: { id: VideoCodec; label: string; note: string }[] = [
  { id: "vp8", label: "VP8", note: "En uyumlu" },
  { id: "vp9", label: "VP9", note: "Verimli" },
  { id: "h264", label: "H.264", note: "Donanım hızlandırmalı" },
];

type Local = {
  rawStream: MediaStream | null;
  stream: MediaStream | null;
  screenStream: MediaStream | null;
  cleanupProcessor: (() => void) | null;
};

const local: Local = { rawStream: null, stream: null, screenStream: null, cleanupProcessor: null };

type VideoState = {
  devices: MediaDeviceInfo[];
  deviceId: string;
  resolution: ResolutionId;
  fps: number;
  quality: QualityId;
  codec: VideoCodec;
  styleFilter: boolean;
  screenSource: ScreenSource;
  shareSystemAudio: boolean;
  webCodecsSupported: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  screenHasSystemAudio: boolean;
  stream: MediaStream | null;
  error: string | null;
  refreshDevices: () => Promise<void>;
  setDevice: (id: string) => void;
  setResolution: (id: ResolutionId) => void;
  setFps: (fps: number) => void;
  setQuality: (id: QualityId) => void;
  setCodec: (id: VideoCodec) => void;
  setStyleFilter: (value: boolean) => void;
  setScreenSource: (source: ScreenSource) => void;
  setShareSystemAudio: (value: boolean) => void;
  startCamera: () => Promise<boolean>;
  stopCamera: () => void;
  attachCamera: (el: HTMLVideoElement | null) => void;
  startScreenShare: () => Promise<boolean>;
  stopScreenShare: () => void;
  attachScreen: (el: HTMLVideoElement | null) => void;
  getScreenStream: () => MediaStream | null;
  getStream: () => MediaStream | null;
};

function supportsWebCodecs() {
  const w = window as unknown as {
    MediaStreamTrackProcessor?: unknown;
    MediaStreamTrackGenerator?: unknown;
    VideoFrame?: unknown;
  };
  return Boolean(w.MediaStreamTrackProcessor && w.MediaStreamTrackGenerator && w.VideoFrame);
}

function styledTrack(track: MediaStreamTrack): { track: MediaStreamTrack; cleanup: () => void } {
  if (!supportsWebCodecs()) return { track, cleanup: () => undefined };
  const w = window as unknown as {
    MediaStreamTrackProcessor: new (o: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> };
    MediaStreamTrackGenerator: new (o: { kind: string }) => { writable: WritableStream<VideoFrame>; track: MediaStreamTrack };
  };
  try {
    const processor = new w.MediaStreamTrackProcessor({ track });
    const generator = new w.MediaStreamTrackGenerator({ kind: "video" });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return { track, cleanup: () => undefined };
    const reader = processor.readable.getReader();
    const writer = generator.writable.getWriter();
    let stopped = false;

    void (async () => {
      while (!stopped) {
        const { done, value: frame } = await reader.read();
        if (done || !frame) break;
        const width = frame.displayWidth;
        const height = frame.displayHeight;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        ctx.filter = "contrast(1.08) saturate(1.14) brightness(1.03)";
        ctx.drawImage(frame, 0, 0, width, height);
        const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.2, width / 2, height / 2, height * 0.78);
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(1, "rgba(8,6,14,0.42)");
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
        ctx.filter = "none";
        try {
          await writer.write(new VideoFrame(canvas, { timestamp: frame.timestamp, duration: frame.duration ?? 0 }));
        } catch { /* yazıcı kapanmış olabilir */ }
        frame.close();
      }
      try { await writer.close(); } catch { /* zaten kapalı */ }
    })().catch(() => undefined);

    return {
      track: generator.track,
      cleanup: () => {
        stopped = true;
        void reader.cancel().catch(() => undefined);
      },
    };
  } catch {
    return { track, cleanup: () => undefined };
  }
}

export function videoEncodingFor(state: Pick<VideoState, "resolution" | "fps" | "quality">) {
  const preset = resolutions.find((r) => r.id === state.resolution) ?? resolutions[2];
  const quality = qualityOptions.find((q) => q.id === state.quality) ?? qualityOptions[1];
  return {
    maxBitrate: Math.round(preset.bitrate * quality.multiplier),
    maxFramerate: state.fps,
  };
}

export const useVideo = create<VideoState>()(persist((set, get) => {
  function constraints() {
    const s = get();
    const preset = resolutions.find((r) => r.id === s.resolution) ?? resolutions[2];
    return {
      deviceId: s.deviceId ? { exact: s.deviceId } : undefined,
      width: { ideal: preset.width },
      height: { ideal: preset.height },
      frameRate: { ideal: s.fps, max: s.fps },
    } as MediaTrackConstraints;
  }

  function rebuildStream() {
    const raw = local.rawStream;
    if (!raw) return;
    local.cleanupProcessor?.();
    const videoTrack = raw.getVideoTracks()[0];
    if (!videoTrack) return;
    const processed = get().styleFilter ? styledTrack(videoTrack) : { track: videoTrack, cleanup: () => undefined };
    local.cleanupProcessor = processed.cleanup;
    local.stream = new MediaStream([processed.track]);
    set({ stream: local.stream });
  }

  return {
    devices: [],
    deviceId: "",
    resolution: "720p",
    fps: 30,
    quality: "medium",
    codec: "vp8",
    styleFilter: false,
    screenSource: "monitor",
    shareSystemAudio: false,
    webCodecsSupported: typeof window !== "undefined" && supportsWebCodecs(),
    cameraOn: false,
    screenSharing: false,
    screenHasSystemAudio: false,
    error: null,
    stream: null,

    refreshDevices: async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        set({ devices: all.filter((d) => d.kind === "videoinput") });
      } catch { /* liste alınamadı */ }
    },

    setDevice: (deviceId) => {
      set({ deviceId });
      if (get().cameraOn) void get().startCamera();
    },
    setResolution: (resolution) => {
      set({ resolution });
      const track = local.rawStream?.getVideoTracks()[0];
      if (track) void track.applyConstraints(constraints()).catch(() => undefined);
    },
    setFps: (fps) => {
      set({ fps });
      const track = local.rawStream?.getVideoTracks()[0];
      if (track) void track.applyConstraints(constraints()).catch(() => undefined);
    },
    setQuality: (quality) => set({ quality }),
    setCodec: (codec) => set({ codec }),
    setStyleFilter: (styleFilter) => {
      set({ styleFilter });
      if (get().cameraOn) rebuildStream();
    },
    setScreenSource: (screenSource) => set({ screenSource }),
    setShareSystemAudio: (shareSystemAudio) => set({ shareSystemAudio }),

    startCamera: async () => {
      if (!navigator.mediaDevices?.getUserMedia) { set({ error: "MediaDevices API desteklenmiyor" }); return false; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: constraints(), audio: false });
        local.rawStream?.getTracks().forEach((t) => t.stop());
        local.cleanupProcessor?.();
        local.rawStream = stream;
        rebuildStream();
        set({ cameraOn: true, error: null });
        void get().refreshDevices();
        return true;
      } catch (e) {
        set({ error: e instanceof Error ? e.message : "Kamera açılamadı", cameraOn: false });
        return false;
      }
    },
    stopCamera: () => {
      local.cleanupProcessor?.();
      local.cleanupProcessor = null;
      local.rawStream?.getTracks().forEach((t) => t.stop());
      local.rawStream = null;
      local.stream = null;
      set({ cameraOn: false, stream: null });
    },
    attachCamera: (el) => {
      if (el && local.stream) {
        el.srcObject = local.stream;
        void el.play().catch(() => undefined);
      }
    },

    startScreenShare: async () => {
      const media = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: (o: DisplayMediaStreamOptions) => Promise<MediaStream>;
      };
      if (!media?.getDisplayMedia) { set({ error: "Ekran paylaşımı desteklenmiyor" }); return false; }
      const { screenSource, shareSystemAudio, fps } = get();
      try {
        const stream = await media.getDisplayMedia({
          video: {
            displaySurface: screenSource,
            frameRate: { ideal: fps, max: fps },
          } as DisplayMediaStreamOptions["video"],
          audio: shareSystemAudio,
        });
        local.screenStream = stream;
        stream.getVideoTracks()[0]?.addEventListener("ended", () => get().stopScreenShare());
        stream.getAudioTracks()[0]?.addEventListener("ended", () => set({ screenHasSystemAudio: false }));
        const hasAudio = stream.getAudioTracks().length > 0;
        set({ screenSharing: true, screenHasSystemAudio: hasAudio, error: null });
        return true;
      } catch {
        set({ error: "Ekran paylaşımı iptal edildi" });
        return false;
      }
    },
    stopScreenShare: () => {
      local.screenStream?.getTracks().forEach((t) => t.stop());
      local.screenStream = null;
      set({ screenSharing: false, screenHasSystemAudio: false });
    },
    attachScreen: (el) => {
      if (el && local.screenStream) {
        el.srcObject = local.screenStream;
        void el.play().catch(() => undefined);
      }
    },
    getScreenStream: () => local.screenStream,
    getStream: () => local.stream,
  };
}, {
  name: "slopsound-video",
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({
    deviceId: s.deviceId,
    resolution: s.resolution,
    fps: s.fps,
    quality: s.quality,
    codec: s.codec,
    styleFilter: s.styleFilter,
    screenSource: s.screenSource,
    shareSystemAudio: s.shareSystemAudio,
  }),
}));
