import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, desc, eq } from "drizzle-orm";
import { cookieSameSite, corsOrigins, env } from "./env.js";
import { db } from "./db.js";
import { auditLogs, invites, reports, serverMembers, servers, users } from "./schema.js";
import { rateLimit as checkRateLimit } from "./redis.js";
import { requireRole } from "./rbac.js";
import { writeAudit } from "./audit.js";
import { registerRoutes } from "./routes.js";
import { googleComplete, googleStart } from "./google.js";
import {
  SESSION_COOKIE,
  createSession,
  destroyAllSessions,
  destroySession,
  destroySessionById,
  getSessionUser,
  hashPassword,
  hashToken,
  listSessions,
  tokenFromRequest,
  verifyPassword,
} from "./auth.js";

const registerSchema = z.object({
  email: z.email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

const uuid = z.string().uuid();
const roleSchema = z.enum(["admin", "moderator", "member"]);
const reportStatusSchema = z.enum(["open", "reviewing", "resolved", "dismissed"]);

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: cookieSameSite,
    path: "/",
    expires,
  };
}

export function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true });

  void app.register(cors, { origin: corsOrigins, credentials: true });
  void app.register(cookie);
  void app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  app.get("/health", async () => ({ ok: true }));

  app.post("/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const passwordHash = await hashPassword(parsed.data.password);
    const [user] = await db.insert(users).values({
      email: parsed.data.email,
      username: parsed.data.username,
      passwordHash,
    }).returning({ id: users.id });
    const session = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    return { ok: true };
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    const session = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    return { ok: true };
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = tokenFromRequest(request);
    if (token) await destroySession(token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", async (request, reply) => {
    const user = await getSessionUser(tokenFromRequest(request));
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    return user;
  });

  app.get("/auth/google/start", async (request, reply) => {
    const query = request.query as { mode?: string };
    const mode = query.mode === "web" ? "web" : "desktop";
    try {
      return await googleStart(mode);
    } catch (error) {
      return reply.code(503).send({ error: error instanceof Error ? error.message : "google_unavailable" });
    }
  });

  app.post("/auth/google/callback", async (request, reply) => {
    const parsed = z.object({ code: z.string().min(1), state: z.string().min(1) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    try {
      const { user, session } = await googleComplete(parsed.data.code, parsed.data.state);
      reply.setCookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
      return { ok: true, user };
    } catch (error) {
      return reply.code(401).send({ error: error instanceof Error ? error.message : "google_login_failed" });
    }
  });

  app.get("/auth/google/return", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    if (query.error || !query.code || !query.state) {
      return reply.redirect(`${env.OAUTH_REDIRECT_TO}/?oauth=error`);
    }
    try {
      const { session } = await googleComplete(query.code, query.state);
      reply.setCookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
      return reply.redirect(`${env.OAUTH_REDIRECT_TO}/?oauth=done`);
    } catch {
      return reply.redirect(`${env.OAUTH_REDIRECT_TO}/?oauth=error`);
    }
  });

  app.get("/auth/sessions", async (request, reply) => {
    const user = await getSessionUser(tokenFromRequest(request));
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    return listSessions(user.id);
  });

  app.delete("/auth/sessions/:id", async (request, reply) => {
    const user = await getSessionUser(tokenFromRequest(request));
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = request.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid_id" });
    const removed = await destroySessionById(user.id, id);
    if (!removed) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.delete("/auth/sessions", async (request, reply) => {
    const user = await getSessionUser(tokenFromRequest(request));
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const token = tokenFromRequest(request);
    const count = await destroyAllSessions(user.id, token ? hashToken(token) : undefined);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true, removed: count };
  });

  app.post("/servers", async (request, reply) => {
    const user = await getSessionUser(tokenFromRequest(request));
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const parsed = z.object({ name: z.string().min(2).max(64) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const [server] = await db.insert(servers).values({ name: parsed.data.name, ownerId: user.id }).returning();
    await db.insert(serverMembers).values({ serverId: server.id, userId: user.id, role: "owner" });
    await writeAudit({ serverId: server.id, actorId: user.id, action: "server.create", targetType: "server", targetId: server.id });
    return reply.code(201).send(server);
  });

  app.post("/servers/:id/invites", async (request, reply) => {
    const user = await getSessionUser(tokenFromRequest(request));
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = request.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid_id" });
    if (!(await requireRole(user.id, id, "admin"))) return reply.code(403).send({ error: "forbidden" });
    const limit = await checkRateLimit(`invite:create:${user.id}`, 10, 3600);
    if (!limit.allowed) return reply.code(429).send({ error: "invite_limit" });
    const parsed = z.object({
      maxUses: z.number().int().min(1).max(100).default(10),
      ttlHours: z.number().int().min(1).max(168).default(24),
    }).safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const [invite] = await db.insert(invites).values({
      serverId: id,
      code: nanoid(10),
      createdBy: user.id,
      expiresAt: new Date(Date.now() + parsed.data.ttlHours * 3600_000),
      maxUses: parsed.data.maxUses,
    }).returning();
    await writeAudit({ serverId: id, actorId: user.id, action: "invite.create", targetType: "invite", targetId: invite.id, metadata: { maxUses: invite.maxUses } });
    return reply.code(201).send(invite);
  });

  app.post("/invites/:code/join", async (request, reply) => {
    const user = await getSessionUser(tokenFromRequest(request));
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { code } = request.params as { code: string };
    const [invite] = await db.select().from(invites).where(eq(invites.code, code)).limit(1);
    if (!invite || invite.expiresAt < new Date() || invite.uses >= invite.maxUses) {
      return reply.code(410).send({ error: "invite_expired" });
    }
    await db.insert(serverMembers).values({ serverId: invite.serverId, userId: user.id, role: "member" })
      .onConflictDoNothing();
    await db.update(invites).set({ uses: invite.uses + 1 }).where(eq(invites.id, invite.id));
    await writeAudit({ serverId: invite.serverId, actorId: user.id, action: "invite.join", targetType: "invite", targetId: invite.id });
    return { ok: true, serverId: invite.serverId };
  });

  app.patch("/servers/:id/members/:userId/role", async (request, reply) => {
    const user = await getSessionUser(tokenFromRequest(request));
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id, userId } = request.params as { id: string; userId: string };
    if (!uuid.safeParse(id).success || !uuid.safeParse(userId).success) return reply.code(400).send({ error: "invalid_id" });
    if (!(await requireRole(user.id, id, "admin"))) return reply.code(403).send({ error: "forbidden" });
    const parsed = roleSchema.safeParse((request.body as { role?: string } | undefined)?.role);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const [updated] = await db.update(serverMembers).set({ role: parsed.data })
      .where(and(eq(serverMembers.serverId, id), eq(serverMembers.userId, userId)))
      .returning();
    if (!updated) return reply.code(404).send({ error: "not_found" });
    await writeAudit({ serverId: id, actorId: user.id, action: "member.role", targetType: "user", targetId: userId, metadata: { role: parsed.data } });
    return updated;
  });

  app.post("/reports", async (request, reply) => {
    const user = await getSessionUser(tokenFromRequest(request));
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const parsed = z.object({
      reportedUserId: uuid.optional(),
      messageId: uuid.optional(),
      serverId: uuid.optional(),
      reason: z.string().min(5).max(500),
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const [report] = await db.insert(reports).values({
      reporterId: user.id,
      reportedUserId: parsed.data.reportedUserId ?? null,
      messageId: parsed.data.messageId ?? null,
      serverId: parsed.data.serverId ?? null,
      reason: parsed.data.reason,
    }).returning();
    if (parsed.data.serverId) {
      await writeAudit({ serverId: parsed.data.serverId, actorId: user.id, action: "report.create", targetType: "report", targetId: report.id });
    }
    return reply.code(201).send(report);
  });

  app.get("/servers/:id/reports", async (request, reply) => {
    const user = await getSessionUser(tokenFromRequest(request));
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = request.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid_id" });
    if (!(await requireRole(user.id, id, "moderator"))) return reply.code(403).send({ error: "forbidden" });
    return db.select().from(reports).where(eq(reports.serverId, id)).orderBy(desc(reports.createdAt)).limit(200);
  });

  app.patch("/reports/:id", async (request, reply) => {
    const user = await getSessionUser(tokenFromRequest(request));
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = request.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid_id" });
    const parsed = reportStatusSchema.safeParse((request.body as { status?: string } | undefined)?.status);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
    const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!report) return reply.code(404).send({ error: "not_found" });
    if (!report.serverId || !(await requireRole(user.id, report.serverId, "moderator"))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const [updated] = await db.update(reports).set({
      status: parsed.data,
      resolvedBy: user.id,
      resolvedAt: new Date(),
    }).where(eq(reports.id, id)).returning();
    await writeAudit({ serverId: report.serverId, actorId: user.id, action: "report.resolve", targetType: "report", targetId: id, metadata: { status: parsed.data } });
    return updated;
  });

  app.get("/servers/:id/audit", async (request, reply) => {
    const user = await getSessionUser(tokenFromRequest(request));
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = request.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid_id" });
    if (!(await requireRole(user.id, id, "admin"))) return reply.code(403).send({ error: "forbidden" });
    return db.select().from(auditLogs).where(eq(auditLogs.serverId, id)).orderBy(desc(auditLogs.createdAt)).limit(200);
  });

  let updateManifest: { value: unknown; cachedAt: number } | null = null;

  app.get("/updates/:target/:arch/:current_version", async (_request, reply) => {
    try {
      if (!updateManifest || Date.now() - updateManifest.cachedAt > 5 * 60 * 1000) {
        const response = await fetch(env.UPDATE_MANIFEST_URL, {
          headers: { "user-agent": "slopsound-updater" },
        });
        if (!response.ok) return reply.code(204).send();
        updateManifest = { value: await response.json(), cachedAt: Date.now() };
      }
      return reply.type("application/json").send(updateManifest.value);
    } catch {
      return reply.code(204).send();
    }
  });

  registerRoutes(app);

  return app;
}
