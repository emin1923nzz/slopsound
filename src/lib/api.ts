import type { Attachment, AuthUser, Bootstrap, Message, UserProfile } from "./data";
import { API_BASE } from "./config";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = `İstek başarısız (${response.status})`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* boş gövde */ }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<AuthUser>("/auth/me"),
  login: (email: string, password: string, totp?: string) => request<{ ok: boolean }>("/auth/login", {
    method: "POST", body: JSON.stringify({ email, password, ...(totp ? { totp } : {}) }),
  }),
  setup2fa: () => request<{ secret: string; otpauth: string }>("/me/2fa/setup", { method: "POST" }),
  enable2fa: (code: string) => request<{ ok: boolean }>("/me/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }),
  disable2fa: (code: string) => request<{ ok: boolean }>("/me/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),
  disableAccount: () => request<{ ok: boolean }>("/me/disable", { method: "POST" }),
  deleteAccount: () => request<{ ok: boolean }>("/me", { method: "DELETE" }),
  register: (email: string, username: string, password: string) => request<{ ok: boolean }>("/auth/register", {
    method: "POST", body: JSON.stringify({ email, username, password }),
  }),
  googleStart: (mode: "desktop" | "web") => request<{ url: string; state: string; mode: "desktop" | "web" }>(`/auth/google/start?mode=${mode}`),
  googleCallback: (code: string, state: string) => request<{ ok: boolean; user: AuthUser }>("/auth/google/callback", {
    method: "POST", body: JSON.stringify({ code, state }),
  }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  bootstrap: () => request<Bootstrap>("/bootstrap"),
  getUser: (id: string) => request<UserProfile>(`/users/${encodeURIComponent(id)}`),
  aiStatus: () => request<{ configured: boolean; custom: boolean; model: string }>("/me/ai"),
  setAiKey: (groqApiKey: string | null) => request<{ ok: boolean; configured: boolean }>("/me/ai", {
    method: "PATCH", body: JSON.stringify({ groqApiKey }),
  }),
  askAi: (question: string) => request<{ answer: string; source: "groq" | "fallback" }>("/ai/ask", {
    method: "POST", body: JSON.stringify({ question }),
  }),
  translateText: (text: string, targetLanguage: string) => request<{ translation: string; source: "groq" | "fallback" }>("/ai/translate", {
    method: "POST", body: JSON.stringify({ text, targetLanguage }),
  }),
  updateProfile: (patch: Record<string, unknown>) => request<AuthUser>("/me/profile", {
    method: "PATCH", body: JSON.stringify(patch),
  }),
  messages: (channelId: string) => request<Message[]>(`/channels/${channelId}/messages`),
  sendMessage: (channelId: string, body: string, audioUrl?: string, duration?: number, attachments?: Attachment[]) =>
    request<Message>(`/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        body,
        ...(audioUrl ? { audioUrl } : {}),
        ...(duration !== undefined ? { duration: String(Math.round(duration)) } : {}),
        ...(attachments?.length ? { attachments } : {}),
      }),
    }),
  react: (messageId: string, emoji: string) => request<{ reactions: { emoji: string; count: number }[] }>(`/messages/${messageId}/reactions`, {
    method: "POST", body: JSON.stringify({ emoji }),
  }),
  createDM: (username: string) => request<{ id: string; name: string }>("/dms", {
    method: "POST", body: JSON.stringify({ username }),
  }),
  createGroupDM: (name: string, memberIds: string[]) => request<{ id: string; name: string }>("/dms/groups", {
    method: "POST", body: JSON.stringify({ name, memberIds }),
  }),
  friendRequest: (username: string) => request<{ ok: boolean }>("/friends/request", {
    method: "POST", body: JSON.stringify({ username }),
  }),
  acceptFriend: (id: string) => request<{ ok: boolean; username: string; channelId: string }>(`/friends/${id}/accept`, { method: "POST" }),
  rtcConfig: () => request<{ iceServers: RTCIceServer[] }>("/rtc-config"),
  liveKitToken: (channelId: string) => request<{ url: string; token: string; room: string }>("/livekit/token", {
    method: "POST", body: JSON.stringify({ channelId }),
  }),
  discoverServers: () => request<Array<{ id: string; name: string; color: string; iconUrl: string; memberCount: number; joined: boolean }>>("/discover/servers"),
  joinDiscoverServer: (id: string) => request<{ ok: boolean; serverId: string }>(`/discover/servers/${id}/join`, { method: "POST" }),
  createServer: (name: string, iconUrl?: string, isPublic?: boolean) => request<{ id: string; name: string; iconUrl?: string }>("/servers", {
    method: "POST", body: JSON.stringify({ name, ...(iconUrl ? { iconUrl } : {}), ...(isPublic !== undefined ? { isPublic } : {}) }),
  }),
  updateServer: (id: string, patch: { isPublic?: boolean; name?: string }) => request<{ id: string }>(`/servers/${id}`, {
    method: "PATCH", body: JSON.stringify(patch),
  }),
  createChannel: (serverId: string, name: string, type: "text" | "voice" | "announcement", groupLabel: string) =>
    request<{ id: string }>("/channels", {
      method: "POST", body: JSON.stringify({ serverId, name, type, groupLabel, description: "" }),
    }),
  createInvite: (serverId: string) => request<{ code: string; expiresAt: string }>(`/servers/${serverId}/invites`, {
    method: "POST", body: JSON.stringify({ maxUses: 10, ttlHours: 168 }),
  }),
  joinInvite: (code: string) => request<{ ok: boolean; serverId: string }>(`/invites/${encodeURIComponent(code)}/join`, {
    method: "POST",
  }),
  sessions: () => request<{ id: string; createdAt: string; expiresAt: string }[]>("/auth/sessions"),
  deleteSession: (id: string) => request<{ ok: boolean }>(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  deleteAllSessions: () => request<{ ok: boolean; removed: number }>("/auth/sessions", { method: "DELETE" }),
};
