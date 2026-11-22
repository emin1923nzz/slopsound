import { create } from "zustand";
import { emitCall, getRealtimeSocket, onCall, onRealtimeConnect } from "@/lib/realtime";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api";

export type CallMode = "audio" | "video";
export type CallPeer = { id: string; username: string; avatarColor: string };
export type CallInfo = { channelId: string; mode: CallMode; peer: CallPeer };

type SignalData =
  | { type: "offer" | "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "candidate"; candidate: RTCIceCandidateInit };

type CallState = {
  incomingCall: CallInfo | null;
  outgoingCall: CallInfo | null;
  activeCall: CallInfo | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  screenSharing: boolean;
  error: string | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  startCall: (channelId: string, mode: CallMode) => void;
  acceptCall: () => void;
  declineCall: () => void;
  cancelCall: () => void;
  endCall: () => void;
  bindCallEvents: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => Promise<void>;
};

type BoundSocket = ReturnType<typeof getRealtimeSocket>;

const fallbackIceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
let iceServers: RTCIceServer[] = fallbackIceServers;
let rtcConfigPromise: Promise<RTCIceServer[]> | null = null;

async function loadIceServers() {
  if (rtcConfigPromise) return rtcConfigPromise;
  rtcConfigPromise = api.rtcConfig()
    .then((config) => {
      iceServers = config.iceServers?.length ? config.iceServers : fallbackIceServers;
      return iceServers;
    })
    .catch(() => {
      rtcConfigPromise = null;
      return iceServers;
    });
  return rtcConfigPromise;
}

let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let callChannelId: string | null = null;
let connectionPromise: Promise<RTCPeerConnection> | null = null;
let pendingCandidates: RTCIceCandidateInit[] = [];
let callEventsBound = false;
let boundSocket: BoundSocket = null;
let eventCleanups: Array<() => void> = [];
let connectCleanup: (() => void) | undefined;
let screenStream: MediaStream | null = null;
let screenSender: RTCRtpSender | null = null;

function resolvePeer(channelId: string, from?: CallPeer): CallPeer {
  if (from) return from;
  const app = useApp.getState();
  const dm = app.dms.find((item) => item.id === channelId);
  const color = dm ? app.members.find((member) => member.id === dm.peerId)?.color : undefined;
  return { id: dm?.peerId ?? "", username: dm?.name ?? "Kullanıcı", avatarColor: color ?? "#8B6CFF" };
}

function cleanupMedia() {
  screenStream?.getTracks().forEach((track) => track.stop());
  screenStream = null;
  screenSender = null;
  if (peerConnection) {
    peerConnection.onicecandidate = null;
    peerConnection.ontrack = null;
    peerConnection.close();
    peerConnection = null;
  }
  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  callChannelId = null;
  connectionPromise = null;
  pendingCandidates = [];
  useCallStore.setState({ localStream: null, remoteStream: null, localScreenStream: null, screenSharing: false, micEnabled: true, cameraEnabled: false });
}

function sendSignal(channelId: string, data: SignalData) {
  emitCall("call:signal", { channelId, data });
}

async function createConnection(channelId: string, mode: CallMode) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
  localStream = stream;
  callChannelId = channelId;
  const servers = await loadIceServers();
  const connection = new RTCPeerConnection({ iceServers: servers, iceCandidatePoolSize: 4 });
  peerConnection = connection;
  stream.getTracks().forEach((track) => connection.addTrack(track, stream));
  connection.ontrack = (event) => {
    const remote = event.streams[0];
    useCallStore.setState((s) => ({
      remoteStream: remote ?? new MediaStream(s.remoteStream ? [...s.remoteStream.getTracks(), event.track] : [event.track]),
    }));
  };
  connection.onicecandidate = (event) => {
    if (event.candidate && callChannelId) sendSignal(callChannelId, { type: "candidate", candidate: event.candidate.toJSON() });
  };
  useCallStore.setState({ localStream: stream, micEnabled: true, cameraEnabled: mode === "video" });
  return connection;
}

function ensureConnection(channelId: string, mode: CallMode) {
  if (peerConnection) return Promise.resolve(peerConnection);
  if (connectionPromise) return connectionPromise;
  connectionPromise = createConnection(channelId, mode);
  return connectionPromise;
}

