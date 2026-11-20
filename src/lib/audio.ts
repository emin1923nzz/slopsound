import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AudioStatus = "idle" | "requesting" | "ready" | "denied" | "unsupported";
export type SoundKind = "send" | "mention" | "connect" | "toggle" | "error" | "blop" | "ask";

type Devices = {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
};

type Engine = {
  ctx: AudioContext | null;
  stream: MediaStream | null;
  source: MediaStreamAudioSourceNode | null;
  gate: GainNode | null;
  analyser: AnalyserNode | null;
  sink: GainNode | null;
  data: Uint8Array<ArrayBuffer> | null;
  cameraStream: MediaStream | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  raf: number;
  lastFrame: number;
  smoothed: number;
  pttDown: boolean;
  recordTimer: number;
  recordStart: number;
};

const engine: Engine = {
  ctx: null, stream: null, source: null, gate: null, analyser: null, sink: null,
  data: null, cameraStream: null, recorder: null, chunks: [], raf: 0, lastFrame: 0,
  smoothed: 0, pttDown: false, recordTimer: 0, recordStart: 0,
};

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!engine.ctx) engine.ctx = new Ctor();
  if (engine.ctx.state === "suspended") void engine.ctx.resume();
  return engine.ctx;
}

function gateValue(muted: boolean, pushToTalk: boolean, pttDown: boolean, volume: number) {
  if (muted) return 0;
  if (pushToTalk && !pttDown) return 0;
  return Math.max(0, Math.min(1, volume / 100));
}

type AudioState = {
  status: AudioStatus;
  devices: Devices;
  inputId: string;
  outputId: string;
  cameraId: string;
  volume: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGain: boolean;
  pushToTalk: boolean;
  soundEnabled: boolean;
  muted: boolean;
  deafened: boolean;
  cameraOn: boolean;
  level: number;
  levels: number[];
  recording: boolean;
  recordingSeconds: number;
  lastRecordingUrl: string | null;
  ensureMic: () => Promise<boolean>;
  stopMic: () => void;
  setMuted: (value: boolean) => void;
  setDeafened: (value: boolean) => void;
  setVolume: (value: number) => void;
  setNoiseSuppression: (value: boolean) => void;
  setEchoCancellation: (value: boolean) => void;
  setAutoGain: (value: boolean) => void;
  setPushToTalk: (value: boolean) => void;
  setSoundEnabled: (value: boolean) => void;
  setInputDevice: (id: string) => void;
  setOutputDevice: (id: string) => void;
  setCameraDevice: (id: string) => void;
  refreshDevices: () => Promise<void>;
  startCamera: () => Promise<boolean>;
  stopCamera: () => void;
  attachCamera: (el: HTMLVideoElement | null) => void;
  playSound: (kind: SoundKind) => void;
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
  getStream: () => MediaStream | null;
};

