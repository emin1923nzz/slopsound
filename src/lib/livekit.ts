import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  ConnectionState,
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  VideoQuality,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
} from "livekit-client";
import { useAudio } from "./audio";
import { useVideo, videoEncodingFor, type QualityId, type ScreenSource } from "./video";

export type RemoteView = {
  id: string;
  name: string;
  color: string;
  cameraOn: boolean;
  audioOn: boolean;
  audioLevel: number;
  isScreen: boolean;
  videoTrack: RemoteVideoTrack | null;
  audioTrack: RemoteAudioTrack | null;
};

export type ConnectionStats = {
  rttMs: number;
  packetLoss: number;
  jitterMs: number;
  kbpsIn: number;
  kbpsOut: number;
  quality: string;
  updatedAt: number;
};

export type RecordingNotice = {
  by: string;
  state: "started" | "stopped";
  at: number;
};

export type ConnectionEvent = {
  at: number;
  state: string;
  detail?: string;
};

type Session = {
  room: Room | null;
  localAudio: LocalAudioTrack | null;
  localVideo: LocalVideoTrack | null;
  audioHost: HTMLDivElement | null;
  statsTimer: number | null;
  levelTimer: number | null;
  lastBytes: { in: number; out: number; at: number };
};

const session: Session = {
  room: null,
  localAudio: null,
  localVideo: null,
  audioHost: null,
  statsTimer: null,
  levelTimer: null,
  lastBytes: { in: 0, out: 0, at: 0 },
};

type LiveKitState = {
  url: string;
  token: string;
  stunUrl: string;
  turnUrl: string;
  turnUsername: string;
  turnPassword: string;
  status: ConnectionState;
  error: string | null;
  participants: RemoteView[];
  screens: RemoteView[];
  activeSpeakerIds: string[];
  screenSharing: boolean;
  stats: ConnectionStats;
  history: ConnectionEvent[];
  recordingNotice: RecordingNotice | null;
  setUrl: (url: string) => void;
  setToken: (token: string) => void;
  setIceConfig: (patch: Partial<Pick<LiveKitState, "stunUrl" | "turnUrl" | "turnUsername" | "turnPassword">>) => void;
  connect: () => Promise<boolean>;
  reconnect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  setMicEnabled: (enabled: boolean) => Promise<void>;
  setCamEnabled: (enabled: boolean) => Promise<void>;
  setScreenShare: (enabled: boolean, options?: { source?: ScreenSource; systemAudio?: boolean }) => Promise<boolean>;
  setPublishQuality: (quality: QualityId) => void;
  publishRecordingNotice: (state: "started" | "stopped") => Promise<void>;
  getRemoteAudioElements: () => HTMLAudioElement[];
  attachTrack: (el: HTMLVideoElement | null, track: RemoteVideoTrack | null) => void;
};

