import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "./db.js";
import { redis } from "./redis.js";
import { getSessionUser, publicUser, tokenFromRequest } from "./auth.js";
import { canAccessChannel, createVoiceToken } from "./livekit.js";
import { emitMessage, emitReaction } from "./socket.js";
import { maybeSunlopReply } from "./bot.js";
import { userBadges } from "./badges.js";
import {
  channelMembers, channels, friends, messages, serverMembers, servers, users,
} from "./schema.js";

const uuid = z.string().uuid();

function formatTime(date: Date) {
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function requireAuth(request: FastifyRequest) {
  return getSessionUser(tokenFromRequest(request));
}

async function userServers(userId: string) {
  const owned = await db.select({ id: servers.id, name: servers.name, color: servers.color })
    .from(servers).where(eq(servers.ownerId, userId));
  const joined = await db.select({ id: servers.id, name: servers.name, color: servers.color })
    .from(servers)
    .innerJoin(serverMembers, eq(serverMembers.serverId, servers.id))
    .where(eq(serverMembers.userId, userId));
  return [...new Map([...owned, ...joined].map((s) => [s.id, s])).values()];
}

async function ensureDM(userId: string, peerId: string) {
  const mine = await db.select({ channelId: channelMembers.channelId })
    .from(channelMembers).where(eq(channelMembers.userId, userId));
  for (const row of mine) {
    const [other] = await db.select().from(channelMembers)
      .where(and(eq(channelMembers.channelId, row.channelId), eq(channelMembers.userId, peerId)))
      .limit(1);
    if (other) return row.channelId;
  }
  const [channel] = await db.insert(channels).values({
    name: "Direkt mesaj",
    type: "dm",
    description: "Direkt mesaj",
    groupLabel: "DM",
    position: 0,
  }).returning();
  await db.insert(channelMembers).values([
    { channelId: channel.id, userId },
    { channelId: channel.id, userId: peerId },
  ]);
  return channel.id;
}

async function mapMessages(channelId: string, viewerId: string) {
  const rows = await db.select({ message: messages, author: users })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.authorId))
    .where(eq(messages.channelId, channelId))
    .orderBy(desc(messages.createdAt))
    .limit(200);
  return rows.reverse().map(({ message, author }) => ({
    id: message.id,
    author: author.username,
    color: author.avatarColor,
    time: formatTime(message.createdAt),
    text: message.body,
    mention: message.body.includes("@"),
    ai: Boolean(author.bot),
    badges: userBadges(author.createdAt, author.username),
    reactions: message.reactions,
    audioUrl: message.audioUrl ?? undefined,
    duration: message.duration ? Number(message.duration) : undefined,
    own: author.id === viewerId,
  }));
}

