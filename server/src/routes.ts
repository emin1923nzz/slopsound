import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "./db.js";
import { clearUnread, getPresence, getUnread, redis } from "./redis.js";
import { getSessionUser, publicUser, tokenFromRequest } from "./auth.js";
import { canAccessChannel, createVoiceToken } from "./livekit.js";
import { channelRecipientIds, emitMessage, emitReaction, incrementUnreadForMessage } from "./socket.js";
import { maybeSunlopReply } from "./bot.js";
import { userBadges } from "./badges.js";
import { attachmentsSchema } from "./attachments.js";
import {
  channelMembers, channels, friends, messages, serverMembers, servers, users,
} from "./schema.js";

const uuid = z.string().uuid();

const httpMediaUrl = z.string().max(2048).refine((value) => {
  if (/\.svg(?:[?#]|$)/i.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
});

const dataMediaUrl = (maxChars: number) => z.string().min(1).max(maxChars)
  .regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/);

const mediaUrl = (maxChars: number) => z.union([httpMediaUrl, dataMediaUrl(maxChars)]).optional().nullable();

function isUniqueViolation(error: unknown) {
  const detail = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const message = error instanceof Error ? error.message : "";
  return detail?.code === "23505"
    || detail?.cause?.code === "23505"
    || message.includes("23505")
    || message.includes("duplicate key value");
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(date: Date) {
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "Şimdi";
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} dk`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} sa`;
  if (diff < 7 * day) return `${Math.max(1, Math.floor(diff / day))} gün`;
  return date.toLocaleDateString("tr-TR");
}

function requireAuth(request: FastifyRequest) {
  return getSessionUser(tokenFromRequest(request));
}

async function userServers(userId: string) {
  const owned = await db.select({ id: servers.id, name: servers.name, color: servers.color, ownerId: servers.ownerId })
    .from(servers).where(eq(servers.ownerId, userId));
  const joined = await db.select({ id: servers.id, name: servers.name, color: servers.color, ownerId: servers.ownerId })
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
    badges: userBadges(author.createdAt, author.username, author.tag),
    reactions: message.reactions,
    avatarUrl: author.avatarUrl || undefined,
    audioUrl: message.audioUrl ?? undefined,
    duration: message.duration ? Number(message.duration) : undefined,
    attachments: message.attachments ?? [],
    own: author.id === viewerId,
  }));
}

async function mutualServerCount(userId: string, peerId: string) {
  const [mine, theirs] = await Promise.all([
    userServers(userId),
    userServers(peerId),
  ]);
  const theirIds = new Set(theirs.map((s) => s.id));
  return mine.filter((s) => theirIds.has(s.id)).length;
}

