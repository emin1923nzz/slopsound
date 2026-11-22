import Redis from "ioredis";
import { env } from "./env.js";

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });

export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

export async function getPresence(userId: string) {
  return (await redis.get(`presence:${userId}`)) ?? "offline";
}

export async function setPresence(userId: string, status: string) {
  await redis.set(`presence:${userId}`, status, "EX", 120);
}

export async function getUnread(userId: string, channelId: string) {
  return Number((await redis.get(`unread:${userId}:${channelId}`)) ?? 0);
}

export async function clearUnread(userId: string, channelId: string) {
  await redis.del(`unread:${userId}:${channelId}`);
}

export async function incrementUnread(userId: string, channelId: string) {
  await redis.incr(`unread:${userId}:${channelId}`);
}