export function registerRoutes(app: FastifyInstance) {
  app.get("/bootstrap", async (request, reply) => {
    const user = await requireAuth(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const serverList = await userServers(user.id);

    const groupMap = new Map<string, {
      id: string; name: string; type: string; description: string;
      serverId: string | null; unread: number; live: boolean; people: number;
    }[]>();
    for (const server of serverList) {
      const rows = await db.select().from(channels)
        .where(eq(channels.serverId, server.id))
        .orderBy(channels.position);
      rows.forEach((row) => {
        const list = groupMap.get(row.groupLabel) ?? [];
        list.push({
          id: row.id, name: row.name, type: row.type, description: row.description,
          serverId: row.serverId, unread: 0, live: false, people: 0,
        });
        groupMap.set(row.groupLabel, list);
      });
    }
    const channelGroups = [...groupMap.entries()].map(([label, list]) => ({ label, channels: list }));

    const dmRows = await db.select({ channel: channels })
      .from(channels)
      .innerJoin(channelMembers, eq(channelMembers.channelId, channels.id))
      .where(and(eq(channels.type, "dm"), eq(channelMembers.userId, user.id)));
    const dms = [] as {
      id: string; peerId: string; name: string; status: string; preview: string; time: string;
      unread: number; ai: boolean; group: boolean;
    }[];
    for (const { channel } of dmRows) {
      const peers = await db.select({ user: users })
        .from(users)
        .innerJoin(channelMembers, eq(channelMembers.userId, users.id))
        .where(and(eq(channelMembers.channelId, channel.id), ne(users.id, user.id)))
        .limit(1);
      const peer = peers[0]?.user;
      if (!peer) continue;
      const [last] = await db.select().from(messages)
        .where(eq(messages.channelId, channel.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      const unread = Number((await redis.get(`unread:${user.id}:${channel.id}`)) ?? 0);
      dms.push({
        id: channel.id,
        peerId: peer.id,
        name: peer.username,
        status: peer.status,
        preview: last?.body ?? "Yeni sohbet",
        time: last ? formatTime(last.createdAt) : "Şimdi",
        unread,
        ai: Boolean(peer.bot),
        group: false,
      });
    }

    const memberIds = new Set<string>([user.id]);
    for (const server of serverList) {
      const rows = await db.select({ userId: serverMembers.userId })
        .from(serverMembers).where(eq(serverMembers.serverId, server.id));
      rows.forEach((row) => memberIds.add(row.userId));
    }
    const bots = await db.select({ id: users.id }).from(users).where(eq(users.bot, 1));
    bots.forEach((row) => memberIds.add(row.id));
    const memberRows = memberIds.size
      ? await db.select().from(users).where(inArray(users.id, [...memberIds]))
      : [];
    const members = memberRows.map((row) => ({
      id: row.id,
      name: row.username,
      status: row.status as "online" | "idle" | "dnd" | "offline",
      activity: row.activity || undefined,
      color: row.avatarColor,
      role: row.bot ? "AI" : row.status === "offline" ? "Çevrimdışı" : "Çevrimiçi",
      bot: Boolean(row.bot),
      badges: userBadges(row.createdAt, row.username),
    }));

    const requestRows = await db.select({ id: friends.id, user: users })
      .from(friends)
      .innerJoin(users, eq(users.id, friends.requesterId))
      .where(and(eq(friends.addresseeId, user.id), eq(friends.status, "pending")));
    const friendRequests = requestRows.map((row) => ({
      id: row.id,
      name: `${row.user.username}#${row.user.tag}`,
      source: "SlopSound",
      mutual: "Ortak sunucu",
      time: "Yeni",
    }));

    const since = new Date(Date.now() - 6 * 86_400_000);
    const recent = await db.select({ createdAt: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.authorId, user.id), gte(messages.createdAt, since)));
    const labels = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
    const activity = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.now() - (6 - index) * 86_400_000);
      return { day: labels[date.getDay()], messages: 0, voice: 0 };
    });
    recent.forEach((row) => {
      const index = Math.floor((row.createdAt.getTime() - since.getTime()) / 86_400_000);
      if (index >= 0 && index < 7) activity[index].messages += 1;
    });

    return { user, servers: serverList, channelGroups, dms, members, friendRequests, activity };
  });

  app.patch("/me/profile", async (request, reply) => {
    const user = await requireAuth(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const parsed = z.object({
      name: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/).optional(),
      customStatus: z.string().max(120).optional(),
      bio: z.string().max(190).optional(),
      color: z.string().max(32).optional(),
      avatarUrl: z.string().max(2048).optional(),
      bannerUrl: z.string().max(2048).optional(),
      activity: z.string().max(120).optional(),
      status: z.enum(["online", "idle", "dnd", "offline"]).optional(),
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.username = parsed.data.name;
    if (parsed.data.customStatus !== undefined) patch.customStatus = parsed.data.customStatus;
    if (parsed.data.bio !== undefined) patch.bio = parsed.data.bio;
    if (parsed.data.color !== undefined) patch.avatarColor = parsed.data.color;
    if (parsed.data.avatarUrl !== undefined) patch.avatarUrl = parsed.data.avatarUrl;
    if (parsed.data.bannerUrl !== undefined) patch.bannerUrl = parsed.data.bannerUrl;
    if (parsed.data.activity !== undefined) patch.activity = parsed.data.activity;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    const [updated] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
    return publicUser(updated);
  });

  app.post("/channels", async (request, reply) => {
    const user = await requireAuth(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const parsed = z.object({
      serverId: uuid,
      name: z.string().min(1).max(48),
      type: z.enum(["text", "voice", "announcement"]).default("text"),
      description: z.string().max(160).default(""),
      groupLabel: z.string().max(48).default("Kanallar"),
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const [server] = await db.select().from(servers).where(eq(servers.id, parsed.data.serverId)).limit(1);
    if (!server || server.ownerId !== user.id) return reply.code(403).send({ error: "forbidden" });
    const [channel] = await db.insert(channels).values({
      serverId: parsed.data.serverId,
      name: parsed.data.name,
      type: parsed.data.type,
      description: parsed.data.description,
      groupLabel: parsed.data.groupLabel,
      position: 999,
    }).returning();
    return reply.code(201).send(channel);
  });

  app.post("/dms", async (request, reply) => {
    const user = await requireAuth(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const parsed = z.object({ username: z.string().min(3).max(32) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const [peer] = await db.select().from(users).where(eq(users.username, parsed.data.username)).limit(1);
    if (!peer || peer.id === user.id) return reply.code(404).send({ error: "user_not_found" });

    const existing = await db.select({ channelId: channelMembers.channelId })
      .from(channelMembers).where(eq(channelMembers.userId, user.id));
    for (const row of existing) {
      const [other] = await db.select().from(channelMembers)
        .where(and(eq(channelMembers.channelId, row.channelId), eq(channelMembers.userId, peer.id)))
        .limit(1);
      if (other) return { id: row.channelId, name: peer.username };
    }
    const channelId = await ensureDM(user.id, peer.id);
    return reply.code(201).send({ id: channelId, name: peer.username });
  });

  app.get("/channels/:id/messages", async (request, reply) => {
    const user = await requireAuth(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = request.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid_id" });
    if (!(await canAccessChannel(user.id, id))) return reply.code(403).send({ error: "forbidden" });
    return mapMessages(id, user.id);
  });

  app.post("/channels/:id/messages", async (request, reply) => {
    const user = await requireAuth(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = request.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid_id" });
    if (!(await canAccessChannel(user.id, id))) return reply.code(403).send({ error: "forbidden" });
    const parsed = z.object({
      body: z.string().min(1).max(4000),
      audioUrl: z.string().max(2048).optional(),
      duration: z.string().max(12).optional(),
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    await db.insert(messages).values({
      channelId: id,
      authorId: user.id,
      body: parsed.data.body,
      audioUrl: parsed.data.audioUrl ?? null,
      duration: parsed.data.duration ?? null,
    });
    const list = await mapMessages(id, user.id);
    const message = list[list.length - 1];
    if (message) emitMessage(id, message);
    await maybeSunlopReply(id, user.id, parsed.data.body, emitMessage);
    return reply.code(201).send(message);
  });

  app.post("/messages/:id/reactions", async (request, reply) => {
    const user = await requireAuth(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = request.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid_id" });
    const parsed = z.object({ emoji: z.string().min(1).max(8) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const [row] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    if (!row || !(await canAccessChannel(user.id, row.channelId))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const reactions = (row.reactions ?? []) as { emoji: string; count: number }[];
    const existing = reactions.find((item) => item.emoji === parsed.data.emoji);
    if (existing) existing.count += 1;
    else reactions.push({ emoji: parsed.data.emoji, count: 1 });
    await db.update(messages).set({ reactions }).where(eq(messages.id, id));
    emitReaction(row.channelId, id, reactions);
    return { reactions };
  });

  app.post("/friends/request", async (request, reply) => {
    const user = await requireAuth(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const parsed = z.object({ username: z.string().min(3).max(32) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const [peer] = await db.select().from(users).where(eq(users.username, parsed.data.username)).limit(1);
    if (!peer || peer.id === user.id) return reply.code(404).send({ error: "user_not_found" });
    await db.insert(friends).values({ requesterId: user.id, addresseeId: peer.id }).onConflictDoNothing();
    return { ok: true };
  });

  app.post("/friends/:id/accept", async (request, reply) => {
    const user = await requireAuth(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = request.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid_id" });
    const [updated] = await db.update(friends).set({ status: "accepted" })
      .where(and(eq(friends.id, id), eq(friends.addresseeId, user.id)))
      .returning();
    if (!updated) return reply.code(404).send({ error: "not_found" });
    const [requester] = await db.select().from(users).where(eq(users.id, updated.requesterId)).limit(1);
    const channelId = await ensureDM(user.id, updated.requesterId);
    return { ok: true, username: requester?.username ?? "", channelId };
  });

  app.post("/livekit/token", async (request, reply) => {
    const user = await requireAuth(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const parsed = z.object({ channelId: uuid }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    try {
      return await createVoiceToken(user.id, parsed.data.channelId);
    } catch (error) {
      return reply.code(403).send({ error: error instanceof Error ? error.message : "token_failed" });
    }
  });
}
