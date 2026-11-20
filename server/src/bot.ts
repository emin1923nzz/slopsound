import { and, eq } from "drizzle-orm";
import { db } from "./db.js";
import { messages, users } from "./schema.js";

function formatTime(date: Date) {
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export async function maybeSunlopReply(
  channelId: string,
  viewerId: string,
  body: string,
  emit: (channelId: string, message: unknown) => void,
) {
  if (!/@sunlop/i.test(body)) return;
  const [bot] = await db.select().from(users)
    .where(and(eq(users.username, "Sunlop"), eq(users.bot, 1)))
    .limit(1);
  if (!bot) return;
  const reply = /tasar|aaa|ui|görünüm/i.test(body)
    ? "Tasarım zaten UNSLOP: sade, hızlı ve kendi tarzımız var. Devam edelim mi?"
    : "Buradayım. İstersen kanalı, DM'i veya ses odasını birlikte kurabiliriz.";
  const [row] = await db.insert(messages).values({ channelId, authorId: bot.id, body: reply }).returning();
  const [author] = await db.select().from(users).where(eq(users.id, bot.id)).limit(1);
  emit(channelId, {
    id: row.id,
    author: author?.username ?? "Sunlop",
    color: author?.avatarColor ?? "#8B6CFF",
    time: formatTime(row.createdAt),
    text: row.body,
    mention: false,
    ai: true,
    reactions: row.reactions,
    own: author?.id === viewerId,
  });
}
