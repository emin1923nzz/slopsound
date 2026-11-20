import bcrypt from "bcryptjs";
import { db } from "./db.js";
import {
  channelMembers, channels, friends, messages, serverMembers, servers, users,
} from "./schema.js";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const CHANNEL_IDS = {
  genel: "22222222-2222-4222-8222-222222222221",
  duyurular: "22222222-2222-4222-8222-222222222222",
  sohbet: "22222222-2222-4222-8222-222222222223",
  kod: "22222222-2222-4222-8222-222222222224",
  tasarim: "22222222-2222-4222-8222-222222222225",
  lobi: "22222222-2222-4222-8222-222222222226",
  oyun: "22222222-2222-4222-8222-222222222227",
  calisma: "22222222-2222-4222-8222-222222222228",
  kurallar: "22222222-2222-4222-8222-222222222229",
  destek: "22222222-2222-4222-8222-22222222222a",
};

const yearsAgo = (years: number) => new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000);

const people = [
  { username: "senin_adin", tag: "0420", color: "#8B6CFF", activity: "Şu anda SlopSound tasarlıyor", status: "online", bot: 0, createdAt: yearsAgo(5) },
  { username: "w3wasem1", tag: "0001", color: "#C9F25B", activity: "SlopSound'u kurdu", status: "online", bot: 0, createdAt: yearsAgo(5) },
  { username: "deniz", tag: "7788", color: "#C9F25B", activity: "Yayında", status: "online", bot: 0, createdAt: yearsAgo(3) },
  { username: "elif", tag: "2210", color: "#8B6CFF", activity: "VS Code'da", status: "online", bot: 0, createdAt: yearsAgo(2) },
  { username: "ahmet", tag: "4412", color: "#FF7460", activity: "Valorant oynuyor", status: "online", bot: 0, createdAt: yearsAgo(1) },
  { username: "mehmet", tag: "8821", color: "#4AD6EB", activity: "Birazdan dönerim", status: "idle", bot: 0, createdAt: yearsAgo(0.5) },
  { username: "yagmur", tag: "1190", color: "#FFBA4A", activity: "Müzik dinliyor", status: "online", bot: 0, createdAt: yearsAgo(4) },
  { username: "zeynep", tag: "6634", color: "#8B6CFF", activity: "2 saat önce", status: "offline", bot: 0, createdAt: yearsAgo(0.2) },
  { username: "kerem", tag: "9901", color: "#8B6CFF", activity: "Dün", status: "offline", bot: 0, createdAt: yearsAgo(0.1) },
  { username: "Sunlop", tag: "0002", color: "#8B6CFF", activity: "Sana yardım ediyor", status: "online", bot: 1, createdAt: yearsAgo(5) },
];

const channelSeed = [
  { id: CHANNEL_IDS.genel, name: "genel", type: "text", description: "Genel sohbet • herkes burada", group: "Akış", position: 1 },
  { id: CHANNEL_IDS.duyurular, name: "duyurular", type: "announcement", description: "Yeni şeyler olduğunda buraya yazıyoruz", group: "Akış", position: 2 },
  { id: CHANNEL_IDS.sohbet, name: "sohbet", type: "text", description: "Aklına ne gelirse", group: "Akış", position: 3 },
  { id: CHANNEL_IDS.kod, name: "kod-paylaşım", type: "text", description: "Kodunu at, birlikte bakalım", group: "Üretim", position: 4 },
  { id: CHANNEL_IDS.tasarim, name: "tasarım", type: "text", description: "Fikirler, eskizler, renkler", group: "Üretim", position: 5 },
  { id: CHANNEL_IDS.lobi, name: "Lobi", type: "voice", description: "Açık kanal • gel, takıl", group: "Ses Odaları", position: 6 },
  { id: CHANNEL_IDS.oyun, name: "Oyun Odası", type: "voice", description: "Valorant gecesi", group: "Ses Odaları", position: 7 },
  { id: CHANNEL_IDS.calisma, name: "Çalışma Odası", type: "voice", description: "Sessiz çalışma", group: "Ses Odaları", position: 8 },
  { id: CHANNEL_IDS.kurallar, name: "kurallar", type: "text", description: "Önce bunları oku", group: "Bilgi", position: 9 },
  { id: CHANNEL_IDS.destek, name: "destek", type: "text", description: "Yardım lazım mı?", group: "Bilgi", position: 10 },
];