async function flushCandidates(connection: RTCPeerConnection) {
  const candidates = pendingCandidates;
  pendingCandidates = [];
  for (const candidate of candidates) await connection.addIceCandidate(candidate).catch(() => undefined);
}

function failCall(message: string, channelId?: string) {
  cleanupMedia();
  useCallStore.setState((s) => ({
    activeCall: !channelId || s.activeCall?.channelId === channelId ? null : s.activeCall,
    outgoingCall: !channelId || s.outgoingCall?.channelId === channelId ? null : s.outgoingCall,
    incomingCall: !channelId || s.incomingCall?.channelId === channelId ? null : s.incomingCall,
    error: message,
  }));
}

async function createOffer(channelId: string, mode: CallMode) {
  try {
    const connection = await ensureConnection(channelId, mode);
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    sendSignal(channelId, { type: "offer", sdp: connection.localDescription?.toJSON() ?? offer });
  } catch {
    failCall("Arama kurulamadı", channelId);
  }
}

async function handleSignal(channelId: string, data: SignalData) {
  try {
    if (data.type === "candidate") {
      const connection = peerConnection;
      if (!connection?.remoteDescription) {
        pendingCandidates.push(data.candidate);
        return;
      }
      await connection.addIceCandidate(data.candidate).catch(() => undefined);
      return;
    }
    const state = useCallStore.getState();
    const call = state.activeCall ?? state.outgoingCall ?? state.incomingCall;
    const connection = await ensureConnection(channelId, call?.mode ?? "audio");
    await connection.setRemoteDescription(data.sdp);
    await flushCandidates(connection);
    if (data.type === "offer") {
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      sendSignal(channelId, { type: "answer", sdp: connection.localDescription?.toJSON() ?? answer });
    }
  } catch {
    failCall("Bağlantı kurulamadı", channelId);
  }
}

