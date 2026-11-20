import { db } from "./db.js";
import { auditLogs } from "./schema.js";

export async function writeAudit(input: {
  serverId?: string | null;
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    serverId: input.serverId ?? null,
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
}
