import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ConnectionState } from "livekit-client";
import { listen } from "@tauri-apps/api/event";
import {
  type ActivityPoint, type AuthUser, type Bootstrap, type ChannelGroup, type DMItem,
  type FriendRequest, type Member, type Message, type ServerItem, type Status,
} from "./data";
import { api } from "./api";
import { isTauri, openExternal, startGoogleOAuthListener, type OAuthCallback } from "./native";
import {
  connectRealtime, disconnectRealtime, emitTyping, joinChannel,   onMessage,
  onPresence, onReaction, onTyping, sendRealtimeMessage,
} from "./realtime";
import { useAudio } from "./audio";
import { useVideo } from "./video";
import { useLiveKit } from "./livekit";

export type View = "app" | "settings" | "addFriend" | "maintenance" | "offline" | "landing";
export type Accent = "violet" | "lime" | "coral" | "cyan" | "amber";

type Profile = {
  name: string;
  tag: string;
  title: string;
  status: Status;
  customStatus: string;
  bio: string;
  color: string;
  avatarUrl: string;
  bannerUrl: string;
  activity: string;
};

type ReplyTarget = { id: string; author: string; text: string };

type State = {
  view: View;
  previousView: View;
  launcherOpen: boolean;
  settingsSection: string;
  addFriendTab: string;
  sidebarTab: "servers" | "dms";
  activeServer: string;
  activeChannel: string;
  activeDM: string;
  voiceChannelId: string;
  authenticated: boolean;
  authLoading: boolean;
  bootstrapLoading: boolean;
  realtimeConnected: boolean;
  user: AuthUser | null;
  error: string | null;
  oauthStatus: string | null;
  servers: ServerItem[];
  channelGroups: ChannelGroup[];
  dms: DMItem[];
  members: Member[];
  friendRequests: FriendRequest[];
  activityData: ActivityPoint[];
  messages: Message[];
  typingUsers: Record<string, string[]>;
  replyTo: ReplyTarget | null;
  profile: Profile;
  accent: Accent;
  density: "comfortable" | "compact";
  reduceMotion: boolean;
  focusMode: boolean;
  micOn: boolean;
  camOn: boolean;
  deafened: boolean;
  voiceConnected: boolean;
  voiceChannel: string;
  speakingId: string | null;
  memberQuery: string;
  dmQuery: string;
  unreadDMs: Record<string, number>;
  acceptedRequests: string[];
  initAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  setError: (error: string | null) => void;
  setView: (view: View) => void;
  setLauncherOpen: (open: boolean) => void;
  setSettingsSection: (section: string) => void;
  setAddFriendTab: (tab: string) => void;
  setSidebarTab: (tab: "servers" | "dms") => void;
  selectServer: (id: string) => void;
  selectChannel: (id: string) => void;
  selectDM: (id: string) => void;
  loadMessages: (id: string) => Promise<void>;
  sendMessage: (text: string) => Promise<boolean>;
  sendVoiceMessage: (url: string, duration: number) => Promise<boolean>;
  reactToMessage: (messageId: string, emoji: string) => Promise<void>;
  setReplyTo: (target: ReplyTarget | null) => void;
  deleteMessage: (id: string) => void;
  notifyTyping: () => void;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  createServer: (name: string) => Promise<void>;
  createInvite: () => Promise<string | null>;
  joinInvite: (code: string) => Promise<void>;
  createDM: (username: string) => Promise<string | null>;
  sendFriendRequest: (username: string) => Promise<{ ok: boolean; error?: string }>;
  acceptRequest: (id: string) => Promise<void>;
  setAccent: (accent: Accent) => void;
  setDensity: (density: "comfortable" | "compact") => void;
  setReduceMotion: (value: boolean) => void;
  toggleFocusMode: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  toggleDeafen: () => void;
  joinVoice: (channelIdOrName?: string) => Promise<void>;
  leaveVoice: () => void;
  setSpeaking: (id: string | null) => void;
  setMemberQuery: (value: string) => void;
  setDmQuery: (value: string) => void;
  clearUnread: (id: string) => void;
};