function colorFor(id: string) {
  const palette = ["#C9F25B", "#FF7460", "#FFBA4A", "#4AD6EB", "#8B6CFF", "#FF6B7A"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

const emptyStats: ConnectionStats = {
  rttMs: 0,
  packetLoss: 0,
  jitterMs: 0,
  kbpsIn: 0,
  kbpsOut: 0,
  quality: "—",
  updatedAt: 0,
};

export const useLiveKit = create<LiveKitState>()(persist((set, get) => {
  function setStatus(status: ConnectionState, detail?: string) {
    set((s) => ({
      status,
      history: [...s.history, { at: Date.now(), state: status, detail }].slice(-50),
    }));
  }

  function sync() {
    const room = session.room;
    if (!room) return;
    const views: RemoteView[] = [...room.remoteParticipants.values()].map((p) => {
      const cam = p.getTrackPublication(Track.Source.Camera);
      const mic = p.getTrackPublication(Track.Source.Microphone);
      const screen = p.getTrackPublication(Track.Source.ScreenShare);
      const isScreen = Boolean(screen?.videoTrack);
      const videoTrack = ((isScreen ? screen?.videoTrack : cam?.videoTrack) ?? null) as RemoteVideoTrack | null;
      const audioTrack = (mic?.audioTrack ?? null) as RemoteAudioTrack | null;
      if (audioTrack && session.audioHost && audioTrack.attachedElements.length === 0) {
        session.audioHost.appendChild(audioTrack.attach());
      }
      return {
        id: p.identity,
        name: p.name || p.identity,
        color: colorFor(p.identity),
        cameraOn: Boolean(videoTrack) && !videoTrack!.isMuted,
        audioOn: Boolean(audioTrack) && !audioTrack!.isMuted,
        audioLevel: p.audioLevel ?? 0,
        isScreen,
        videoTrack,
        audioTrack,
      };
    });
    set({
      participants: views.filter((v) => !v.isScreen),
      screens: views.filter((v) => v.isScreen),
      activeSpeakerIds: room.activeSpeakers.map((p) => p.identity),
    });
  }

  function ensureAudioHost() {
    if (session.audioHost) return session.audioHost;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0";
    document.body.appendChild(host);
    session.audioHost = host;
    return host;
  }

  async function pollStats() {
    const room = session.room;
    const manager = room?.engine.pcManager;
    if (!room || !manager) return;
    const reports = await Promise.all([
      manager.publisher.getStats?.(),
      manager.subscriber?.getStats?.(),
    ].filter(Boolean) as Promise<RTCStatsReport>[]).catch(() => []);
    let rttMs = 0;
    let packetLoss = 0;
    let jitterMs = 0;
    let bytesIn = 0;
    let bytesOut = 0;
    reports.forEach((report) => {
      report.forEach((raw) => {
        const stat = raw as unknown as Record<string, number | string | undefined>;
        if (stat.type === "candidate-pair" && stat.state === "succeeded" && typeof stat.currentRoundTripTime === "number") {
          rttMs = Math.max(rttMs, stat.currentRoundTripTime * 1000);
        }
        if (stat.type === "inbound-rtp" && stat.kind === "audio") {
          const lost = Number(stat.packetsLost ?? 0);
          const received = Number(stat.packetsReceived ?? 0);
          packetLoss = Math.max(packetLoss, received + lost > 0 ? lost / (received + lost) : 0);
          jitterMs = Math.max(jitterMs, Number(stat.jitter ?? 0) * 1000);
          bytesIn += Number(stat.bytesReceived ?? 0);
        }
        if (stat.type === "outbound-rtp") bytesOut += Number(stat.bytesSent ?? 0);
      });
    });
    const now = performance.now();
    const elapsed = session.lastBytes.at ? (now - session.lastBytes.at) / 1000 : 0;
    const kbpsIn = elapsed > 0 ? Math.max(0, (bytesIn - session.lastBytes.in) * 8 / elapsed / 1000) : 0;
    const kbpsOut = elapsed > 0 ? Math.max(0, (bytesOut - session.lastBytes.out) * 8 / elapsed / 1000) : 0;
    session.lastBytes = { in: bytesIn, out: bytesOut, at: now };
    set({
      stats: {
        rttMs: Math.round(rttMs),
        packetLoss: Math.round(packetLoss * 1000) / 10,
        jitterMs: Math.round(jitterMs),
        kbpsIn: Math.round(kbpsIn),
        kbpsOut: Math.round(kbpsOut),
        quality: String(room.localParticipant.connectionQuality ?? "—"),
        updatedAt: Date.now(),
      },
    });
  }

  function stopStats() {
    if (session.statsTimer !== null) window.clearInterval(session.statsTimer);
    if (session.levelTimer !== null) window.clearInterval(session.levelTimer);
    session.statsTimer = null;
    session.levelTimer = null;
    session.lastBytes = { in: 0, out: 0, at: 0 };
    set({ stats: emptyStats });
  }

  function cleanup() {
    stopStats();
    session.room?.remoteParticipants.forEach((p) => {
      p.audioTrackPublications.forEach((pub) => pub.audioTrack?.detach());
      p.videoTrackPublications.forEach((pub) => pub.videoTrack?.detach());
    });
    session.localAudio = null;
    session.localVideo = null;
    session.room = null;
    session.audioHost?.remove();
    session.audioHost = null;
  }

  function iceServers(): RTCIceServer[] {
    const { stunUrl, turnUrl, turnUsername, turnPassword } = get();
    const servers: RTCIceServer[] = [];
    if (stunUrl.trim()) servers.push({ urls: stunUrl.trim() });
    if (turnUrl.trim()) servers.push({ urls: turnUrl.trim(), username: turnUsername, credential: turnPassword });
    return servers;
  }

  return {
    url: "",
    token: "",
    stunUrl: "stun:stun.l.google.com:19302",
    turnUrl: "",
    turnUsername: "",
    turnPassword: "",
    status: ConnectionState.Disconnected,
    error: null,
    participants: [],
    screens: [],
    activeSpeakerIds: [],
    screenSharing: false,
    stats: emptyStats,
    history: [],
    recordingNotice: null,

    setUrl: (url) => set({ url }),
    setToken: (token) => set({ token }),
    setIceConfig: (patch) => set(patch),

    connect: async () => {
      const { url, token } = get();
      if (!url.trim() || !token.trim()) {
        setStatus(ConnectionState.Disconnected, "Eksik URL veya token");
        set({ error: "LiveKit URL ve token gerekli" });
        return false;
      }
      setStatus(ConnectionState.Connecting);
      set({ error: null });
      const video = useVideo.getState();
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        stopLocalTrackOnUnpublish: false,
        publishDefaults: {
          videoCodec: video.codec,
          videoEncoding: videoEncodingFor(video),
          screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 },
          backupCodec: video.codec === "vp8" ? false : { codec: "vp8" },
          videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720],
        },
      });
      session.room = room;
      ensureAudioHost();

      room.on(RoomEvent.ParticipantConnected, sync);
      room.on(RoomEvent.ParticipantDisconnected, sync);
      room.on(RoomEvent.TrackSubscribed, sync);
      room.on(RoomEvent.TrackUnsubscribed, sync);
      room.on(RoomEvent.TrackMuted, sync);
      room.on(RoomEvent.TrackUnmuted, sync);
      room.on(RoomEvent.ActiveSpeakersChanged, sync);
      room.on(RoomEvent.ConnectionStateChanged, (state) => setStatus(state));
      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const message = JSON.parse(new TextDecoder().decode(payload)) as {
            type?: string;
            state?: "started" | "stopped";
            at?: number;
          };
          if (message.type === "slopsound-recording" && message.state) {
            set({
              recordingNotice: {
                by: participant?.name || participant?.identity || "Bir katılımcı",
                state: message.state,
                at: message.at ?? Date.now(),
              },
            });
          }
        } catch { /* bilinmeyen veri paketi */ }
      });
      room.on(RoomEvent.Disconnected, () => {
        cleanup();
        setStatus(ConnectionState.Disconnected, "Odadan ayrıldı");
        set({ participants: [], screens: [], activeSpeakerIds: [], screenSharing: false, recordingNotice: null });
      });

      try {
        await room.connect(url.trim(), token.trim(), { rtcConfig: { iceServers: iceServers() } });
        const audio = useAudio.getState();
        const audioReady = audio.status === "ready" ? true : await audio.ensureMic();
        const micTrack = audioReady ? useAudio.getState().getStream()?.getAudioTracks()[0] ?? null : null;
        if (micTrack) {
          session.localAudio = new LocalAudioTrack(micTrack, undefined, true);
          await room.localParticipant.publishTrack(session.localAudio, { source: Track.Source.Microphone });
        }
        const camStream = useVideo.getState().getStream();
        const camTrack = camStream?.getVideoTracks()[0];
        if (camTrack) {
          session.localVideo = new LocalVideoTrack(camTrack, undefined, true);
          await room.localParticipant.publishTrack(session.localVideo, {
            source: Track.Source.Camera,
            videoCodec: useVideo.getState().codec,
            videoEncoding: videoEncodingFor(useVideo.getState()),
          });
        }
        sync();
        session.statsTimer = window.setInterval(() => void pollStats(), 2000);
        session.levelTimer = window.setInterval(sync, 120);
        void pollStats();
        setStatus(ConnectionState.Connected, "Odaya bağlandı");
        set({ error: null });
        return true;
      } catch (e) {
        cleanup();
        const message = e instanceof Error ? e.message : "LiveKit bağlantısı başarısız";
        setStatus(ConnectionState.Disconnected, message);
        set({ error: message });
        return false;
      }
    },

    reconnect: async () => {
      await get().disconnect();
      return get().connect();
    },

    disconnect: async () => {
      session.room?.disconnect();
      cleanup();
      setStatus(ConnectionState.Disconnected, "Bağlantı kapatıldı");
      set({ participants: [], screens: [], activeSpeakerIds: [], screenSharing: false, recordingNotice: null });
    },

    setMicEnabled: async (enabled) => {
      if (session.room) await session.room.localParticipant.setMicrophoneEnabled(enabled);
      else await useAudio.getState().setMuted(!enabled);
    },
    setCamEnabled: async (enabled) => {
      if (session.room) await session.room.localParticipant.setCameraEnabled(enabled);
      else if (enabled) await useVideo.getState().startCamera();
      else useVideo.getState().stopCamera();
    },
    setScreenShare: async (enabled, options) => {
      const video = useVideo.getState();
      const source = options?.source ?? video.screenSource;
      const systemAudio = options?.systemAudio ?? video.shareSystemAudio;
      if (session.room) {
        await session.room.localParticipant.setScreenShareEnabled(
          enabled,
          { video: { displaySurface: source }, audio: systemAudio },
          { videoEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 } },
        );
        set({ screenSharing: enabled });
        return enabled;
      }
      const ok = enabled ? await video.startScreenShare() : (video.stopScreenShare(), true);
      set({ screenSharing: ok && enabled });
      return ok;
    },
    setPublishQuality: (quality) => {
      const map = { low: VideoQuality.LOW, medium: VideoQuality.MEDIUM, high: VideoQuality.HIGH } as const;
      session.localVideo?.setPublishingQuality(map[quality]);
    },
    publishRecordingNotice: async (state) => {
      const room = session.room;
      if (!room) return;
      const payload = new TextEncoder().encode(JSON.stringify({ type: "slopsound-recording", state, at: Date.now() }));
      await room.localParticipant.publishData(payload, { reliable: true });
    },
    getRemoteAudioElements: () => Array.from(session.audioHost?.querySelectorAll("audio") ?? []),
    attachTrack: (el, track) => {
      if (!el || !track) return;
      track.attach(el);
    },
  };
}, {
  name: "slopsound-livekit",
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({
    url: s.url,
    stunUrl: s.stunUrl,
    turnUrl: s.turnUrl,
    turnUsername: s.turnUsername,
    history: s.history.slice(-50),
  }),
  merge: (persisted, current) => {
    const saved = (persisted ?? {}) as Partial<LiveKitState>;
    return { ...current, ...saved, history: saved.history ?? [] };
  },
}));
