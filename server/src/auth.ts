import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { and, desc, eq, gt } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { db } from "./db.js";
import { redis } from "./redis.js";
import { sessions, users } from "./schema.js";
import { userBadges, type BadgeId } from "./badges.js";

export const SESSION_COOKIE = "slopsound_session";
const SESSION_TTL = 60 * 60 * 24 * 7;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string | null) {
  return hash ? bcrypt.compare(password, hash) : false;
}

export async function createSession(userId: string) {
  const token = nanoid(48);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL * 1000);
  await db.insert(sessions).values({ userId, tokenHash, expiresAt });
  await redis.set(`session:${tokenHash}`, userId, "EX", 300);
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  const tokenHash = hashToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  await redis.del(`session:${tokenHash}`);
}

export async function listSessions(userId: string) {
  return db.select({
    id: sessions.id,
    createdAt: sessions.createdAt,
    expiresAt: sessions.expiresAt,
  }).from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt));
}

export async function destroySessionById(userId: string, sessionId: string) {
  const [row] = await db.select().from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  if (!row) return false;
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  await redis.del(`session:${row.tokenHash}`);
  return true;
}

export async function destroyAllSessions(userId: string, keepTokenHash?: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
  const targets = rows.filter((row) => row.tokenHash !== keepTokenHash);
  if (targets.length === 0) return 0;
  await db.delete(sessions).where(eq(sessions.userId, userId));
  if (keepTokenHash) {
    const keep = rows.find((row) => row.tokenHash === keepTokenHash);
    if (keep) await db.insert(sessions).values(keep);
  }
  await Promise.all(targets.map((row) => redis.del(`session:${row.tokenHash}`)));
  return targets.length;
}

export type SessionUser = {
  id: string;
  username: string;
  email: string;
  avatarColor: string;
  tag: string;
  title: string;
  customStatus: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  activity: string;
  status: string;
  bot: boolean;
  createdAt: string;
  badges: BadgeId[];
};

export function publicUser(user: {
  id: string; username: string; email: string; avatarColor: string;
  tag: string; title: string; customStatus: string; bio: string; avatarUrl: string;
  bannerUrl: string; activity: string; status: string; bot: number;
  createdAt: Date; googleSub?: string | null;
}): SessionUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarColor: user.avatarColor,
    tag: user.tag,
    title: user.title,
    customStatus: user.customStatus,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    activity: user.activity,
    status: user.status,
    bot: Boolean(user.bot),
    createdAt: user.createdAt.toISOString(),
    badges: userBadges(user.createdAt, user.username, user.tag),
  };
}

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const cached = await redis.get(`session:${tokenHash}`);
  if (cached) {
    const [user] = await db.select().from(users).where(eq(users.id, cached)).limit(1);
    if (user) return publicUser(user);
  }
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  await redis.set(`session:${tokenHash}`, row.user.id, "EX", 300);
  return publicUser(row.user);
}

export function tokenFromRequest(request: FastifyRequest) {
  return request.cookies[SESSION_COOKIE] ?? request.headers.authorization?.replace("Bearer ", "");
}