const defaultProfile: Profile = {
  name: "",
  tag: "",
  title: "",
  status: "offline",
  customStatus: "",
  bio: "",
  color: "#8B6CFF",
  avatarUrl: "",
  bannerUrl: "",
  activity: "",
};

let realtimeBound = false;
const typingTimers = new Map<string, number>();

function profileFromUser(user: AuthUser): Profile {
  return {
    name: user.username,
    tag: user.tag,
    title: user.title,
    status: user.status,
    customStatus: user.customStatus,
    bio: user.bio,
    color: user.avatarColor,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    activity: user.activity,
  };
}

export const useApp = create<State>()(persist((set, get) => {
  function applyUser(user: AuthUser) {
    set({ user, profile: profileFromUser(user) });
  }

  function applyBootstrap(data: Bootstrap) {
    const current = get();
    const firstText = data.channelGroups.flatMap((g) => g.channels).find((c) => c.type !== "voice");
    const firstVoice = data.channelGroups.flatMap((g) => g.channels).find((c) => c.type === "voice");
    const activeServer = data.servers.some((s) => s.id === current.activeServer)
      ? current.activeServer : data.servers[0]?.id ?? "";
    const activeChannel = data.channelGroups.flatMap((g) => g.channels).some((c) => c.id === current.activeChannel)
      ? current.activeChannel : firstText?.id ?? "";
    const activeDM = data.dms.some((d) => d.id === current.activeDM) ? current.activeDM : data.dms[0]?.id ?? "";
    applyUser(data.user);
    set({
      authenticated: true,
      authLoading: false,
      bootstrapLoading: false,
      servers: data.servers,
      channelGroups: data.channelGroups,
      dms: data.dms,
      members: data.members,
      friendRequests: data.friendRequests,
      activityData: data.activity,
      activeServer,
      activeChannel,
      activeDM,
      voiceChannelId: current.voiceChannelId || firstVoice?.id || "",
      unreadDMs: Object.fromEntries(data.dms.map((d) => [d.id, d.unread])),
    });
    const conversation = current.sidebarTab === "dms" ? activeDM : activeChannel;
    if (conversation) void get().loadMessages(conversation);
  }

  function addMessage(channelId: string, message: Message) {
    if (channelId !== get().activeChannel && channelId !== get().activeDM) return;
    set((s) => s.messages.some((m) => m.id === message.id) ? s : { messages: [...s.messages, message] });
  }

  function bindRealtime() {
    if (realtimeBound) return;
    const socket = connectRealtime();
    realtimeBound = true;
    socket.on("connect", () => {
      set({ realtimeConnected: true });
      void currentConversation().then((id) => { if (id) joinChannel(id); });
    });
    socket.on("disconnect", () => set({ realtimeConnected: false }));
    onMessage(({ channelId, message }) => addMessage(channelId, message));
    onReaction(({ messageId, reactions }) => {
      set((s) => ({ messages: s.messages.map((m) => m.id === messageId ? { ...m, reactions } : m) }));
    });
    onTyping(({ user, channelId }) => {
      set((s) => ({ typingUsers: { ...s.typingUsers, [channelId]: [user] } }));
      const key = `${channelId}:${user}`;
      const existing = typingTimers.get(key);
      if (existing) window.clearTimeout(existing);
      typingTimers.set(key, window.setTimeout(() => {
        set((s) => {
          const next = { ...s.typingUsers };
          next[channelId] = (next[channelId] ?? []).filter((name) => name !== user);
          return { typingUsers: next };
        });
        typingTimers.delete(key);
      }, 2500));
    });
    onPresence(({ userId, status }) => {
      set((s) => ({
        members: s.members.map((m) => m.id === userId ? { ...m, status: status as Status } : m),
        dms: s.dms.map((d) => d.peerId === userId ? { ...d, status: status as Status } : d),
      }));
    });
  }

  async function currentConversation() {
    const s = get();
    return s.sidebarTab === "dms" ? s.activeDM : s.activeChannel;
  }

  return {
    view: "app",
    previousView: "app",
    launcherOpen: true,
    settingsSection: "Profilim",
    addFriendTab: "Ad ile Ekle",
    sidebarTab: "servers",
    activeServer: "",
    activeChannel: "",
    activeDM: "",
    voiceChannelId: "",
    authenticated: false,
    authLoading: true,
    bootstrapLoading: false,
    realtimeConnected: false,
    user: null,
    error: null,
    oauthStatus: null,
    servers: [],
    channelGroups: [],
    dms: [],
    members: [],
    friendRequests: [],
    activityData: [],
    messages: [],
    typingUsers: {},
    replyTo: null,
    profile: defaultProfile,
    accent: "violet",
    density: "comfortable",
    reduceMotion: false,
    focusMode: false,
    micOn: true,
    camOn: false,
    deafened: false,
    voiceConnected: false,
    voiceChannel: "",
    speakingId: null,
    memberQuery: "",
    dmQuery: "",
    unreadDMs: {},
    acceptedRequests: [],

    initAuth: async () => {
      set({ authLoading: true, error: null });
      try {
        await api.me();
        await get().refreshBootstrap();
        bindRealtime();
      } catch {
        set({ authenticated: false, authLoading: false, bootstrapLoading: false });
      }
    },

    login: async (email, password) => {
      set({ error: null });
      try {
        await api.login(email, password);
        await get().refreshBootstrap();
        bindRealtime();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Giriş başarısız" });
        throw error;
      }
    },

    register: async (email, username, password) => {
      set({ error: null });
      try {
        await api.register(email, username, password);
        await get().refreshBootstrap();
        bindRealtime();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Kayıt başarısız" });
        throw error;
      }
    },

    loginWithGoogle: async () => {
      set({ error: null, oauthStatus: "Google hazırlanıyor…" });
      try {
        const desktop = isTauri();
        const start = await api.googleStart(desktop ? "desktop" : "web");
        if (!desktop) {
          window.location.assign(start.url);
          return;
        }
        await startGoogleOAuthListener();
        await openExternal(start.url);
        set({ oauthStatus: "Chrome açıldı. Google'da onayla..." });
        const result = await new Promise<{ code: string; state: string }>((resolve, reject) => {
          let settled = false;
          let unlisten: (() => void) | undefined;
          const timer = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            unlisten?.();
            reject(new Error("Google girişi zaman aşımına uğradı"));
          }, 180_000);
          void listen<OAuthCallback>("oauth://google", (event) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            unlisten?.();
            const payload = event.payload;
            if (payload.error) reject(new Error(payload.error));
            else if (payload.code && payload.state) resolve({ code: payload.code, state: payload.state });
            else reject(new Error("Google yanıtı geçersiz"));
          }).then((fn) => { unlisten = fn; }).catch(reject);
        });
        set({ oauthStatus: "Oturum doğrulanıyor…" });
        await api.googleCallback(result.code, result.state);
        await get().refreshBootstrap();
        bindRealtime();
        set({ oauthStatus: null });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Google girişi başarısız", oauthStatus: null });
        throw error;
      }
    },

    logout: async () => {
      try { await api.logout(); } catch { /* oturum zaten kapalı */ }
      disconnectRealtime();
      realtimeBound = false;
      set({
        authenticated: false, user: null, profile: defaultProfile, messages: [],
        servers: [], channelGroups: [], dms: [], members: [], friendRequests: [],
        activityData: [], voiceConnected: false, error: null, oauthStatus: null, launcherOpen: true,
      });
    },

    refreshBootstrap: async () => {
      set({ bootstrapLoading: true, error: null });
      try {
        applyBootstrap(await api.bootstrap());
      } catch (error) {
        set({ bootstrapLoading: false, error: error instanceof Error ? error.message : "Veriler yüklenemedi" });
        throw error;
      }
    },

    setError: (error) => set({ error }),
    setView: (view) => set((s) => ({ view, previousView: s.view })),
    setLauncherOpen: (launcherOpen) => set({ launcherOpen }),
    setSettingsSection: (settingsSection) => set({ settingsSection }),
    setAddFriendTab: (addFriendTab) => set({ addFriendTab }),
    setSidebarTab: (sidebarTab) => {
      set({ sidebarTab });
      const id = sidebarTab === "dms" ? get().activeDM : get().activeChannel;
      if (id) void get().loadMessages(id);
    },

    selectServer: (activeServer) => {
      const serverChannels = get().channelGroups.flatMap((g) => g.channels).filter((c) => c.serverId === activeServer);
      const first = serverChannels.find((c) => c.type !== "voice") ?? serverChannels[0];
      set({ activeServer, sidebarTab: "servers", activeChannel: first?.id ?? "" });
      if (first) void get().loadMessages(first.id);
    },

    selectChannel: (activeChannel) => {
      set({ activeChannel, sidebarTab: "servers", view: "app" });
      void get().loadMessages(activeChannel);
    },

    selectDM: (activeDM) => {
      set((s) => {
        const unreadDMs = { ...s.unreadDMs };
        delete unreadDMs[activeDM];
        return { activeDM, sidebarTab: "dms", unreadDMs, view: "app" };
      });
      void get().loadMessages(activeDM);
    },

    loadMessages: async (id) => {
      if (!id) return;
      joinChannel(id);
      try {
        set({ messages: await api.messages(id) });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Mesajlar yüklenemedi" });
      }
    },

    sendMessage: async (text) => {
      const trimmed = text.trim();
      const channelId = await currentConversation();
      if (!trimmed || !channelId) return false;
      joinChannel(channelId);
      const result = await sendRealtimeMessage(channelId, trimmed);
      let message = result.ok ? result.message : undefined;
      if (!message) {
        try { message = await api.sendMessage(channelId, trimmed); }
        catch { message = undefined; }
      }
      if (!message) {
        set({ error: result.error === "offline" ? "Sunucuya bağlı değilsin" : "Mesaj gönderilemedi" });
        return false;
      }
      addMessage(channelId, message);
      set({ error: null });
      useAudio.getState().playSound("send");
      return true;
    },

    sendVoiceMessage: async (audioUrl, duration) => {
      const channelId = await currentConversation();
      if (!channelId) return false;
      joinChannel(channelId);
      const result = await sendRealtimeMessage(channelId, "Sesli mesaj", audioUrl, duration);
      let message = result.ok ? result.message : undefined;
      if (!message) {
        try { message = await api.sendMessage(channelId, "Sesli mesaj", audioUrl, duration); }
        catch { message = undefined; }
      }
      if (!message) {
        set({ error: "Sesli mesaj gönderilemedi" });
        return false;
      }
      addMessage(channelId, message);
      set({ error: null });
      useAudio.getState().playSound("send");
      return true;
    },

    reactToMessage: async (messageId, emoji) => {
      try {
        const { reactions } = await api.react(messageId, emoji);
        set((s) => ({ messages: s.messages.map((m) => m.id === messageId ? { ...m, reactions } : m) }));
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Tepki eklenemedi" });
      }
    },

    setReplyTo: (replyTo) => set({ replyTo }),
    deleteMessage: (id) => set((s) => ({
      messages: s.messages.filter((message) => message.id !== id),
      replyTo: s.replyTo?.id === id ? null : s.replyTo,
    })),

    notifyTyping: () => { void currentConversation().then((id) => { if (id) emitTyping(id); }); },

    updateProfile: async (patch) => {
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.status !== undefined) body.status = patch.status;
      if (patch.customStatus !== undefined) body.customStatus = patch.customStatus;
      if (patch.bio !== undefined) body.bio = patch.bio;
      if (patch.color !== undefined) body.color = patch.color;
      if (patch.avatarUrl !== undefined) body.avatarUrl = patch.avatarUrl;
      if (patch.bannerUrl !== undefined) body.bannerUrl = patch.bannerUrl;
      if (patch.activity !== undefined) body.activity = patch.activity;
      try {
        applyUser(await api.updateProfile(body));
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Profil güncellenemedi" });
      }
    },

    createServer: async (name) => {
      try {
        const server = await api.createServer(name);
        await get().refreshBootstrap();
        get().selectServer(server.id);
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Sunucu oluşturulamadı" });
      }
    },

    createInvite: async () => {
      const serverId = get().activeServer;
      if (!serverId) return null;
      try {
        const invite = await api.createInvite(serverId);
        return invite.code;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Davet oluşturulamadı" });
        return null;
      }
    },

    joinInvite: async (code) => {
      try {
        const result = await api.joinInvite(code);
        await get().refreshBootstrap();
        get().selectServer(result.serverId);
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Davete katılınamadı" });
        throw error;
      }
    },

    createDM: async (username) => {
      try {
        const dm = await api.createDM(username);
        await get().refreshBootstrap();
        get().selectDM(dm.id);
        return dm.id;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "DM açılamadı" });
        return null;
      }
    },

    sendFriendRequest: async (username) => {
      const clean = username.trim().split("#")[0];
      try {
        await api.friendRequest(clean);
        set({ error: null });
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "İstek gönderilemedi";
        set({ error: message });
        return { ok: false, error: message };
      }
    },

    acceptRequest: async (id) => {
      try {
        await api.acceptFriend(id);
        set((s) => ({ acceptedRequests: [...s.acceptedRequests, id], friendRequests: s.friendRequests.filter((r) => r.id !== id) }));
        await get().refreshBootstrap();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "İstek kabul edilemedi" });
      }
    },

    setAccent: (accent) => set({ accent }),
    setDensity: (density) => set({ density }),
    setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

    toggleMic: () => {
      const next = !get().micOn;
      set({ micOn: next });
      const live = useLiveKit.getState();
      if (live.status === ConnectionState.Connected) void live.setMicEnabled(next);
      else {
        const audio = useAudio.getState();
        if (next) void audio.ensureMic();
        audio.setMuted(!next);
      }
    },

    toggleCam: () => {
      const next = !get().camOn;
      set({ camOn: next });
      const live = useLiveKit.getState();
      if (live.status === ConnectionState.Connected) void live.setCamEnabled(next);
      else if (next) void useVideo.getState().startCamera();
      else useVideo.getState().stopCamera();
    },

    toggleDeafen: () => {
      const next = !get().deafened;
      set((s) => ({ deafened: next, micOn: next ? false : s.micOn }));
      const audio = useAudio.getState();
      audio.setDeafened(next);
      audio.setMuted(next);
    },

    joinVoice: async (channelIdOrName) => {
      const channels = get().channelGroups.flatMap((g) => g.channels).filter((c) => c.type === "voice");
      const channel = channelIdOrName
        ? channels.find((c) => c.id === channelIdOrName || c.name === channelIdOrName) ?? channels[0]
        : channels.find((c) => c.id === get().voiceChannelId) ?? channels[0];
      if (!channel) {
        set({ error: "Ses kanalı bulunamadı" });
        return;
      }
      try {
        const token = await api.liveKitToken(channel.id);
        const live = useLiveKit.getState();
        live.setUrl(token.url);
        live.setToken(token.token);
        set({ voiceChannelId: channel.id, voiceChannel: channel.name, error: null });
        const ok = await live.connect();
        if (!ok) {
          set({ voiceConnected: false, error: live.error ?? "Ses odasına bağlanılamadı" });
          return;
        }
        set({ voiceConnected: true });
        void useAudio.getState().ensureMic();
        useAudio.getState().playSound("connect");
      } catch (error) {
        set({ voiceConnected: false, error: error instanceof Error ? error.message : "Ses odasına bağlanılamadı" });
      }
    },

    leaveVoice: () => {
      set({ voiceConnected: false, speakingId: null });
      const live = useLiveKit.getState();
      if (live.status === ConnectionState.Connected) void live.disconnect();
      if (live.screenSharing) void live.setScreenShare(false);
      useAudio.getState().stopMic();
    },

    setSpeaking: (speakingId) => set({ speakingId }),
    setMemberQuery: (memberQuery) => set({ memberQuery }),
    setDmQuery: (dmQuery) => set({ dmQuery }),
    clearUnread: (id) => set((s) => {
      const unreadDMs = { ...s.unreadDMs };
      delete unreadDMs[id];
      return { unreadDMs };
    }),
  };
}, {
  name: "slopsound-ui",
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ accent: s.accent, density: s.density, reduceMotion: s.reduceMotion, focusMode: s.focusMode }),
  merge: (persisted, current) => {
    const saved = (persisted ?? {}) as Partial<State>;
    return { ...current, ...saved, profile: defaultProfile };
  },
}));