const messageSeed = [
  { id: "33333333-3333-4333-8333-333333333331", author: "deniz", text: "Herkes hoş geldi! Burası yeni SlopSound. Takılmaya bakalım.", reactions: [] },
  { id: "33333333-3333-4333-8333-333333333332", author: "elif", text: "Artık kendi tarzımız var. Kopya değil, direkt kendi şeymiz.", reactions: [{ emoji: "🔥", count: 6 }, { emoji: "💜", count: 3 }] },
  { id: "33333333-3333-4333-8333-333333333333", author: "ahmet", text: "AAA seviye. Katmanlı sunucular + DM + kartlı kanallar.", reactions: [] },
  { id: "33333333-3333-4333-8333-333333333334", author: "Sunlop", text: "Şimdi her şey yumuşak, köşe kalmadı. Bir şey istersen bana yaz, sol alttayım.", reactions: [] },
  { id: "33333333-3333-4333-8333-333333333335", author: "yagmur", text: "Ses odasına gelen var mı? Lobi'de 4 kişi var şu an.", reactions: [{ emoji: "🎧", count: 2 }] },
  { id: "33333333-3333-4333-8333-333333333336", author: "ahmet", text: "tasarım efsane olmuş", reactions: [] },
  { id: "33333333-3333-4333-8333-333333333337", author: "mehmet", text: "@Sunlop bugün ne yapıyoruz? Biraz ilham lazım.", reactions: [] },
  { id: "33333333-3333-4333-8333-333333333338", author: "Sunlop", text: "Bence önce ses odasında toplanalım, sonra tasarımı birlikte bitirelim. Ben buradayım.", reactions: [] },
  { id: "33333333-3333-4333-8333-333333333339", author: "deniz", text: "1. Saygılı ol. 2. Spam yok. 3. Eğlen. Hepsi bu.", reactions: [{ emoji: "✅", count: 9 }] },
];

async function main() {
  const passwordHash = await bcrypt.hash("slopsound123", 12);
  await db.insert(users).values(people.map((person) => ({
    id: crypto.randomUUID(),
    email: `${person.username.toLowerCase()}@slopsound.local`,
    username: person.username,
    passwordHash,
    avatarColor: person.color,
    tag: person.tag,
    activity: person.activity,
    status: person.status,
    bot: person.bot,
    customStatus: person.bot ? "Sana yardım ediyor" : "SlopSound tasarlıyor",
    bio: person.bot ? "SlopSound asistanı." : "SlopSound kullanıcısı.",
    createdAt: person.createdAt,
  }))).onConflictDoNothing({ target: users.email });

  const rows = await db.select().from(users);
  const byName = new Map(rows.map((row) => [row.username, row]));
  const me = byName.get("senin_adin");
  if (!me) throw new Error("Kullanıcılar eklenemedi");

  await db.insert(servers).values({
    id: SERVER_ID,
    name: "SlopSound HQ",
    color: "brand",
    ownerId: me.id,
  }).onConflictDoNothing();

  await db.insert(serverMembers).values(rows.map((row) => ({
    serverId: SERVER_ID,
    userId: row.id,
    role: row.username === "senin_adin" ? "owner" : row.bot ? "member" : "member",
  }))).onConflictDoNothing();

  await db.insert(channels).values(channelSeed.map((channel) => ({
    id: channel.id,
    serverId: SERVER_ID,
    name: channel.name,
    type: channel.type,
    description: channel.description,
    groupLabel: channel.group,
    position: channel.position,
  }))).onConflictDoNothing();

  await db.insert(messages).values(messageSeed.map((message, index) => ({
    id: message.id,
    channelId: CHANNEL_IDS.genel,
    authorId: byName.get(message.author)!.id,
    body: message.text,
    reactions: message.reactions,
    createdAt: new Date(Date.now() - (messageSeed.length - index) * 60_000),
  }))).onConflictDoNothing();

  const dmPeople = ["ahmet", "elif", "mehmet", "deniz", "Sunlop", "yagmur"];
  for (const [index, name] of dmPeople.entries()) {
    const peer = byName.get(name);
    if (!peer) continue;
    const channelId = `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`;
    await db.insert(channels).values({
      id: channelId,
      name: peer.username,
      type: "dm",
      description: "Direkt mesaj",
      groupLabel: "DM",
      position: index,
    }).onConflictDoNothing();
    await db.insert(channelMembers).values([
      { channelId, userId: me.id },
      { channelId, userId: peer.id },
    ]).onConflictDoNothing();
    await db.insert(friends).values({
      id: `55555555-5555-4555-8555-${String(index + 1).padStart(12, "0")}`,
      requesterId: me.id,
      addresseeId: peer.id,
      status: "accepted",
    }).onConflictDoNothing();
  }

  for (const [index, name] of ["mehmet", "yagmur", "deniz"].entries()) {
    const peer = byName.get(name);
    if (!peer) continue;
    await db.insert(friends).values({
      id: `66666666-6666-4666-8666-${String(index + 1).padStart(12, "0")}`,
      requesterId: peer.id,
      addresseeId: me.id,
      status: "pending",
    }).onConflictDoNothing();
  }

  console.log("SlopSound seed tamamlandı. Giriş: senin_adin / slopsound123");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
