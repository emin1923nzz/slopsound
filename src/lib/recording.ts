import { create } from "zustand";
import { ConnectionState } from "livekit-client";
import { useAudio } from "./audio";
import { useVideo } from "./video";
import { useLiveKit } from "./livekit";
import { convertToMp4, ffmpegAvailable, isTauri, pickSavePath, saveRecordingBytes } from "./native";

export type RecordingMode = "local" | "meeting";
export type RecordingSource = "camera" | "screen";

type RecordingState = {
  recording: boolean;
  mode: RecordingMode | null;
  source: RecordingSource;
  startedAt: number;
  elapsed: number;
  notified: boolean;
  saving: boolean;
  savedPath: string | null;
  error: string | null;
  lastUrl: string | null;
  lastMime: string | null;
  start: (mode: RecordingMode, source?: RecordingSource) => Promise<boolean>;
  stop: () => Promise<void>;
  saveLast: () => Promise<void>;
  discardLast: () => void;
};

type Runtime = {
  recorder: MediaRecorder | null;
  chunks: Blob[];
  timer: number | null;
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  elementSources: HTMLMediaElement[];
  canvasFrame: number | null;
};

const runtime: Runtime = {
  recorder: null,
  chunks: [],
  timer: null,
  stream: null,
  audioContext: null,
  elementSources: [],
  canvasFrame: null,
};

function mimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "audio/webm;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function timestampName(ext: string) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `slopsound-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

function buildStream(mode: RecordingMode, source: RecordingSource) {
  const video = useVideo.getState();
  const audio = useAudio.getState();
  const tracks: MediaStreamTrack[] = [];
  const videoStream = source === "screen" ? video.getScreenStream() : video.getStream();
  const videoTrack = videoStream?.getVideoTracks()[0];
  if (videoTrack) tracks.push(videoTrack.clone());
  const micTrack = audio.getStream()?.getAudioTracks()[0];
  if (micTrack) tracks.push(micTrack.clone());

  if (mode === "meeting") {
    const live = useLiveKit.getState();
    const elements = live.getRemoteAudioElements();
    if (elements.length > 0) {
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      runtime.audioContext = context;
      if (micTrack) {
        const micSource = context.createMediaStreamSource(new MediaStream([micTrack]));
        micSource.connect(destination);
      }
      elements.forEach((el) => {
        try {
          const sourceNode = context.createMediaElementSource(el);
          sourceNode.connect(destination);
          sourceNode.connect(context.destination);
          runtime.elementSources.push(el);
        } catch { /* zaten bağlı */ }
      });
      tracks.push(...destination.stream.getAudioTracks());
    }
  }
  return new MediaStream(tracks);
}

export const useRecording = create<RecordingState>((set, get) => ({
  recording: false,
  mode: null,
  source: "screen",
  startedAt: 0,
  elapsed: 0,
  notified: false,
  saving: false,
  savedPath: null,
  error: null,
  lastUrl: null,
  lastMime: null,

  start: async (mode, source = "screen") => {
    if (get().recording) return false;
    if (typeof MediaRecorder === "undefined") {
      set({ error: "Bu ortamda MediaRecorder desteklenmiyor" });
      return false;
    }
    const stream = buildStream(mode, source);
    if (stream.getTracks().length === 0) {
      set({ error: "Kaydedilecek ses veya görüntü yok" });
      return false;
    }
    const type = mimeType();
    try {
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      runtime.recorder = recorder;
      runtime.chunks = [];
      runtime.stream = stream;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) runtime.chunks.push(event.data);
      };
      recorder.start(1000);
      const startedAt = Date.now();
      runtime.timer = window.setInterval(() => set({ elapsed: Math.floor((Date.now() - startedAt) / 1000) }), 500);
      set({ recording: true, mode, source, startedAt, elapsed: 0, notified: false, savedPath: null, error: null });
      const live = useLiveKit.getState();
      if (live.status === ConnectionState.Connected) {
        await live.publishRecordingNotice("started");
        set({ notified: true });
      }
      return true;
    } catch (e) {
      runtime.stream?.getTracks().forEach((t) => t.stop());
      runtime.stream = null;
      set({ error: e instanceof Error ? e.message : "Kayıt başlatılamadı" });
      return false;
    }
  },

  stop: async () => {
    const recorder = runtime.recorder;
    if (!recorder || recorder.state === "inactive") return;
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    if (runtime.timer !== null) window.clearInterval(runtime.timer);
    runtime.timer = null;
    runtime.stream?.getTracks().forEach((t) => t.stop());
    runtime.stream = null;
    void runtime.audioContext?.close().catch(() => undefined);
    runtime.audioContext = null;
    runtime.elementSources = [];
    if (runtime.canvasFrame !== null) cancelAnimationFrame(runtime.canvasFrame);
    runtime.canvasFrame = null;

    const blob = new Blob(runtime.chunks, { type: recorder.mimeType || "video/webm" });
    runtime.chunks = [];
    runtime.recorder = null;
    const url = URL.createObjectURL(blob);
    set({ recording: false, lastUrl: url, lastMime: blob.type });
    const live = useLiveKit.getState();
    if (live.status === "connected") await live.publishRecordingNotice("stopped");
  },

  saveLast: async () => {
    const { lastUrl, lastMime } = get();
    if (!lastUrl) return;
    set({ saving: true, error: null });
    try {
      const ext = lastMime?.includes("audio/") ? "webm" : "webm";
      const defaultName = timestampName(ext);
      const response = await fetch(lastUrl);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!isTauri()) {
        const link = document.createElement("a");
        link.href = lastUrl;
        link.download = defaultName;
        link.click();
        set({ savedPath: defaultName, saving: false });
        return;
      }
      const path = await pickSavePath(defaultName);
      if (!path) { set({ saving: false }); return; }
      await saveRecordingBytes(path, bytes);
      let finalPath = path;
      if (path.toLowerCase().endsWith(".mp4") && await ffmpegAvailable()) {
        const temp = `${path}.webm`;
        await saveRecordingBytes(temp, bytes);
        finalPath = await convertToMp4(temp, path);
      }
      set({ savedPath: finalPath, saving: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Kayıt kaydedilemedi", saving: false });
    }
  },

  discardLast: () => {
    const { lastUrl } = get();
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    set({ lastUrl: null, lastMime: null, savedPath: null, error: null });
  },
}));
