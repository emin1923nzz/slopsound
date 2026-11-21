import { io, type Socket } from "socket.io-client";
import type { Message } from "./data";
import { API_BASE } from "./config";

let socket: Socket | null = null;

export function connectRealtime() {
  if (socket?.connected) return socket;
  socket ??= io(API_BASE, { withCredentials: true, transports: ["websocket", "polling"] });
  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
}

export function isRealtimeConnected() {
  return Boolean(socket?.connected);
}

export function joinChannel(channelId: string) {
  socket?.emit("channel:join", channelId);
}

export function sendRealtimeMessage(channelId: string, body: string, audioUrl?: string, duration?: number) {
  return new Promise<{ ok: boolean; message?: Message; error?: string }>((resolve) => {
    if (!socket?.connected) return resolve({ ok: false, error: "offline" });
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
      ...(audioUrl ? { audioUrl } : {}),
      ...(duration ? { duration: String(Math.round(duration)) } : {}),
    }, (result: { ok: boolean; message?: Message; error?: string }) => finish(result));
  });
}

export function emitTyping(channelId: string) {
  socket?.emit("typing", channelId);
}

export function onMessage(handler: (payload: { channelId: string; message: Message }) => void) {
  socket?.on("message:new", handler);
  return () => socket?.off("message:new", handler);
}

export function onReaction(handler: (payload: { channelId: string; messageId: string; reactions: Message["reactions"] }) => void) {
  socket?.on("message:reaction", handler);
  return () => socket?.off("message:reaction", handler);
}

export function onTyping(handler: (payload: { user: string; channelId: string }) => void) {
  socket?.on("typing", handler);
  return () => socket?.off("typing", handler);
}

export function onPresence(handler: (payload: { userId: string; status: string }) => void) {
  socket?.on("presence:update", handler);
  return () => socket?.off("presence:update", handler);
}
