import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, UserPlus, Link2, Ticket, Inbox, Copy, RefreshCw, Share2, Check, X, QrCode, Clipboard, Camera, Users } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { useAudio } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { Badge, Button, Input, SectionTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "./ui";
import { SlopAvatar } from "./SlopAvatar";

const tabs = [
  { value: "Ad ile Ekle", icon: UserPlus },
  { value: "Davet ile Katıl", icon: Link2 },
  { value: "Davet Oluştur", icon: Ticket },
  { value: "Gelen İstekler", icon: Inbox },
];

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("glass rounded-panel p-6", className)}>{children}</div>;
}

function AddByName() {
  const [name, setName] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const sendFriendRequest = useApp((s) => s.sendFriendRequest);
  const members = useApp((s) => s.members);
  const profile = useApp((s) => s.profile);
  const suggestions = members.filter((m) => !m.bot && m.name !== profile.name).slice(0, 3).map((m) => m.name);
  async function submit() {
    if (!name.trim()) return toast.error("Önce bir isim yaz.");
    if (/senin_adin/i.test(name)) return toast.error("Kendini ekleyemezsin.");
    await sendFriendRequest(name.trim().split("#")[0]);
    const error = useApp.getState().error;
    if (error) return toast.error(error);
    setSent((s) => [...s, name.trim()]);
    toast.success(`${name.trim()} bulundu. İstek gönderildi.`);
    setName("");
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_.85fr]">
      <Card>
        <h2 className="font-display text-[17px] font-extrabold">Kullanıcı Adı ile Ekle</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">Arkadaşının SlopSound adını yaz. Büyük küçük harf önemli değil. Örnek: ahmet#1234 veya sadece ahmet.</p>
        <div className="mt-5 flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="örn: ahmet#1234" />
          <Button onClick={submit}>İstek Gönder →</Button>
        </div>
        <p className="mt-2 text-[10.5px] text-muted">İpucu: # koymazsan da buluruz. Yanlış yazarsan benzer isimleri öneririz.</p>
        <div className="my-6 flex items-center gap-3"><div className="h-px flex-1 bg-white/10" /><span className="text-[10px] font-bold text-muted">BELKİ TANIYORSUNDUR</span><div className="h-px flex-1 bg-white/10" /></div>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => { setName(s); toast(`${s} seçildi`); }} className="rounded-full border border-white/[.08] bg-white/[.04] px-3 py-2 text-[11px] font-bold text-muted transition hover:border-brand/50 hover:text-paper">{s}</button>
          ))}
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <SectionTitle>Nasıl çalışır?</SectionTitle>
          <ol className="mt-4 space-y-3 text-[11.5px] text-muted">
            <li className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/20 text-[10px] font-black text-brand">1</span>Adı yazıp istek gönder</li>
            <li className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/20 text-[10px] font-black text-brand">2</span>Karşı taraf kabul ederse</li>
            <li className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/20 text-[10px] font-black text-brand">3</span>DM listene düşer, yazışmaya başlarsın</li>
          </ol>
        </Card>
        <Card>
          <SectionTitle>Gönderdiğin istekler ({sent.length})</SectionTitle>
          <div className="mt-4 space-y-2">
            {sent.length === 0 ? (
              <p className="text-[11px] text-muted">Henüz istek göndermedin.</p>
            ) : sent.map((name) => (
              <div key={name} className="flex items-center gap-2 rounded-card bg-white/[.04] px-3 py-2.5">
                <span className="h-2 w-2 rounded-full bg-warn" /><div className="flex-1"><p className="text-[11.5px] font-bold">{name}</p><p className="text-[10px] text-muted">Bekliyor • Az önce gönderdin</p></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function JoinByInvite() {
  const [link, setLink] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", "", "", ""]);
  const joinInvite = useApp((s) => s.joinInvite);
  async function joinCode(raw: string) {
    const value = raw.trim();
    if (!value) return toast.error("Önce link veya kod yapıştır.");
    const extracted = value.includes("/") ? value.split("/").filter(Boolean).pop() ?? "" : value;
    try {
      await joinInvite(extracted);
      toast.success("Davete katıldın.");
    } catch { /* hata store'da */ }
  }
  function setChar(i: number, value: string) {
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-1);
    const next = [...code]; next[i] = char; setCode(next);
    if (char && i < 7) document.getElementById(`code-${i + 1}`)?.focus();
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_.85fr]">
      <Card>
        <h2 className="font-display text-[17px] font-extrabold">Davet Linki ile Katıl</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">Arkadaşın sana link attıysa buraya yapıştır. Link 7 gün geçerli.</p>
        <div className="mt-5 flex gap-2"><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://slopsound.gg/xxxxxx veya SLOP-XXXX" /><Button onClick={() => void joinCode(link)}>Katıl →</Button></div>
        <p className="mt-2 text-[10.5px] text-muted">Link şöyle görünür: slopsound.gg/SLOP-8K2M9Q • Kod tek başına da olur.</p>
        <div className="my-6 flex items-center gap-3"><div className="h-px flex-1 bg-white/10" /><span className="text-[10px] font-bold text-muted">VEYA</span><div className="h-px flex-1 bg-white/10" /></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setLink("https://slopsound.gg/SLOP-8K2M9Q"); toast("Örnek link yapıştırıldı"); }}><Clipboard size={14} /> Örnek Linki Yapıştır</Button>
          <Button variant="outline" onClick={() => toast("Karekod okuyucu yakında")}><QrCode size={14} /> Karekod Oku</Button>
          <Button variant="outline" onClick={async () => {
            const ok = await useAudio.getState().startCamera();
            toast[ok ? "success" : "error"](ok ? "Kamera açıldı — ayarlardan önizleyebilirsin" : "Kamera izni alınamadı");
          }}><Camera size={14} /> Kamerayı Test Et</Button>
        </div>
      </Card>
      <Card>
        <SectionTitle>Davet kodu ile katıl</SectionTitle>
        <p className="mt-1.5 text-[11px] text-muted">Sadece 8 karakterlik kodu biliyorsan yeterli. Büyük harfle yaz.</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {code.map((char, i) => (
            <input
              key={i} id={`code-${i}`} value={char} maxLength={1}
              onChange={(e) => setChar(i, e.target.value)}
              className="h-11 w-9 rounded-xl border border-white/10 bg-black/30 text-center font-display text-[16px] font-black uppercase outline-none focus:border-brand/60"
            />
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={() => void joinCode(code.join(""))}>Kod ile Katıl</Button>
      </Card>
    </div>
  );
}

function CreateInvite() {
  const [code, setCode] = useState("");
  const [autoAccept, setAutoAccept] = useState(true);
  const [expire, setExpire] = useState(false);
  const createInvite = useApp((s) => s.createInvite);
  const activeServer = useApp((s) => s.activeServer);
  const link = code ? `https://slopsound.gg/${code}` : "Sunucu seçildikten sonra davet oluştur";
  useEffect(() => { if (activeServer && !code) void regenerate(); }, [activeServer]);
  async function regenerate() {
    if (!activeServer) return toast.error("Önce bir sunucu seç.");
    const next = await createInvite();
    if (next) { setCode(next); toast.success("Yeni davet kodu üretildi"); }
    else toast.error(useApp.getState().error ?? "Davet oluşturulamadı");
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_.85fr]">
      <Card>
        <h2 className="font-display text-[17px] font-extrabold">Kendi Davetini Oluştur</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">Bu linki arkadaşına at, linke tıklayan direkt sana istek atmış olur. Sen kabul edince arkadaş olursunuz.</p>
        <div className="mt-5 rounded-card border border-dashed border-brand/30 bg-brand/[.05] p-5">
          <SectionTitle>Senin davet linkin</SectionTitle>
          <p className="mt-2 break-all font-display text-[15px] font-extrabold text-brand">{link}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { navigator.clipboard?.writeText(link); toast.success("Link kopyalandı"); }}><Copy size={13} /> Linki Kopyala</Button>
            <Button size="sm" variant="outline" onClick={regenerate}><RefreshCw size={13} /> Yeni Kod Üret</Button>
            <Button size="sm" variant="outline" onClick={() => toast("Paylaşım menüsü açıldı")}><Share2 size={13} /> Paylaş</Button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4 rounded-card bg-white/[.04] p-4">
          <div className="grid grid-cols-5 gap-1">
            {Array.from({ length: 25 }, (_, i) => <span key={i} className={cn("h-2.5 w-2.5 rounded-[2px]", (i * 7 + code.length) % 3 === 0 ? "bg-brand" : "bg-white/15")} />)}
          </div>
          <div><p className="text-[11px] font-bold">Karekod</p><p className="text-[10px] text-muted">Geçerlilik: 7 gün • Tek kullanımlık değil</p></div>
        </div>
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 text-[11.5px] text-muted"><input type="checkbox" checked={autoAccept} onChange={(e) => setAutoAccept(e.target.checked)} className="accent-[hsl(var(--brand))]" /> Linke tıklayan direkt istek atsın</label>
          <label className="flex items-center gap-3 text-[11.5px] text-muted"><input type="checkbox" checked={expire} onChange={(e) => setExpire(e.target.checked)} className="accent-[hsl(var(--brand))]" /> 24 saatte bitsin</label>
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <SectionTitle>Hızlı paylaş</SectionTitle>
          <p className="mt-1.5 text-[11px] text-muted">Linki kopyalamadan direkt paylaş.</p>
          <div className="mt-4 space-y-2">
            {["WhatsApp'a At", "Discord'a At", "Karekod Olarak Kaydet"].map((label) => (
              <button key={label} onClick={() => toast.success(`${label} • prototip`)} className="flex w-full items-center justify-between rounded-card bg-white/[.04] px-3 py-2.5 text-[11.5px] font-bold transition hover:bg-white/[.08]">{label}<Chevron /></button>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle>Bu linkle gelenler</SectionTitle>
          <div className="mt-4 grid place-items-center py-6 text-center"><Users size={26} className="text-muted/40" /><p className="mt-2 text-[11px] font-bold text-muted">Henüz kimse yok</p><p className="text-[10px] text-muted/70">Linki paylaştığında burada görünür.</p></div>
        </Card>
      </div>
    </div>
  );
}

function Chevron() { return <span className="text-muted">→</span>; }

function IncomingRequests() {
  const accepted = useApp((s) => s.acceptedRequests);
  const acceptRequest = useApp((s) => s.acceptRequest);
  const friendRequests = useApp((s) => s.friendRequests);
  const [removed, setRemoved] = useState<string[]>([]);
  const [acceptedNames, setAcceptedNames] = useState<{ id: string; name: string }[]>([]);
  const pending = friendRequests.filter((r) => !accepted.includes(r.id) && !removed.includes(r.id));
  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_.85fr]">
      <Card>
        <div className="flex items-center justify-between">
          <div><h2 className="font-display text-[17px] font-extrabold">Gelen İstekler</h2><p className="mt-1 text-[11.5px] text-muted">Sana istek atanlar. Kabul edersen DM listene eklenir.</p></div>
          {pending.length > 0 && <Badge className="border-danger/30 bg-danger/10 text-danger">{pending.length} yeni</Badge>}
        </div>
        <div className="mt-5 space-y-2">
          <AnimatePresence>
            {pending.map((r) => (
              <motion.div key={r.id} layout exit={{ opacity: 0, x: 40, height: 0 }} className="flex items-center gap-3 rounded-card bg-white/[.04] p-3.5">
                <SlopAvatar name={r.name} size={40} />
                <div className="min-w-0 flex-1"><p className="text-[12px] font-bold">{r.name}</p><p className="truncate text-[10px] text-muted">{r.source} • {r.mutual} • {r.time}</p></div>
                <button onClick={() => { void acceptRequest(r.id); setAcceptedNames((s) => [...s, { id: r.id, name: r.name }]); toast.success(`Şimdi arkadaşsın • ${r.name}`); }} className="grid h-8 w-8 place-items-center rounded-full bg-lime/15 text-lime transition hover:scale-110"><Check size={15} /></button>
                <button onClick={() => { setRemoved((s) => [...s, r.id]); toast("İstek reddedildi"); }} className="grid h-8 w-8 place-items-center rounded-full bg-danger/15 text-danger transition hover:scale-110"><X size={15} /></button>
              </motion.div>
            ))}
          </AnimatePresence>
          {pending.length === 0 && <div className="grid place-items-center py-10 text-center"><Inbox size={28} className="text-muted/40" /><p className="mt-2 text-[12px] font-bold">İstek kalmadı</p><p className="text-[10.5px] text-muted">Yeni istek gelince burada görünür.</p></div>}
        </div>
        {pending.length > 0 && (
          <div className="mt-5 flex gap-2">
            <Button variant="lime" size="sm" onClick={() => { pending.forEach((r) => { void acceptRequest(r.id); setAcceptedNames((s) => [...s, { id: r.id, name: r.name }]); }); toast.success("Tüm istekler kabul edildi"); }}>Tümünü Kabul Et</Button>
            <Button variant="danger" size="sm" onClick={() => { setRemoved((s) => [...s, ...pending.map((r) => r.id)]); toast("Tüm istekler reddedildi"); }}>Tümünü Reddet</Button>
          </div>
        )}
      </Card>
      <Card>
        <SectionTitle>Kabul edilenler</SectionTitle>
        <p className="mt-1.5 text-[11px] text-muted">Kabul ettiklerin direkt DM'de görünür.</p>
        <div className="mt-4 space-y-2">
          {acceptedNames.length === 0 ? (
            <div className="grid place-items-center py-8 text-center"><Check size={24} className="text-muted/40" /><p className="mt-2 text-[11px] font-bold text-muted">Henüz kimseyi kabul etmedin</p><p className="text-[10px] text-muted/70">Sağdaki ✓ butonuna basınca burada görünür.</p></div>
          ) : acceptedNames.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-card bg-lime/[.07] px-3 py-2.5 text-[11.5px] font-bold text-lime"><Check size={13} /> {item.name}</div>)}
        </div>
      </Card>
    </div>
  );
}

export function AddFriend() {
  const tab = useApp((s) => s.addFriendTab);
  const setTab = useApp((s) => s.setAddFriendTab);
  const setView = useApp((s) => s.setView);
  const profile = useApp((s) => s.profile);
  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[.06] px-4">
        <button onClick={() => setView("app")} className="icon-btn"><ArrowLeft size={16} /></button>
        <div><span className="font-display text-[13px] font-extrabold">Arkadaş Ekle</span><span className="ml-2 text-[10px] text-muted">• Prototip</span></div>
        <div className="ml-auto hidden items-center gap-2 sm:flex"><span className="text-[10.5px] text-muted">Senin kodun: <b className="text-paper">{profile.name}#{profile.tag}</b></span><SlopAvatar name={profile.name} size={28} /></div>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[980px] px-5 py-7 pb-16">
          <h1 className="font-display text-[26px] font-extrabold tracking-tight">Arkadaş Ekle</h1>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">İster kullanıcı adıyla ekle, ister davet linki / kodu ile katıl. Karşı taraf kabul edince DM listende görünür.</p>
          <Tabs value={tab} onValueChange={setTab} className="mt-6">
            <TabsList className="no-scrollbar flex w-full justify-start overflow-x-auto">
              {tabs.map((t) => <TabsTrigger key={t.value} value={t.value} className="flex shrink-0 items-center gap-1.5"><t.icon size={13} />{t.value}{t.value === "Gelen İstekler" && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[8px] font-black text-white">3</span>}</TabsTrigger>)}
            </TabsList>
            <div className="mt-5">
              <TabsContent value="Ad ile Ekle"><AddByName /></TabsContent>
              <TabsContent value="Davet ile Katıl"><JoinByInvite /></TabsContent>
              <TabsContent value="Davet Oluştur"><CreateInvite /></TabsContent>
              <TabsContent value="Gelen İstekler"><IncomingRequests /></TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
