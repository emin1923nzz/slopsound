import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { channelMembers, channels, messages, serverMembers, servers, users } from "./schema.js";
import { getSessionUser, SESSION_COOKIE } from "./auth.js";
import { incrementUnread, rateLimit, redis } from "./redis.js";
import { canAccessChannel } from "./livekit.js";
import { maybeSunlopReply } from "./bot.js";
import { userBadges } from "./badges.js";
import { attachmentsSchema } from "./attachments.js";
import { registerCallHandlers } from "./calls.js";

const messageSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  audioUrl: z.string().max(2048).optional(),
  duration: z.string().max(12).optional(),
  attachments: attachmentsSchema.optional(),
});

function cookieValue(header: string | undefined, name: string) {
  if (!header) return undefined;
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

let io: Server | null = null;

export function emitMessage(channelId: string, message: unknown, authorId?: string) {
  if (!io) return;
  const room = `channel:${channelId}`;
  if (!authorId) {
    io.to(room).emit("message:new", { channelId, message });
    return;
  }
  for (const socketId of io.sockets.adapter.rooms.get(room) ?? []) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    const viewerId = (socket.data.user as { id?: string } | undefined)?.id;
    socket.emit("message:new", {
      channelId,
      message: { ...(message as Record<string, unknown>), own: viewerId === authorId },
    });
  }
}

export function emitReaction(channelId: string, messageId: string, reactions: unknown) {
  io?.to(`channel:${channelId}`).emit("message:reaction", { channelId, messageId, reactions });
}

export async function channelRecipientIds(channelId: string) {
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!channel) return [] as string[];
  if (channel.type === "dm" || !channel.serverId) {
    const rows = await db.select({ userId: channelMembers.userId }).from(channelMembers).where(eq(channelMembers.channelId, channelId));
    return rows.map((row) => row.userId);
  }
  const [server] = await db.select({ ownerId: servers.ownerId }).from(servers).where(eq(servers.id, channel.serverId)).limit(1);
  const rows = await db.select({ userId: serverMembers.userId }).from(serverMembers).where(eq(serverMembers.serverId, channel.serverId));
  return [...new Set([...(server ? [server.ownerId] : []), ...rows.map((row) => row.userId)])];
}

export async function incrementUnreadForMessage(channelId: string, authorId: string) {
  const recipients = await channelRecipientIds(channelId);
  await Promise.all(recipients.filter((id) => id !== authorId).map((id) => incrementUnread(id, channelId)));
}

export function createSocketServer(httpServer: HttpServer, origin: string | string[]) {
  const server = new Server(httpServer, {
    cors: { origin, credentials: true },
    maxHttpBufferSize: 16 * 1024 * 1024,
  });
  io = server;

  server.use(async (socket, next) => {
    const token = cookieValue(socket.handshake.headers.cookie, SESSION_COOKIE)
      ?? socket.handshake.auth.token;
    const user = await getSessionUser(typeof token === "string" ? token : undefined);
    if (!user) return next(new Error("unauthorized"));
    socket.data.user = user;
    next();
  });

  server.on("connection", (socket) => {
    const user = socket.data.user as { id: string; username: string; avatarColor: string; avatarUrl: string; bot: boolean };
    void socket.join(`user:${user.id}`);
    registerCallHandlers(server, socket, user);
    void redis.set(`presence:${user.id}`, "online", "EX", 90);
    socket.broadcast.emit("presence:update", { userId: user.id, status: "online" });

    socket.on("presence:heartbeat", () => {
      void redis.set(`presence:${user.id}`, "online", "EX", 90);
    });

    socket.on("channel:join", async (channelId: string) => {
      if (!z.string().uuid().safeParse(channelId).success) return;
      if (!(await canAccessChannel(user.id, channelId))) return;
      void socket.join(`channel:${channelId}`);
    });

    socket.on("message:send", async (payload: unknown, ack?: (result: unknown) => void) => {
      const parsed = messageSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false, error: "invalid_payload" });
      if (!(await canAccessChannel(user.id, parsed.data.channelId))) {
        return ack?.({ ok: false, error: "forbidden" });
      }
      const limited = await rateLimit(`msg:${user.id}`, 30, 10);
      if (!limited.allowed) return ack?.({ ok: false, error: "rate_limited" });

      const [row] = await db.insert(messages).values({
        channelId: parsed.data.channelId,
        authorId: user.id,
        body: parsed.data.body,
        audioUrl: parsed.data.audioUrl ?? null,
        duration: parsed.data.duration ?? null,
        attachments: parsed.data.attachments ?? [],
      }).returning();
      const [author] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      const message = {
        id: row.id,
        author: author?.username ?? user.username,
        color: author?.avatarColor ?? user.avatarColor,
        time: formatTime(row.createdAt),
        text: row.body,
        mention: row.body.includes("@"),
        ai: Boolean(author?.bot ?? user.bot),
        badges: userBadges(row.createdAt, author?.username ?? user.username, author?.tag),
        reactions: row.reactions,
        avatarUrl: author?.avatarUrl || user.avatarUrl || undefined,
        audioUrl: row.audioUrl ?? undefined,
        duration: row.duration ? Number(row.duration) : undefined,
        attachments: row.attachments ?? [],
        own: true,
      };
      emitMessage(parsed.data.channelId, message, user.id);
      await incrementUnreadForMessage(parsed.data.channelId, user.id);
      await maybeSunlopReply(parsed.data.channelId, user.id, parsed.data.body, emitMessage);
      ack?.({ ok: true, message });
    });

    socket.on("typing", (channelId: string) => {
      if (!z.string().uuid().safeParse(channelId).success) return;
      socket.to(`channel:${channelId}`).emit("typing", { user: user.username, channelId });
    });

    socket.on("disconnect", () => {
      void redis.set(`presence:${user.id}`, "offline", "EX", 3600);
      socket.broadcast.emit("presence:update", { userId: user.id, status: "offline" });
    });
  });

  return server;
}