export const useAudio = create<AudioState>()(persist((set, get) => {
  function applyGate() {
    const s = get();
    if (engine.gate && engine.ctx) {
      engine.gate.gain.setTargetAtTime(
        gateValue(s.muted, s.pushToTalk, engine.pttDown, s.volume),
        engine.ctx.currentTime,
        0.02,
      );
    }
  }

  function meter(now: number) {
    if (!engine.analyser || !engine.data) return;
    if (now - engine.lastFrame >= 32) {
      engine.lastFrame = now;
      engine.analyser.getByteTimeDomainData(engine.data);
      let sum = 0;
      for (let i = 0; i < engine.data.length; i++) {
        const v = (engine.data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / engine.data.length);
      const target = Math.min(1, rms * 3.2);
      engine.smoothed = engine.smoothed * 0.72 + target * 0.28;
      const level = Math.round(engine.smoothed * 100) / 100;
      set((s) => ({ level, levels: [...s.levels.slice(-39), level] }));
    }
    engine.raf = requestAnimationFrame(meter);
  }

  function disconnectMic() {
    if (engine.raf) cancelAnimationFrame(engine.raf);
    engine.raf = 0;
    engine.stream?.getTracks().forEach((t) => t.stop());
    engine.source?.disconnect();
    engine.gate?.disconnect();
    engine.analyser?.disconnect();
    engine.sink?.disconnect();
    engine.stream = null;
    engine.source = null;
    engine.gate = null;
    engine.analyser = null;
    engine.sink = null;
    engine.data = null;
    engine.smoothed = 0;
    set({ level: 0, levels: [] });
  }

  async function acquire() {
    const ctx = context();
    if (!ctx || !navigator.mediaDevices?.getUserMedia) {
      set({ status: "unsupported" });
      return false;
    }
    const s = get();
    set({ status: "requesting" });
    try {
      const audio: MediaTrackConstraints = {
        noiseSuppression: s.noiseSuppression,
        echoCancellation: s.echoCancellation,
        autoGainControl: s.autoGain,
        ...(s.inputId ? { deviceId: { exact: s.inputId } } : {}),
      };
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      disconnectMic();
      engine.stream = stream;
      engine.source = ctx.createMediaStreamSource(stream);
      engine.gate = ctx.createGain();
      engine.analyser = ctx.createAnalyser();
      engine.analyser.fftSize = 512;
      engine.analyser.smoothingTimeConstant = 0.72;
      engine.sink = ctx.createGain();
      engine.sink.gain.value = 0;
      engine.data = new Uint8Array(engine.analyser.fftSize);
      engine.source.connect(engine.gate);
      engine.gate.connect(engine.analyser);
      engine.analyser.connect(engine.sink);
      engine.sink.connect(ctx.destination);
      applyGate();
      engine.lastFrame = 0;
      engine.raf = requestAnimationFrame(meter);
      set({ status: "ready" });
      void get().refreshDevices();
      return true;
    } catch {
      set({ status: "denied" });
      return false;
    }
  }

  function onPttKey(e: KeyboardEvent, down: boolean) {
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (e.code !== "KeyV") return;
    if (engine.pttDown === down) return;
    engine.pttDown = down;
    applyGate();
  }

  window?.addEventListener?.("keydown", (e) => onPttKey(e, true));
  window?.addEventListener?.("keyup", (e) => onPttKey(e, false));

  return {
    status: "idle",
    devices: { inputs: [], outputs: [], cameras: [] },
    inputId: "",
    outputId: "",
    cameraId: "",
    volume: 78,
    noiseSuppression: true,
    echoCancellation: true,
    autoGain: true,
    pushToTalk: false,
    soundEnabled: true,
    muted: false,
    deafened: false,
    cameraOn: false,
    level: 0,
    levels: [],
    recording: false,
    recordingSeconds: 0,
    lastRecordingUrl: null,

    ensureMic: async () => {
      if (get().status === "ready" && engine.stream) return true;
      return acquire();
    },
    stopMic: () => { disconnectMic(); set({ status: "idle" }); },

    setMuted: (muted) => { set({ muted }); applyGate(); get().playSound("toggle"); },
    setDeafened: (deafened) => { set({ deafened }); get().playSound("toggle"); },
    setVolume: (volume) => { set({ volume }); applyGate(); },
    setNoiseSuppression: (noiseSuppression) => { set({ noiseSuppression }); if (get().status === "ready") void acquire(); },
    setEchoCancellation: (echoCancellation) => { set({ echoCancellation }); if (get().status === "ready") void acquire(); },
    setAutoGain: (autoGain) => { set({ autoGain }); if (get().status === "ready") void acquire(); },
    setPushToTalk: (pushToTalk) => { engine.pttDown = false; set({ pushToTalk }); applyGate(); },
    setSoundEnabled: (soundEnabled) => set({ soundEnabled }),

    setInputDevice: (inputId) => { set({ inputId }); if (get().status === "ready") void acquire(); },
    setOutputDevice: (outputId) => {
      set({ outputId });
      const ctx = context() as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
      if (ctx?.setSinkId && outputId) void ctx.setSinkId(outputId).catch(() => undefined);
    },
    setCameraDevice: (cameraId) => { set({ cameraId }); if (get().cameraOn) { get().stopCamera(); void get().startCamera(); } },

    refreshDevices: async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        set({
          devices: {
            inputs: all.filter((d) => d.kind === "audioinput"),
            outputs: all.filter((d) => d.kind === "audiooutput"),
            cameras: all.filter((d) => d.kind === "videoinput"),
          },
        });
      } catch { /* cihaz listesi alınamadı */ }
    },

    startCamera: async () => {
      if (!navigator.mediaDevices?.getUserMedia) return false;
      try {
        const s = get();
        engine.cameraStream = await navigator.mediaDevices.getUserMedia({
          video: s.cameraId ? { deviceId: { exact: s.cameraId } } : { width: 640, height: 480 },
          audio: false,
        });
        set({ cameraOn: true });
        void get().refreshDevices();
        return true;
      } catch {
        set({ cameraOn: false });
        return false;
      }
    },
    stopCamera: () => {
      engine.cameraStream?.getTracks().forEach((t) => t.stop());
      engine.cameraStream = null;
      set({ cameraOn: false });
    },
    attachCamera: (el) => {
      if (el && engine.cameraStream) {
        el.srcObject = engine.cameraStream;
        void el.play().catch(() => undefined);
      }
    },

    playSound: (kind) => {
      const s = get();
      if (!s.soundEnabled) return;
      const ctx = context();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes: Record<SoundKind, [number, number][]> = {
        send: [[660, 0], [880, 0.07]],
        mention: [[520, 0], [780, 0.09], [1040, 0.18]],
        connect: [[440, 0], [660, 0.08], [880, 0.16]],
        toggle: [[420, 0]],
        error: [[180, 0], [140, 0.1]],
        blop: [[720, 0], [980, 0.05]],
        ask: [[520, 0], [700, 0.06], [920, 0.12]],
      };
      notes[kind].forEach(([freq, offset]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = kind === "error" ? "sawtooth" : "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.09, now + offset + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.13);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.15);
      });
    },

    startRecording: async () => {
      const ok = await get().ensureMic();
      if (!ok || !engine.stream || typeof MediaRecorder === "undefined") return false;
      engine.chunks = [];
      engine.recorder = new MediaRecorder(engine.stream);
      engine.recorder.ondataavailable = (e) => { if (e.data.size) engine.chunks.push(e.data); };
      engine.recorder.start();
      engine.recordStart = Date.now();
      set({ recording: true, recordingSeconds: 0 });
      engine.recordTimer = window.setInterval(() => {
        set({ recordingSeconds: Math.floor((Date.now() - engine.recordStart) / 1000) });
      }, 250);
      return true;
    },
    stopRecording: () => {
      if (!engine.recorder) return;
      window.clearInterval(engine.recordTimer);
      engine.recorder.onstop = () => {
        const blob = new Blob(engine.chunks, { type: engine.recorder?.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        set({ lastRecordingUrl: url, recording: false, recordingSeconds: 0 });
      };
      engine.recorder.stop();
      engine.recorder = null;
    },
    getStream: () => engine.stream,
  };
}, {
  name: "slopsound-audio",
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({
    inputId: s.inputId,
    outputId: s.outputId,
    cameraId: s.cameraId,
    volume: s.volume,
    noiseSuppression: s.noiseSuppression,
    echoCancellation: s.echoCancellation,
    autoGain: s.autoGain,
    pushToTalk: s.pushToTalk,
    soundEnabled: s.soundEnabled,
  }),
}));

export function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
