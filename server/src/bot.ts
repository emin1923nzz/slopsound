import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { env } from "./env.js";
import { messages, users } from "./schema.js";
import { userBadges } from "./badges.js";

function formatTime(date: Date) {
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

function normalize(text: string) {
  return text.replace(/@sunlop/gi, "").trim().toLocaleLowerCase("tr-TR").replace(/[?.!]+$/, "").trim();
}

const answers = [
  {
    question: "Bugün ne yapalım?",
    answer: "Bugün önce birbirimizin mesajlarına bakalım, sonra ses odasında takılıp SlopSound için yeni bir fikir not edelim.",
  },
  {
    question: "Sunlop kim?",
    answer: "Sunlop benim: sol altta duran, mesajlarına cevap veren ve kanalını hatırlatan yapay zekâ asistanın.",
  },
  {
    question: "SlopSound'u anlat",
    answer: "SlopSound; kendi tasarımı, sunucuları, DM'leri, ses odaları ve Sloppi'si olan bağımsız bir sohbet platformu.",
  },
  {
    question: "Bana bir oyun öner",
    answer: "Blok savaşı oynayalım: haritayı birlikte inşa edip ses odasından takım komutları veririz. Ace of Spades ruhu iyi gider.",
  },
  {
    question: "SlopSound bağımsız mı?",
    answer: "Evet. Kendi tasarımımız, kimliğimiz ve asistanımız var; SlopSound kendi başına bir uygulama.",
  },
  {
    question: "Arkadaşımı nasıl eklerim?",
    answer: "Arkadaş Ekle ekranından kullanıcı adını arayıp istek gönder. DM açmak için davet linkini de paylaşabilirsin.",
  },
  {
    question: "Sloppi kim?",
    answer: "Sloppi mor, yuvarlak, neşeli maskotumuz. Sohbette kaybolursan tıkla, sana yol göstersin.",
  },
  {
    question: "Sunlop ne yapar?",
    answer: "Sorularını cevaplar, ayarları hatırlatır, kanal ve ses odası kurmana yardım eder. Kısacası buradaki AI arkadaşın.",
  },
];

const answersByQuestion = new Map(answers.map((item) => [normalize(item.question), item.answer]));

const SYSTEM_PROMPT = [
  "Sen SlopSound'un kendi asistanı Sloppi'sin. Sunlop olarak da hitap edilebilirsin.",
  "Kullanıcıya Türkçe, samimi, kısa ve doğal cevap ver.",
  "Kendini yapay zekâ, model veya robot olarak tanıtma; kısaltma ve jargon kullanma.",
  "Başka uygulamalarla kıyas yapma. SlopSound'u kendi tasarımı olan bağımsız bir sohbet uygulaması olarak anlat.",
  "Gereksiz başlık, madde listesi ve uzun açıklama kullanma. Genelde 1-3 cümle yeterli.",
].join(" ");

function fallbackAnswer(question?: string) {
  if (question) {
    const hit = answersByQuestion.get(normalize(question));
    if (hit) return hit;
  }
  return "Elimden geleni yaparım: ses odasına gir, sunucunu kur ya da arkadaşını davet et. Takıldığın yer olursa buradayım.";
}

async function groqChat(userId: string, system: string, input: string, maxTokens: number) {
  const [user] = await db.select({ groqApiKey: users.groqApiKey }).from(users).where(eq(users.id, userId)).limit(1);
  const apiKey = user?.groqApiKey || env.GROQ_API_KEY;
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: input },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function askGroq(userId: string, question: string) {
  const clean = question.trim().slice(0, 2000);
  if (!clean) return { answer: fallbackAnswer(), source: "fallback" as const };
  const answer = await groqChat(userId, SYSTEM_PROMPT, clean, 320);
  if (!answer) return { answer: fallbackAnswer(clean), source: "fallback" as const };
  return { answer: answer.slice(0, 1200), source: "groq" as const };
}

export async function translateText(userId: string, text: string, targetLanguage: string) {
  const clean = text.trim().slice(0, 4000);
  if (!clean) return { translation: "", source: "fallback" as const };
  const system = `Translate the user's message into ${targetLanguage}. Return only the translation, no explanation.`;
  const translation = await groqChat(userId, system, clean, 500);
  if (!translation) return { translation: clean, source: "fallback" as const };
  return { translation: translation.slice(0, 2000), source: "groq" as const };
}

async function ensureSunlopBot() {
  const [existing] = await db.select().from(users).where(eq(users.username, "Sunlop")).limit(1);
  if (existing) {
    if (!existing.bot) await db.update(users).set({ bot: 1 }).where(eq(users.id, existing.id));
    return { ...existing, bot: 1 };
  }
  const [created] = await db.insert(users).values({
    email: "sunlop@slopsound.local",
    username: "Sunlop",
    displayName: "Sunlop",
    passwordHash: null,
    avatarColor: "#8B6CFF",
    tag: "0000",
    title: "AI Arkadaş",
    customStatus: "Sorularını bekliyorum",
    bio: "SlopSound yapay zekâ asistanı.",
    status: "online",
    bot: 1,
  }).returning();
  return created;
}

export async function maybeSunlopReply(
  channelId: string,
  viewerId: string,
  body: string,
  emit: (channelId: string, message: unknown, authorId?: string) => void,
) {
  const mentioned = /@sunlop/i.test(body);
  const exact = answersByQuestion.get(normalize(body));
  if (!mentioned && !exact) return;
  const question = body.replace(/@sunlop/gi, "").trim() || body;
  const { answer } = await askGroq(viewerId, question);
  const bot = await ensureSunlopBot();
  const [row] = await db.insert(messages).values({ channelId, authorId: bot.id, body: answer }).returning();
  const [author] = await db.select().from(users).where(eq(users.id, bot.id)).limit(1);
  emit(channelId, {
    id: row.id,
    authorId: bot.id,
    author: author?.username ?? "Sunlop",
    color: author?.avatarColor ?? "#8B6CFF",
    time: formatTime(row.createdAt),
    text: row.body,
    mention: false,
    ai: true,
    badges: userBadges(row.createdAt, author?.username ?? "Sunlop", author?.tag),
    reactions: row.reactions,
    avatarUrl: author?.avatarUrl || undefined,
    attachments: row.attachments ?? [],
    own: author?.id === viewerId,
  }, bot.id);
}