export const useCallStore = create<CallState>()((set, get) => ({
  incomingCall: null,
  outgoingCall: null,
  activeCall: null,
  localStream: null,
  remoteStream: null,
  localScreenStream: null,
  screenSharing: false,
  error: null,
  micEnabled: true,
  cameraEnabled: false,

  startCall: (channelId, mode) => {
    if (!channelId) return;
    const peer = resolvePeer(channelId);
    set({ outgoingCall: { channelId, mode, peer }, error: null });
    emitCall("call:invite", { channelId, mode }, (result: any) => {
      if (result?.ok === false) {
        set((s) => ({
          outgoingCall: s.outgoingCall?.channelId === channelId ? null : s.outgoingCall,
          error: result.error ?? "Arama başlatılamadı",
        }));
      }
    });
  },

  acceptCall: () => {
    const incoming = get().incomingCall;
    if (!incoming) return;
    const { channelId, mode, peer } = incoming;
    set({ incomingCall: null, outgoingCall: null, activeCall: { channelId, mode, peer }, error: null });
    emitCall("call:accept", { channelId }, (result: any) => {
      if (result?.ok === false) failCall(result.error ?? "Arama kabul edilemedi", channelId);
    });
    void ensureConnection(channelId, mode).catch(() => failCall("Mikrofon/kamera açılamadı", channelId));
  },

  declineCall: () => {
    const incoming = get().incomingCall;
    if (incoming) emitCall("call:decline", { channelId: incoming.channelId });
    cleanupMedia();
    set({ incomingCall: null, error: null });
  },

  cancelCall: () => {
    const outgoing = get().outgoingCall;
    if (outgoing) emitCall("call:cancel", { channelId: outgoing.channelId });
    cleanupMedia();
    set({ outgoingCall: null, error: null });
  },

  endCall: () => {
    const call = get().activeCall ?? get().outgoingCall ?? get().incomingCall;
    if (call) emitCall("call:end", { channelId: call.channelId });
    cleanupMedia();
    set({ activeCall: null, outgoingCall: null, incomingCall: null, error: null });
  },

  bindCallEvents: () => {
    const socket = getRealtimeSocket();
    if (!socket) {
      connectCleanup ??= onRealtimeConnect(() => useCallStore.getState().bindCallEvents());
      return;
    }
    connectCleanup?.();
    connectCleanup = undefined;
    if (callEventsBound && boundSocket === socket) return;
    eventCleanups.forEach((off) => off());
    eventCleanups = [];
    boundSocket = socket;
    callEventsBound = true;
    eventCleanups.push(
      onCall("call:incoming", (payload) => {
        const channelId = payload?.channelId;
        if (!channelId) return;
        const state = get();
        if (state.activeCall || state.outgoingCall || state.incomingCall) {
          emitCall("call:decline", { channelId });
          return;
        }
        const from = payload.from ?? {};
        const fromPeer: CallPeer = {
          id: String(from.id ?? ""),
          username: from.username ?? "Biri",
          avatarColor: from.avatarColor ?? "#8B6CFF",
        };
        set({
          incomingCall: {
            channelId,
            mode: payload.mode === "video" ? "video" : "audio",
            peer: resolvePeer(channelId, fromPeer),
          },
          error: null,
        });
      }),
      onCall("call:accepted", (payload) => {
        const outgoing = get().outgoingCall;
        if (!outgoing || payload?.channelId !== outgoing.channelId) return;
        const mode: CallMode = payload.mode === "video" ? "video" : outgoing.mode;
        set({ outgoingCall: null, activeCall: { ...outgoing, mode }, error: null });
        void createOffer(outgoing.channelId, mode);
      }),
      onCall("call:declined", (payload) => {
        const outgoing = get().outgoingCall;
        if (!outgoing || payload?.channelId !== outgoing.channelId) return;
        cleanupMedia();
        set({ outgoingCall: null, error: "Arama reddedildi" });
      }),
      onCall("call:cancelled", (payload) => {
        const incoming = get().incomingCall;
        if (!incoming || payload?.channelId !== incoming.channelId) return;
        cleanupMedia();
        set({ incomingCall: null, error: null });
      }),
      onCall("call:signal", (payload) => {
        const channelId = payload?.channelId;
        const data = payload?.data as SignalData | undefined;
        if (!channelId || !data?.type) return;
        const state = get();
        const call = state.activeCall ?? state.outgoingCall ?? state.incomingCall;
        if (call && call.channelId !== channelId) return;
        if (data.type !== "candidate" && !data.sdp) return;
        void handleSignal(channelId, data);
      }),
      onCall("call:ended", (payload) => {
        const state = get();
        const call = state.activeCall ?? state.outgoingCall ?? state.incomingCall;
        if (!call || payload?.channelId !== call.channelId) return;
        cleanupMedia();
        set({ activeCall: null, outgoingCall: null, incomingCall: null, error: null });
      }),
    );
  },

  toggleScreenShare: async () => {
    if (get().screenSharing) {
      const cameraTrack = localStream?.getVideoTracks()[0] ?? null;
      await screenSender?.replaceTrack(cameraTrack).catch(() => undefined);
      screenStream?.getTracks().forEach((track) => track.stop());
      screenStream = null;
      screenSender = null;
      set({ screenSharing: false, localScreenStream: null });
      return;
    }
    const call = get().activeCall;
    if (!call || !peerConnection) {
      set({ error: "Ekran paylaşımı için önce bir arama başlat" });
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      set({ error: "Bu tarayıcı ekran paylaşımını desteklemiyor" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("Ekran yakalanamadı");
      let sender = peerConnection.getSenders().find((item) => item.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      else {
        sender = peerConnection.addTrack(track, stream);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignal(call.channelId, { type: "offer", sdp: peerConnection.localDescription?.toJSON() ?? offer });
      }
      screenStream = stream;
      screenSender = sender;
      track.onended = () => { void useCallStore.getState().toggleScreenShare(); };
      set({ screenSharing: true, localScreenStream: stream, error: null });
    } catch {
      set({ error: "Ekran paylaşımı başlatılamadı" });
    }
  },

  toggleMic: () => {
    const next = !get().micEnabled;
    localStream?.getAudioTracks().forEach((track) => { track.enabled = next; });
    set({ micEnabled: next });
  },

  toggleCamera: () => {
    const next = !get().cameraEnabled;
    localStream?.getVideoTracks().forEach((track) => { track.enabled = next; });
    set({ cameraEnabled: next });
  },
}));

export function startCall(channelId: string, mode: CallMode) {
  useCallStore.getState().startCall(channelId, mode);
}
