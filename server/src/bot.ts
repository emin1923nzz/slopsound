import { and, eq } from "drizzle-orm";
import { db } from "./db.js";
import { messages, users } from "./schema.js";
import { userBadges } from "./badges.js";

function formatTime(date: Date) {
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
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
    answer: "SlopSound; kendi tasarımı, sunucuları, DM'leri, ses odaları ve Sloppi'si olan bağımsız bir sohbet platformu. Discord'un kopyası değiliz.",
  },
  {
    question: "Bana bir oyun öner",
    answer: "Blok savaşı oynayalım: haritayı birlikte inşa edip ses odasından takım komutları veririz. Ace of Spades ruhu iyi gider.",
  },
  {
    question: "SlopSound Discord mu?",
    answer: "Hayır, Discord değiliz. Benzer şeyler yaparız ama tasarımımız, kimliğimiz ve asistanımız tamamen bize özel.",
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

function fallbackAnswer() {
  return `Şunları sorabilirsin: ${answers.map((item) => `"${item.question}"`).join(", ")}.`;
}

export async function maybeSunlopReply(
  channelId: string,
  viewerId: string,
  body: string,
  emit: (channelId: string, message: unknown) => void,
) {
  const mentioned = /@sunlop/i.test(body);
  const answer = answersByQuestion.get(normalize(body))
    ?? (mentioned && /tasar|aaa|ui|görünüm/i.test(body)
      ? "Tasarım zaten UNSLOP: sade, hızlı ve kendi tarzımız var. Devam edelim mi?"
      : mentioned ? fallbackAnswer() : undefined);
  if (!answer) return;
  const [bot] = await db.select().from(users)
    .where(and(eq(users.username, "Sunlop"), eq(users.bot, 1)))
    .limit(1);
  if (!bot) return;
  const [row] = await db.insert(messages).values({ channelId, authorId: bot.id, body: answer }).returning();
  const [author] = await db.select().from(users).where(eq(users.id, bot.id)).limit(1);
  emit(channelId, {
    id: row.id,
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
  });
}
