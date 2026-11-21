import { AccessToken, VideoGrant } from "livekit-server-sdk";
import { and, eq } from "drizzle-orm";
import { env } from "./env.js";
import { db } from "./db.js";
import { channelMembers, channels, servers, users } from "./schema.js";
import { requireRole } from "./rbac.js";

export async function canAccessChannel(userId: string, channelId: string) {
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!channel) return null;
  if (channel.type === "dm" || channel.type === "group") {
    const [member] = await db.select().from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
      .limit(1);
    return member ? channel : null;
  }
  if (!channel.serverId) return null;
  const [server] = await db.select().from(servers).where(eq(servers.id, channel.serverId)).limit(1);
  if (!server) return null;
  if (server.ownerId === userId) return channel;
  const role = await requireRole(userId, channel.serverId, "member");
  return role ? channel : null;
}

export async function createVoiceToken(userId: string, channelId: string) {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    throw new Error("LiveKit sunucusu yapılandırılmadı");
  }
  const channel = await canAccessChannel(userId, channelId);
  if (!channel) throw new Error("Bu kanala erişim yok");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: userId,
    name: user?.username ?? userId,
    metadata: JSON.stringify({ avatarColor: user?.avatarColor ?? "#8B6CFF", activity: user?.activity ?? "" }),
    ttl: "2h",
  });
  const grant: VideoGrant = {
    room: `slopsound-${channelId}`,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };
  token.addGrant(grant);
  return { url: env.LIVEKIT_URL, token: await token.toJwt(), room: grant.room };
}
