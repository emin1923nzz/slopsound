import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ConnectionState } from "livekit-client";
import { listen } from "@tauri-apps/api/event";
import {
  type ActivityPoint, type Attachment, type AuthUser, type Bootstrap, type ChannelGroup, type DMItem,
  type FriendRequest, type Member, type Message, type ServerItem, type Status,
} from "./data";
import { api } from "./api";
import { isTauri, notify, openExternal, startGoogleOAuthListener, type OAuthCallback } from "./native";
import {
  connectRealtime, disconnectRealtime, emitTyping, joinChannel,   onMessage,
  onPresence, onReaction, onTyping, sendRealtimeMessage,
} from "./realtime";
import { useAudio } from "./audio";
import { useVideo } from "./video";
import { useLiveKit } from "./livekit";

export type View = "app" | "settings" | "addFriend" | "maintenance" | "offline" | "landing";
export type Accent = "violet" | "lime" | "coral" | "cyan" | "amber";
export type Theme = "dark-violet" | "light" | "yellow-black" | "system";
export type Language = "tr" | "en" | "de" | "fr";
export type NotificationPrefs = {
  dm: boolean;
  mention: boolean;
  server: boolean;
  sound: boolean;
  desktop: boolean;
  quiet: string;
};

type Profile = {
  name: string;
  displayName: string;
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
  createServerOpen: boolean;
  selectedProfileId: string | null;
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
  pinnedMessageIds: string[];
  mutedChannelIds: string[];
  notificationPrefs: NotificationPrefs;
  remoteControl: { enabled: boolean; keyboard: boolean; mouse: boolean; adminsOnly: boolean; code: string };
  profile: Profile;
  accent: Accent;
  theme: Theme;
  language: Language;
  autoTranslate: boolean;
  tutorialDone: boolean;
  density: "comfortable" | "compact";
  reduceMotion: boolean;
  focusMode: boolean;
  uiScale: number;
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
  login: (email: string, password: string, totp?: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  setError: (error: string | null) => void;
  setView: (view: View) => void;
  setLauncherOpen: (open: boolean) => void;
  setCreateServerOpen: (open: boolean) => void;
  openProfile: (id: string) => void;
  closeProfile: () => void;
  setSettingsSection: (section: string) => void;
  setAddFriendTab: (tab: string) => void;
  setSidebarTab: (tab: "servers" | "dms") => void;
  selectServer: (id: string) => void;
  selectChannel: (id: string) => void;
  selectDM: (id: string) => void;
  loadMessages: (id: string) => Promise<void>;
  sendMessage: (text: string, attachments?: Attachment[], targetId?: string) => Promise<boolean>;
  forwardMessage: (message: Message, targetId: string) => Promise<boolean>;
  sendVoiceMessage: (blob: Blob, duration: number) => Promise<boolean>;
  reactToMessage: (messageId: string, emoji: string) => Promise<void>;
  setReplyTo: (target: ReplyTarget | null) => void;
  togglePin: (messageId: string) => void;
  deleteMessage: (id: string) => void;
  notifyTyping: () => void;
  updateProfile: (patch: Partial<Profile> & Record<string, unknown>) => Promise<boolean>;
  createServer: (name: string, iconUrl?: string, isPublic?: boolean) => Promise<boolean>;
  createChannel: (name: string, type: "text" | "voice" | "announcement", groupLabel: string) => Promise<boolean>;
  createInvite: (serverId?: string) => Promise<string | null>;
  joinInvite: (code: string) => Promise<void>;
  createDM: (username: string) => Promise<string | null>;
  createGroupDM: (name: string, memberIds: string[]) => Promise<string | null>;
  sendFriendRequest: (username: string) => Promise<{ ok: boolean; error?: string }>;
  acceptRequest: (id: string) => Promise<void>;
  setAccent: (accent: Accent) => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setAutoTranslate: (value: boolean) => void;
  completeTutorial: () => void;
  restartTutorial: () => void;
  setDensity: (density: "comfortable" | "compact") => void;
  setReduceMotion: (value: boolean) => void;
  toggleFocusMode: () => void;
  setUiScale: (value: number) => void;
  setNotificationPrefs: (patch: Partial<NotificationPrefs>) => void;
  setRemoteControl: (patch: Partial<{ enabled: boolean; keyboard: boolean; mouse: boolean; adminsOnly: boolean; code: string }>) => void;
  toggleChannelMute: (channelId: string) => void;
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
  displayName: "",
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
let messagesGeneration = 0;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Ses dosyası okunamadı"));
    reader.readAsDataURL(blob);
  });
}