export function registerRoutes(app: FastifyInstance) {
  app.get("/bootstrap", async (request, reply) => {
    const user = await requireAuth(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const serverList = await userServers(user.id);
    const presenceFor = async (id: string, fallback: string) => {
      const p = await getPresence(id);
      return p === "online" ? (fallback === "offline" ? "online" : fallback) : "offline";
    };

    const groupMap = new Map<string, {
      id: string; name: string; type: string; description: string;
      serverId: string | null; unread: number; live: boolean; people: number;
    }[]>();
    for (const server of serverList) {
      const rows = await db.select().from(channels)
        .where(eq(channels.serverId, server.id))
        .orderBy(channels.position);
      for (const row of rows) {
        const list = groupMap.get(row.groupLabel) ?? [];
        const recipients = await channelRecipientIds(row.id);
        const presences = await Promise.all(recipients.map((id) => getPresence(id)));
        const people = presences.filter((p) => p === "online").length;
        list.push({
          id: row.id, name: row.name, type: row.type, description: row.description,
          serverId: row.serverId, unread: await getUnread(user.id, row.id),
          live: row.type === "voice" ? people > 0 : false, people,
        });
        groupMap.set(row.groupLabel, list);
      }
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
      dms.push({
        id: channel.id,
        peerId: peer.id,
        name: peer.username,
        status: peer.bot ? peer.status : await presenceFor(peer.id, peer.status),
        preview: last?.body ?? "Yeni sohbet",
        time: last ? formatTime(last.createdAt) : "Şimdi",
        unread: await getUnread(user.id, channel.id),
        ai: Boolean(peer.bot),
        group: false,
      });
    }

    const memberIds = new Set<string>([user.id]);
    const roleByUserId = new Map<string, string>();
    const roleRank: Record<string, number> = { owner: 4, admin: 3, moderator: 2, member: 1 };
    const roleLabel: Record<string, string> = { owner: "Sahip", admin: "Admin", moderator: "Moderatör", member: "Üye" };
    for (const server of serverList) {
      if (server.ownerId === user.id) roleByUserId.set(user.id, "owner");
      const rows = await db.select({ userId: serverMembers.userId, role: serverMembers.role })
        .from(serverMembers).where(eq(serverMembers.serverId, server.id));
      rows.forEach((row) => {
        memberIds.add(row.userId);
        const prev = roleByUserId.get(row.userId);
        if (!prev || (roleRank[row.role] ?? 0) > (roleRank[prev] ?? 0)) roleByUserId.set(row.userId, row.role);
      });
    }
    const bots = await db.select({ id: users.id }).from(users).where(eq(users.bot, 1));
    bots.forEach((row) => memberIds.add(row.id));
    const memberRows = memberIds.size
      ? await db.select().from(users).where(inArray(users.id, [...memberIds]))
      : [];
    const members = await Promise.all(memberRows.map(async (row) => {
      const status = row.bot ? row.status : await presenceFor(row.id, row.status);
      const role = row.bot ? "AI" : (roleByUserId.get(row.id) ? (roleLabel[roleByUserId.get(row.id)!] ?? roleByUserId.get(row.id)!) : (status === "offline" ? "Çevrimdışı" : "Üye"));
      return {
        id: row.id,
        name: row.username,
        status: status as "online" | "idle" | "dnd" | "offline",
        activity: row.activity || undefined,
        color: row.avatarColor,
        role,
        bot: Boolean(row.bot),
        badges: userBadges(row.createdAt, row.username, row.tag),
      };
    }));

    const requestRows = await db.select({ friend: friends, user: users })
      .from(friends)
      .innerJoin(users, eq(users.id, friends.requesterId))
      .where(and(eq(friends.addresseeId, user.id), eq(friends.status, "pending")));
    const friendRequests = await Promise.all(requestRows.map(async ({ friend, user: peer }) => {
      const mutual = await mutualServerCount(user.id, peer.id);
      const [outgoing] = await db.select({ id: friends.id }).from(friends)
        .where(and(eq(friends.requesterId, user.id), eq(friends.addresseeId, peer.id)))
        .limit(1);
      return {
        id: friend.id,
        name: `${peer.username}#${peer.tag}`,
        source: outgoing ? "Karşılıklı istek" : "Arkadaş isteği",
        mutual: mutual > 0 ? `${mutual} ortak sunucu` : "Ortak sunucu yok",
        time: relativeTime(friend.createdAt),
      };
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
      displayName: z.string().trim().min(1).max(50).optional(),
      title: z.string().max(60).optional(),
      customStatus: z.string().max(120).optional(),
      bio: z.string().max(190).optional(),
      color: z.string().max(32).optional(),
      avatarUrl: mediaUrl(2_000_000),
      bannerUrl: mediaUrl(3_000_000),
      activity: z.string().max(120).optional(),
      status: z.enum(["online", "idle", "dnd", "offline"]).optional(),
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) {
      const [taken] = await db.select({ id: users.id }).from(users)
        .where(and(sql`lower(${users.username}) = ${parsed.data.name.toLowerCase()}`, ne(users.id, user.id)))
        .limit(1);
      if (taken) return reply.code(409).send({ error: "username_taken" });
      patch.username = parsed.data.name;
    }
    if (parsed.data.displayName !== undefined) patch.displayName = parsed.data.displayName;
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.customStatus !== undefined) patch.customStatus = parsed.data.customStatus;
    if (parsed.data.bio !== undefined) patch.bio = parsed.data.bio;
    if (parsed.data.color !== undefined) patch.avatarColor = parsed.data.color;
    if (parsed.data.avatarUrl !== undefined) patch.avatarUrl = parsed.data.avatarUrl ?? "";
    if (parsed.data.bannerUrl !== undefined) patch.bannerUrl = parsed.data.bannerUrl ?? "";
    if (parsed.data.activity !== undefined) patch.activity = parsed.data.activity;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    try {
      const [updated] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
      return publicUser(updated);
    } catch (error) {
      if (parsed.data.name !== undefined && isUniqueViolation(error)) {
        return reply.code(409).send({ error: "username_taken" });
      }
      throw error;
    }
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
    const [peer] = await db.select().from(users)
      .where(sql`lower(${users.username}) = ${parsed.data.username.toLowerCase()}`).limit(1);
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
    const list = await mapMessages(id, user.id);
    await clearUnread(user.id, id);
    return list;
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
      attachments: attachmentsSchema.optional(),
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    await db.insert(messages).values({
      channelId: id,
      authorId: user.id,
      body: parsed.data.body,
      audioUrl: parsed.data.audioUrl ?? null,
      duration: parsed.data.duration ?? null,
      attachments: parsed.data.attachments ?? [],
    });
    const list = await mapMessages(id, user.id);
    const message = list[list.length - 1];
    if (message) emitMessage(id, message, user.id);
    await incrementUnreadForMessage(id, user.id);
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
    const stateKey = `reaction:${id}:${user.id}`;
    const previous = await redis.get(stateKey);
    const reactions = ((row.reactions ?? []) as { emoji: string; count: number }[]).map((r) => ({ ...r }));

    if (previous) {
      const prev = reactions.find((item) => item.emoji === previous);
      if (prev) {
        prev.count = Math.max(0, prev.count - 1);
        if (prev.count === 0) reactions.splice(reactions.indexOf(prev), 1);
      }
    }

    if (previous === parsed.data.emoji) {
      await redis.del(stateKey);
    } else {
      const next = reactions.find((item) => item.emoji === parsed.data.emoji);
      if (next) next.count += 1;
      else reactions.push({ emoji: parsed.data.emoji, count: 1 });
      await redis.set(stateKey, parsed.data.emoji);
    }

    await db.update(messages).set({ reactions }).where(eq(messages.id, id));
    emitReaction(row.channelId, id, reactions);
    return { reactions };
  });

  app.post("/friends/request", async (request, reply) => {
    const user = await requireAuth(request);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const parsed = z.object({ username: z.string().min(3).max(32) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const [peer] = await db.select().from(users)
      .where(sql`lower(${users.username}) = ${parsed.data.username.toLowerCase()}`).limit(1);
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
