import type { Server, Socket } from "socket.io";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db.js";
import { channelMembers, channels, users } from "./schema.js";
import { rateLimit, redis } from "./redis.js";

type CallUser = { id: string; username: string; avatarColor: string };
type Ack = { ok: boolean; error?: string };

const callIdSchema = z.object({ channelId: z.string().uuid() });
const inviteSchema = callIdSchema.extend({ mode: z.enum(["audio", "video"]) });
const signalSchema = callIdSchema.extend({ data: z.unknown().refine((value) => value !== undefined) });
const stateSchema = z.object({
  callerId: z.string().uuid(),
  calleeId: z.string().uuid(),
  mode: z.enum(["audio", "video"]),
  status: z.enum(["ringing", "active"]),
});

type CallState = z.infer<typeof stateSchema>;

function callKey(channelId: string) {
  return `call:${channelId}`;
}

async function readState(channelId: string): Promise<CallState | null> {
  const raw = await redis.get(callKey(channelId));
  if (!raw) return null;
  try {
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function otherId(state: CallState, userId: string) {
  return state.callerId === userId ? state.calleeId : state.callerId;
}

export function registerCallHandlers(io: Server, socket: Socket, user: CallUser) {
  const reply = (ack?: (result: Ack) => void, error?: string) => {
    ack?.(error ? { ok: false, error } : { ok: true });
  };

  socket.on("call:invite", async (payload: unknown, ack?: (result: Ack) => void) => {
    const parsed = inviteSchema.safeParse(payload);
    if (!parsed.success) return reply(ack, "invalid_payload");
    const { channelId, mode } = parsed.data;
    const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!channel || channel.type !== "dm") return reply(ack, "invalid_channel");
    const members = await db.select({ userId: channelMembers.userId })
      .from(channelMembers).where(eq(channelMembers.channelId, channelId));
    const calleeId = members.length === 2
      ? members.find((member) => member.userId !== user.id)?.userId
      : undefined;
    if (!calleeId || !members.some((member) => member.userId === user.id)) {
      return reply(ack, "forbidden");
    }
    const limited = await rateLimit(`call:invite:${user.id}`, 5, 60);
    if (!limited.allowed) return reply(ack, "rate_limited");

    const state: CallState = { callerId: user.id, calleeId, mode, status: "ringing" };
    const stored = await redis.set(callKey(channelId), JSON.stringify(state), "EX", 60, "NX");
    if (stored !== "OK") return reply(ack, "busy");

    const [callee] = await db.select({ id: users.id })
      .from(users).where(eq(users.id, calleeId)).limit(1);
    if (!callee) {
      await redis.del(callKey(channelId));
      return reply(ack, "user_not_found");
    }
    io.to(`user:${calleeId}`).emit("call:incoming", {
      channelId,
      from: { id: user.id, username: user.username, avatarColor: user.avatarColor },
      mode,
    });
    reply(ack);
  });

  socket.on("call:accept", async (payload: unknown, ack?: (result: Ack) => void) => {
    const parsed = callIdSchema.safeParse(payload);
    if (!parsed.success) return reply(ack, "invalid_payload");
    const { channelId } = parsed.data;
    const state = await readState(channelId);
    if (!state) return reply(ack, "no_call");
    if (state.calleeId !== user.id) return reply(ack, "forbidden");
    if (state.status !== "ringing") return reply(ack, "invalid_state");
    const active: CallState = { ...state, status: "active" };
    const stored = await redis.set(callKey(channelId), JSON.stringify(active), "EX", 4 * 3600, "XX");
    if (stored !== "OK") return reply(ack, "no_call");
    io.to(`user:${state.callerId}`).emit("call:accepted", { channelId, mode: state.mode });
    reply(ack);
  });

  socket.on("call:decline", async (payload: unknown, ack?: (result: Ack) => void) => {
    const parsed = callIdSchema.safeParse(payload);
    if (!parsed.success) return reply(ack, "invalid_payload");
    const { channelId } = parsed.data;
    const state = await readState(channelId);
    if (!state) return reply(ack, "no_call");
    if (state.calleeId !== user.id) return reply(ack, "forbidden");
    await redis.del(callKey(channelId));
    io.to(`user:${state.callerId}`).emit("call:declined", { channelId });
    reply(ack);
  });

  socket.on("call:cancel", async (payload: unknown, ack?: (result: Ack) => void) => {
    const parsed = callIdSchema.safeParse(payload);
    if (!parsed.success) return reply(ack, "invalid_payload");
    const { channelId } = parsed.data;
    const state = await readState(channelId);
    if (!state) return reply(ack, "no_call");
    if (state.callerId !== user.id) return reply(ack, "forbidden");
    if (state.status !== "ringing") return reply(ack, "invalid_state");
    await redis.del(callKey(channelId));
    io.to(`user:${state.calleeId}`).emit("call:cancelled", { channelId });
    reply(ack);
  });

  socket.on("call:signal", async (payload: unknown, ack?: (result: Ack) => void) => {
    const parsed = signalSchema.safeParse(payload);
    if (!parsed.success) return reply(ack, "invalid_payload");
    const { channelId, data } = parsed.data;
    const state = await readState(channelId);
    if (!state) return reply(ack, "no_call");
    if (state.status !== "active") return reply(ack, "invalid_state");
    if (state.callerId !== user.id && state.calleeId !== user.id) return reply(ack, "forbidden");
    io.to(`user:${otherId(state, user.id)}`).emit("call:signal", { channelId, from: user.id, data });
    reply(ack);
  });

  socket.on("call:end", async (payload: unknown, ack?: (result: Ack) => void) => {
    const parsed = callIdSchema.safeParse(payload);
    if (!parsed.success) return reply(ack, "invalid_payload");
    const { channelId } = parsed.data;
    const state = await readState(channelId);
    if (!state) return reply(ack, "no_call");
    if (state.callerId !== user.id && state.calleeId !== user.id) return reply(ack, "forbidden");
    await redis.del(callKey(channelId));
    io.to(`user:${otherId(state, user.id)}`).emit("call:ended", { channelId });
    reply(ack);
  });
}
