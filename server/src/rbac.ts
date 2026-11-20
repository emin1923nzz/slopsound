import { and, eq } from "drizzle-orm";
import { db } from "./db.js";
import { serverMembers, servers } from "./schema.js";

export type Role = "owner" | "admin" | "moderator" | "member";

const rank: Record<Role, number> = { owner: 4, admin: 3, moderator: 2, member: 1 };

export function hasRole(actual: Role, required: Role) {
  return rank[actual] >= rank[required];
}

export async function getMemberRole(userId: string, serverId: string): Promise<Role | null> {
  const [server] = await db.select({ ownerId: servers.ownerId }).from(servers).where(eq(servers.id, serverId)).limit(1);
  if (!server) return null;
  if (server.ownerId === userId) return "owner";
  const [member] = await db.select({ role: serverMembers.role }).from(serverMembers)
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
    .limit(1);
  return (member?.role as Role | undefined) ?? null;
}

export async function requireRole(userId: string, serverId: string, required: Role) {
  const role = await getMemberRole(userId, serverId);
  return role !== null && hasRole(role, required) ? role : null;
}