function quietActive(quiet: string) {
  const match = /^(\d{2}):(\d{2}) - (\d{2}):(\d{2})$/.exec(quiet);
  if (!match) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  return start > end ? current >= start || current < end : current >= start && current < end;
}

function sendRealtimeAttachments(channelId: string, body: string, attachments: Attachment[], duration?: number) {
  return new Promise<{ ok: boolean; message?: Message; error?: string }>((resolve) => {
    const socket = connectRealtime();
    if (!socket.connected) return resolve({ ok: false, error: "offline" });
    let settled = false;
    const finish = (result: { ok: boolean; message?: Message; error?: string }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish({ ok: false, error: "timeout" }), 6000);
    socket.emit("message:send", {
      channelId,
      body,
      ...(duration !== undefined ? { duration: String(Math.round(duration)) } : {}),
      attachments,
    }, (result: { ok: boolean; message?: Message; error?: string }) => finish(result));
  });
}

function profileFromUser(user: AuthUser): Profile {
  return {
    name: user.username,
    displayName: user.displayName || user.username,
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

  function addMessage(channelId: string, message: Message, incoming = false) {
    const state = get();
    if (channelId !== state.activeChannel && channelId !== state.activeDM) return;
    const duplicate = state.messages.some((m) => m.id === message.id);
    set((s) => duplicate ? s : { messages: [...s.messages, message] });
    if (!incoming || duplicate || message.own) return;
    const current = state.sidebarTab === "dms" ? state.activeDM : state.activeChannel;
    const focused = typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();
    if (current === channelId && focused) return;
    const prefs = state.notificationPrefs;
    const isDM = state.dms.some((d) => d.id === channelId);
    const mentioned = Boolean(message.mention) || /@/.test(message.text);
    const allowed = isDM ? prefs.dm : mentioned ? prefs.mention : prefs.server;
    if (!allowed || state.mutedChannelIds.includes(channelId) || quietActive(prefs.quiet)) return;
    if (prefs.sound) useAudio.getState().playSound("mention");
    if (prefs.desktop) void notify(message.author, message.text.slice(0, 140)).catch(() => undefined);
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
    onMessage(({ channelId, message }) => addMessage(channelId, message, true));
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
    onPresence(({ userId, status, activity }) => {
      set((s) => ({
        members: s.members.map((m) => m.id === userId ? { ...m, status: status as Status, activity: activity ?? m.activity } : m),
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
    createServerOpen: false,
    selectedProfileId: null,
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
    pinnedMessageIds: [],
    mutedChannelIds: [],
    notificationPrefs: { dm: true, mention: true, server: false, sound: true, desktop: true, quiet: "Kapalı" },
    remoteControl: { enabled: false, keyboard: true, mouse: true, adminsOnly: true, code: Math.random().toString(36).slice(2, 8).toUpperCase() },
    profile: defaultProfile,
    accent: "violet",
    theme: "dark-violet",
    language: "tr",
    autoTranslate: false,
    tutorialDone: false,
    density: "comfortable",
    reduceMotion: false,
    focusMode: false,
    uiScale: 1,
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

    login: async (email, password, totp) => {
      set({ error: null });
      try {
        await api.login(email, password, totp);
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
        pinnedMessageIds: [], mutedChannelIds: [],
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
    setCreateServerOpen: (createServerOpen) => set({ createServerOpen }),
    openProfile: (selectedProfileId) => set({ selectedProfileId }),
    closeProfile: () => set({ selectedProfileId: null }),
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
      const generation = ++messagesGeneration;
      joinChannel(id);
      try {
        const loaded = await api.messages(id);
        if (generation !== messagesGeneration) return;
        set({ messages: loaded });
      } catch (error) {
        if (generation !== messagesGeneration) return;
        set({ error: error instanceof Error ? error.message : "Mesajlar yüklenemedi" });
      }
    },

    sendMessage: async (text, attachments, targetId) => {
      const trimmed = text.trim();
      const channelId = targetId ?? await currentConversation();
      if ((!trimmed && !attachments?.length) || !channelId) return false;
      joinChannel(channelId);
      const result = attachments?.length
        ? await sendRealtimeAttachments(channelId, trimmed, attachments)
        : await sendRealtimeMessage(channelId, trimmed);
      let message = result.ok ? result.message : undefined;
      if (!message) {
        try { message = await api.sendMessage(channelId, trimmed, undefined, undefined, attachments); }
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

    forwardMessage: async (message, targetId) => {
      const body = `↪ ${message.author}: ${message.text}`;
      return get().sendMessage(body, message.attachments, targetId);
    },

    sendVoiceMessage: async (blob, duration) => {
      const channelId = await currentConversation();
      if (!channelId || !blob.size) return false;
      joinChannel(channelId);
      let dataUrl: string;
      try {
        dataUrl = await blobToDataUrl(blob);
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Ses dosyası okunamadı" });
        return false;
      }
      const attachment: Attachment = {
        kind: "audio",
        mime: blob.type || "audio/webm",
        name: "voice-message",
        url: dataUrl,
        bytes: blob.size,
      };
      const body = "Sesli mesaj";
      const result = await sendRealtimeAttachments(channelId, body, [attachment], duration);
      let message = result.ok ? result.message : undefined;
      if (!message) {
        try { message = await api.sendMessage(channelId, body, undefined, duration, [attachment]); }
        catch { message = undefined; }
      }
      if (!message) {
        set({ error: result.error === "offline" ? "Sunucuya bağlı değilsin" : "Sesli mesaj gönderilemedi" });
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
    togglePin: (messageId) => set((s) => ({
      pinnedMessageIds: s.pinnedMessageIds.includes(messageId)
        ? s.pinnedMessageIds.filter((id) => id !== messageId)
        : [...s.pinnedMessageIds, messageId],
    })),
    deleteMessage: (id) => set((s) => ({
      messages: s.messages.filter((message) => message.id !== id),
      pinnedMessageIds: s.pinnedMessageIds.filter((pinnedId) => pinnedId !== id),
      replyTo: s.replyTo?.id === id ? null : s.replyTo,
    })),

    notifyTyping: () => { void currentConversation().then((id) => { if (id) emitTyping(id); }); },

    updateProfile: async (patch) => {
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.displayName !== undefined) body.displayName = patch.displayName;
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.status !== undefined) body.status = patch.status;
      if (patch.customStatus !== undefined) body.customStatus = patch.customStatus;
      if (patch.bio !== undefined) body.bio = patch.bio;
      if (patch.color !== undefined) body.color = patch.color;
      if (patch.avatarUrl !== undefined) body.avatarUrl = patch.avatarUrl;
      if (patch.bannerUrl !== undefined) body.bannerUrl = patch.bannerUrl;
      if (patch.activity !== undefined) body.activity = patch.activity;
      for (const key of ["youtubeUrl", "spotifyUrl", "steamUrl", "robloxUrl", "appleMusicUrl"] as const) {
        if (patch[key] !== undefined) body[key] = patch[key];
      }
      try {
        applyUser(await api.updateProfile(body));
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Profil güncellenemedi" });
        return false;
      }
    },

    createServer: async (name, iconUrl, isPublic) => {
      try {
        const server = await api.createServer(name, iconUrl, isPublic);
        await get().refreshBootstrap();
        get().selectServer(server.id);
        set({ createServerOpen: false, error: null });
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Sunucu oluşturulamadı" });
        return false;
      }
    },

    createChannel: async (name, type, groupLabel) => {
      const serverId = get().activeServer;
      if (!serverId) {
        set({ error: "Önce bir sunucu seç" });
        return false;
      }
      try {
        const channel = await api.createChannel(serverId, name, type, groupLabel);
        await get().refreshBootstrap();
        if (type !== "voice") get().selectChannel(channel.id);
        set({ error: null });
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Kanal oluşturulamadı" });
        return false;
      }
    },

    createInvite: async (serverIdOverride) => {
      const serverId = serverIdOverride ?? get().activeServer;
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

    createGroupDM: async (name, memberIds) => {
      try {
        const dm = await api.createGroupDM(name, memberIds);
        await get().refreshBootstrap();
        get().selectDM(dm.id);
        return dm.id;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Grup kurulamadı" });
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
    setTheme: (theme) => set({ theme }),
    setLanguage: (language) => set({ language }),
    setAutoTranslate: (autoTranslate) => set({ autoTranslate }),
    completeTutorial: () => set({ tutorialDone: true }),
    restartTutorial: () => set({ tutorialDone: false, view: "app" }),
    setDensity: (density) => set({ density }),
    setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
    setUiScale: (uiScale) => set({ uiScale: Math.max(0.75, Math.min(1.5, uiScale)) }),
    setNotificationPrefs: (patch) => set((s) => ({ notificationPrefs: { ...s.notificationPrefs, ...patch } })),
    setRemoteControl: (patch) => set((s) => ({ remoteControl: { ...s.remoteControl, ...patch } })),
    toggleChannelMute: (channelId) => set((s) => ({
      mutedChannelIds: s.mutedChannelIds.includes(channelId)
        ? s.mutedChannelIds.filter((id) => id !== channelId)
        : [...s.mutedChannelIds, channelId],
    })),

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
        const [token, rtc] = await Promise.all([
          api.liveKitToken(channel.id),
          api.rtcConfig().catch(() => null),
        ]);
        const live = useLiveKit.getState();
        live.setUrl(token.url);
        live.setToken(token.token);
        if (rtc?.iceServers?.length) {
          const urlsOf = (server?: RTCIceServer) => server ? (Array.isArray(server.urls) ? server.urls : [server.urls]) : [];
          const stun = rtc.iceServers.find((server) => urlsOf(server).some((url) => url.startsWith("stun:")));
          const turn = rtc.iceServers.find((server) => urlsOf(server).some((url) => url.startsWith("turn")));
          live.setIceConfig({
            stunUrl: urlsOf(stun)[0] ?? "",
            turnUrl: urlsOf(turn).join(","),
            turnUsername: turn?.username ?? "",
            turnPassword: turn?.credential ?? "",
          });
        }
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
  partialize: (s) => ({
    accent: s.accent,
    theme: s.theme,
    language: s.language,
    autoTranslate: s.autoTranslate,
    tutorialDone: s.tutorialDone,
    density: s.density,
    reduceMotion: s.reduceMotion,
    focusMode: s.focusMode,
    uiScale: s.uiScale,
    pinnedMessageIds: s.pinnedMessageIds,
    mutedChannelIds: s.mutedChannelIds,
    notificationPrefs: s.notificationPrefs,
    remoteControl: s.remoteControl,
  }),
  merge: (persisted, current) => {
    const saved = (persisted ?? {}) as Partial<State>;
    return {
      ...current,
      ...saved,
      profile: defaultProfile,
      theme: ["dark-violet", "light", "yellow-black", "system"].includes(saved.theme ?? "") ? saved.theme! : current.theme,
      language: ["tr", "en", "de", "fr"].includes(saved.language ?? "") ? saved.language! : current.language,
      autoTranslate: typeof saved.autoTranslate === "boolean" ? saved.autoTranslate : false,
      tutorialDone: typeof saved.tutorialDone === "boolean" ? saved.tutorialDone : false,
      pinnedMessageIds: Array.isArray(saved.pinnedMessageIds) ? saved.pinnedMessageIds : [],
      mutedChannelIds: Array.isArray(saved.mutedChannelIds) ? saved.mutedChannelIds : [],
      notificationPrefs: { ...current.notificationPrefs, desktop: true, ...(saved.notificationPrefs ?? {}) },
      remoteControl: { ...current.remoteControl, ...(saved.remoteControl ?? {}) },
    };
  },
}));

if (typeof document !== "undefined") {
  const applyUiScale = (value: number) => document.documentElement.style.setProperty("--ui-scale", String(value));
  const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = theme === "system" ? (systemDark ? "dark-violet" : "light") : theme;
    root.dataset.theme = resolved;
    root.classList.toggle("dark", resolved !== "light");
    root.style.colorScheme = resolved === "light" ? "light" : "dark";
  };
  const applyLanguage = (language: Language) => {
    document.documentElement.lang = language;
  };
  const initial = useApp.getState();
  applyUiScale(initial.uiScale);
  applyTheme(initial.theme);
  applyLanguage(initial.language);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (useApp.getState().theme === "system") applyTheme("system");
  });
  useApp.subscribe((state, previous) => {
    if (state.uiScale !== previous.uiScale) applyUiScale(state.uiScale);
    if (state.theme !== previous.theme) applyTheme(state.theme);
    if (state.language !== previous.language) applyLanguage(state.language);
  });
}
