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
  type LocalTrackPublication,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
} from "livekit-client";
import { useAudio } from "./audio";
import {
  useVideo,
  videoEncodingFor,
  screenQualityPreset,
  displaySurfaceFor,
  type QualityId,
  type ScreenSource,
  type ScreenContentHint,
  type ScreenQualityId,
} from "./video";

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
  screenAudioTrack: RemoteAudioTrack | null;
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

export type RemoteControlRequest = {
  fromId: string;
  fromName: string;
  at: number;
};

export type RemoteControlState = {
  active: boolean;
  controllerId: string | null;
  controllerName: string | null;
  targetId: string | null;
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
  screenPublication: LocalTrackPublication | null;
  audioHost: HTMLDivElement | null;
  statsTimer: number | null;
  levelTimer: number | null;
  lastBytes: { in: number; out: number; at: number };
};

const session: Session = {
  room: null,
  localAudio: null,
  localVideo: null,
  screenPublication: null,
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
  screenPaused: boolean;
  localScreenStream: MediaStream | null;
  stats: ConnectionStats;
  history: ConnectionEvent[];
  recordingNotice: RecordingNotice | null;
  remoteControlRequest: RemoteControlRequest | null;
  remoteControl: RemoteControlState;
  setUrl: (url: string) => void;
  setToken: (token: string) => void;
  setIceConfig: (patch: Partial<Pick<LiveKitState, "stunUrl" | "turnUrl" | "turnUsername" | "turnPassword">>) => void;
  connect: () => Promise<boolean>;
  reconnect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  setMicEnabled: (enabled: boolean) => Promise<void>;
  setCamEnabled: (enabled: boolean) => Promise<void>;
  setScreenShare: (enabled: boolean, options?: {
    source?: ScreenSource;
    systemAudio?: boolean;
    quality?: ScreenQualityId;
    contentHint?: ScreenContentHint;
  }) => Promise<boolean>;
  restartScreenShare: () => Promise<boolean>;
  setScreenQuality: (id?: ScreenQualityId) => Promise<void>;
  setScreenPaused: (paused: boolean) => Promise<void>;
  setPublishQuality: (quality: QualityId) => void;
  publishRecordingNotice: (state: "started" | "stopped") => Promise<void>;
  requestRemoteControl: (targetIdentity: string) => Promise<boolean>;
  respondRemoteControl: (requesterIdentity: string, accepted: boolean) => Promise<boolean>;
  stopRemoteControl: () => Promise<void>;
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
      const screenAudio = p.getTrackPublication(Track.Source.ScreenShareAudio);
      const isScreen = Boolean(screen?.videoTrack);
      const videoTrack = ((isScreen ? screen?.videoTrack : cam?.videoTrack) ?? null) as RemoteVideoTrack | null;
      const audioTrack = (mic?.audioTrack ?? null) as RemoteAudioTrack | null;
      const screenAudioTrack = (screenAudio?.audioTrack ?? null) as RemoteAudioTrack | null;
      const host = session.audioHost;
      if (host) {
        [audioTrack, screenAudioTrack].forEach((track) => {
          if (track && track.attachedElements.length === 0) host.appendChild(track.attach());
        });
      }
      return {
        id: p.identity,
        name: p.name || p.identity,
        color: colorFor(p.identity),
        cameraOn: Boolean(videoTrack) && !videoTrack!.isMuted,
        audioOn: Boolean((audioTrack && !audioTrack.isMuted) || (screenAudioTrack && !screenAudioTrack.isMuted)),
        audioLevel: p.audioLevel ?? 0,
        isScreen,
        videoTrack,
        audioTrack: audioTrack ?? screenAudioTrack,
        screenAudioTrack,
      };
    });
    const localScreenAudio = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    const hasSystemAudio = Boolean(localScreenAudio?.audioTrack && !localScreenAudio.audioTrack.isMuted);
    if (useVideo.getState().screenHasSystemAudio !== hasSystemAudio) {
      useVideo.setState({ screenHasSystemAudio: hasSystemAudio });
    }
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
    session.screenPublication = null;
    session.room = null;
    session.audioHost?.remove();
    session.audioHost = null;
  }

  function iceServers(): RTCIceServer[] {
    const { stunUrl, turnUrl, turnUsername, turnPassword } = get();
    const servers: RTCIceServer[] = [];
    if (stunUrl.trim()) servers.push({ urls: stunUrl.trim() });
    const turnUrls = turnUrl.split(",").map((url) => url.trim()).filter(Boolean);
    if (turnUrls.length) servers.push({ urls: turnUrls, username: turnUsername, credential: turnPassword });
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
    screenPaused: false,
    localScreenStream: null,
    stats: emptyStats,
    history: [],
    recordingNotice: null,
    remoteControlRequest: null,
    remoteControl: { active: false, controllerId: null, controllerName: null, targetId: null },

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
      const screenPreset = screenQualityPreset(video.screenQuality);
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        stopLocalTrackOnUnpublish: false,
        publishDefaults: {
          videoCodec: video.codec,
          videoEncoding: videoEncodingFor(video),
          screenShareEncoding: { maxBitrate: screenPreset.bitrate, maxFramerate: screenPreset.fps },
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
      room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
        if (publication.source !== Track.Source.ScreenShare) return;
        session.screenPublication = null;
        useVideo.setState({ screenHasSystemAudio: false });
        set({ screenSharing: false, screenPaused: false, localScreenStream: null });
      });
      room.on(RoomEvent.ActiveSpeakersChanged, sync);
      room.on(RoomEvent.ConnectionStateChanged, (state) => setStatus(state));
      room.on(RoomEvent.DataReceived, async (payload, participant) => {
        try {
          const message = JSON.parse(new TextDecoder().decode(payload)) as {
            type?: string; state?: "started" | "stopped"; at?: number;
            targetIdentity?: string; requesterIdentity?: string; accepted?: boolean;
          };
          const fromId = participant?.identity ?? "";
          const fromName = participant?.name || participant?.identity || "Bir katılımcı";
          if (message.type === "slopsound-recording" && message.state) {
            set({ recordingNotice: { by: fromName, state: message.state, at: message.at ?? Date.now() } });
          }
          if (message.type === "slopsound-remote-request" && message.targetIdentity === room.localParticipant.identity) {
            const remote = (await import("./store")).useApp.getState().remoteControl;
            if (remote.enabled) set({ remoteControlRequest: { fromId, fromName, at: message.at ?? Date.now() } });
          }
          if (message.type === "slopsound-remote-response" && message.requesterIdentity === room.localParticipant.identity) {
            if (message.accepted) set({ remoteControl: { active: true, controllerId: room.localParticipant.identity, controllerName: room.localParticipant.name || "Sen", targetId: fromId } });
            else set({ remoteControlRequest: null });
          }
          if (message.type === "slopsound-remote-stop") {
            set({ remoteControl: { active: false, controllerId: null, controllerName: null, targetId: null }, remoteControlRequest: null });
          }
        } catch { /* bilinmeyen veri paketi */ }
      });
      room.on(RoomEvent.Disconnected, () => {
        cleanup();
        setStatus(ConnectionState.Disconnected, "Odadan ayrıldı");
        set({ participants: [], screens: [], activeSpeakerIds: [], screenSharing: false, screenPaused: false, localScreenStream: null, recordingNotice: null, remoteControlRequest: null, remoteControl: { active: false, controllerId: null, controllerName: null, targetId: null } });
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
      set({ participants: [], screens: [], activeSpeakerIds: [], screenSharing: false, screenPaused: false, localScreenStream: null, recordingNotice: null, remoteControlRequest: null, remoteControl: { active: false, controllerId: null, controllerName: null, targetId: null } });
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
      const quality = options?.quality ?? video.screenQuality;
      const contentHint = options?.contentHint ?? video.screenContentHint;
      const preset = screenQualityPreset(quality);
      if (session.room) {
        if (!enabled) {
          await session.room.localParticipant.setScreenShareEnabled(false);
          session.screenPublication = null;
          useVideo.setState({ screenHasSystemAudio: false });
          set({ screenSharing: false, screenPaused: false, localScreenStream: null });
          return true;
        }
        const publication = await session.room.localParticipant.setScreenShareEnabled(
          true,
          {
            video: { displaySurface: displaySurfaceFor(source) },
            resolution: { width: preset.width, height: preset.height, frameRate: preset.fps },
            audio: systemAudio,
            surfaceSwitching: "exclude",
            selfBrowserSurface: "exclude",
            preferCurrentTab: source === "tab" || source === "browser",
            systemAudio: "include",
            suppressLocalAudioPlayback: true,
            contentHint,
          },
          {
            source: Track.Source.ScreenShare,
            videoCodec: preset.codec,
            videoEncoding: { maxBitrate: preset.bitrate, maxFramerate: preset.fps },
          },
        );
        session.screenPublication = publication ?? null;
        const track = publication?.videoTrack?.mediaStreamTrack ?? null;
        if (track) track.contentHint = contentHint;
        const audioPublication = session.room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
        const hasSystemAudio = Boolean(audioPublication?.audioTrack && !audioPublication.audioTrack.isMuted);
        useVideo.setState({ screenHasSystemAudio: hasSystemAudio });
        set({
          screenSharing: Boolean(publication),
          screenPaused: false,
          localScreenStream: track ? new MediaStream([track]) : null,
        });
        sync();
        return Boolean(publication);
      }
      if (!enabled) {
        video.stopScreenShare();
        set({ screenSharing: false, screenPaused: false, localScreenStream: null });
        return true;
      }
      const ok = await video.startScreenShare();
      const stream = video.getScreenStream();
      set({
        screenSharing: ok,
        screenPaused: false,
        localScreenStream: ok ? stream : null,
      });
      return ok;
    },
    restartScreenShare: async () => {
      const active = session.room ? Boolean(session.screenPublication) : useVideo.getState().screenSharing;
      if (active) await get().setScreenShare(false);
      return get().setScreenShare(true);
    },
    setScreenQuality: async (id) => {
      const preset = screenQualityPreset(id ?? useVideo.getState().screenQuality);
      useVideo.getState().setScreenQuality(preset.id);
      const sender = session.screenPublication?.videoTrack?.sender;
      if (!sender) return;
      try {
        const params = sender.getParameters();
        const encodings = params.encodings.length > 0 ? params.encodings : [{}];
        params.encodings = encodings.map((encoding) => ({ ...encoding, maxBitrate: preset.bitrate, maxFramerate: preset.fps }));
        await sender.setParameters(params);
      } catch { return; }
    },
    setScreenPaused: async (paused) => {
      const publication = session.screenPublication;
      if (publication) {
        if (paused) await publication.pauseUpstream();
        else await publication.resumeUpstream();
      } else {
        const track = useVideo.getState().getScreenStream()?.getVideoTracks()[0];
        if (track) track.enabled = !paused;
      }
      set({ screenPaused: paused });
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
  requestRemoteControl: async (targetIdentity) => {
    const room = session.room;
    if (!room) return false;
    const payload = new TextEncoder().encode(JSON.stringify({ type: "slopsound-remote-request", targetIdentity, at: Date.now() }));
    await room.localParticipant.publishData(payload, { reliable: true });
    return true;
  },
  respondRemoteControl: async (requesterIdentity, accepted) => {
    const room = session.room;
    if (!room) return false;
    const payload = new TextEncoder().encode(JSON.stringify({ type: "slopsound-remote-response", requesterIdentity, accepted, at: Date.now() }));
    await room.localParticipant.publishData(payload, { reliable: true });
    if (accepted) set({ remoteControl: { active: true, controllerId: requesterIdentity, controllerName: get().remoteControlRequest?.fromName ?? requesterIdentity, targetId: room.localParticipant.identity } });
    set({ remoteControlRequest: null });
    return true;
  },
  stopRemoteControl: async () => {
    const room = session.room;
    if (room) {
      const payload = new TextEncoder().encode(JSON.stringify({ type: "slopsound-remote-stop", at: Date.now() }));
      await room.localParticipant.publishData(payload, { reliable: true });
    }
    set({ remoteControl: { active: false, controllerId: null, controllerName: null, targetId: null }, remoteControlRequest: null });
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
