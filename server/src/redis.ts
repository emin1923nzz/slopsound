import Redis from "ioredis";
import { env } from "./env.js";

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });

export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
