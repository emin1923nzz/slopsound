import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import {
  User, AtSign, Shield, Bell, Palette, Mic2, Languages, Keyboard, HardDrive, TriangleAlert,
  Check, Camera, Lock, LogOut, Trash2, Monitor, MonitorUp, Sparkles, Smartphone, ChevronRight, ArrowLeft, Save,
  Circle, RefreshCw, AppWindow, Radio, Download, Search, Image as ImageIcon, Gamepad2, Music2, Activity,
} from "lucide-react";
import { toast } from "sonner";
import { useApp, type Accent } from "@/lib/store";
import { useAudio } from "@/lib/audio";
import { useVideo, resolutions, fpsOptions, qualityOptions, codecOptions } from "@/lib/video";
import { useLiveKit } from "@/lib/livekit";
import { useRecording } from "@/lib/recording";
import { getAutostart, nativeCaptureStatus, notify, setAutostart, type NativeCaptureStatus } from "@/lib/native";
import { shortcutLabels, useShortcuts, type ShortcutAction } from "@/lib/shortcuts";
import { ConnectionState } from "livekit-client";
import { usePerf } from "@/lib/perf";
import { cn } from "@/lib/utils";
import { Badge, Button, Dialog, DialogContent, DialogTrigger, Input, SectionTitle, Switch, Textarea } from "./ui";
import { BadgeChips } from "./BadgeChips";
import { SlopAvatar } from "./SlopAvatar";

type MenuItem = { label: string; icon: React.ElementType; badge?: string; danger?: boolean };
const menu: { group: string; items: MenuItem[] }[] = [
  { group: "KULLANICI AYARLARI", items: [
    { label: "Profilim", icon: User }, { label: "Hesap", icon: AtSign }, { label: "Gizlilik", icon: Shield, badge: "2" }, { label: "Bildirimler", icon: Bell },
  ] },
  { group: "UYGULAMA", items: [
    { label: "Görünüm", icon: Palette }, { label: "Ses ve Video", icon: Mic2 }, { label: "Performans", icon: Activity }, { label: "Dil", icon: Languages },
    { label: "Klavye Kısayolları", icon: Keyboard }, { label: "Depolama", icon: HardDrive }, { label: "Tehlikeli Bölge", icon: TriangleAlert, danger: true },
  ] },
];

const accents: { id: Accent; color: string; label: string }[] = [
  { id: "violet", color: "#8B6CFF", label: "Mor" },
  { id: "lime", color: "#C9F25B", label: "Lime" },
  { id: "coral", color: "#FF7460", label: "Mercan" },
  { id: "cyan", color: "#4AD6EB", label: "Camgöbeği" },
  { id: "amber", color: "#FFBA4A", label: "Kehribar" },
];

const profileColors = ["#8B6CFF", "#C9F25B", "#FF7460", "#4AD6EB", "#FFBA4A", "#FF6B7A", "#F4F1EA"];

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }} className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-[12.5px] text-muted">{description}</p>
      </div>
      {children}
    </motion.div>
  );
}

function Card({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <div id={id} className={cn("glass rounded-panel p-5", className)}>{children}</div>;
}

function Row({ icon: Icon, title, description, children }: { icon: React.ElementType; title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-white/[.06] py-4 last:border-0">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] bg-white/[.06] text-brand"><Icon size={16} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ToggleRow(props: React.ComponentProps<typeof Row> & { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  const { checked, onCheckedChange, ...row } = props;
  return <Row {...row}><Switch checked={checked} onCheckedChange={onCheckedChange} /></Row>;
}

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-full border px-3.5 py-2 text-[11px] font-bold transition",
            value === option ? "border-brand/50 bg-brand/15 text-paper shadow-[0_6px_16px_hsl(var(--brand)/.25)]" : "border-white/[.08] text-muted hover:bg-white/[.05]",
          )}
        >
          {value === option && <Check size={11} className="mr-1 inline" />}{option}
        </button>
      ))}
    </div>
  );
}

function ProfilePanel() {
  const profile = useApp((s) => s.profile);
  const badges = useApp((s) => s.user?.badges ?? []);
  const updateProfile = useApp((s) => s.updateProfile);
  const activityData = useApp((s) => s.activityData);
  const [bio, setBio] = useState(profile.bio);
  const [tenorKey, setTenorKey] = useState("");
  const [gifQuery, setGifQuery] = useState("dance");
  const [gifs, setGifs] = useState<string[]>([]);
  const [gifLoading, setGifLoading] = useState(false);

  async function searchGifs() {
    if (!tenorKey.trim()) { toast.error("Tenor API anahtarı gerekli"); return; }
    setGifLoading(true);
    try {
      const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(gifQuery)}&key=${encodeURIComponent(tenorKey)}&limit=12&media_filter=minimal`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Tenor isteği başarısız");
      const data = await response.json() as { results?: { media_formats?: { gif?: { url?: string } } }[] };
      setGifs((data.results ?? []).map((r) => r.media_formats?.gif?.url).filter((u): u is string => Boolean(u)));
    } catch {
      toast.error("GIF’ler alınamadı");
    } finally {
      setGifLoading(false);
    }
  }

  return (
    <Panel title="Profilim" description="Diğer kullanıcılar seni böyle görür. Değişiklikler anında önizlemede görünür.">
      <Card>
        <SectionTitle>Önizleme</SectionTitle>
        <div className="mt-4 overflow-hidden rounded-card border border-white/[.06] bg-black/20">
          <div className="h-24 w-full bg-cover bg-center" style={profile.bannerUrl ? { backgroundImage: `url(${profile.bannerUrl})` } : { background: `linear-gradient(120deg, ${profile.color}55, transparent 60%), radial-gradient(circle at 80% 20%, #C9F25B33, transparent 50%)` }} />
          <div className="-mt-8 flex flex-wrap items-end gap-4 p-5 pt-0">
          <SlopAvatar name={profile.name} size={64} status={profile.status} showDot className="ring-4 ring-[#17141f]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-[17px] font-extrabold">{profile.name}</p>
              <Badge className="border-warn/30 bg-warn/10 text-warn">NITRO</Badge>
            </div>
            <p className="text-[11.5px] text-muted">{profile.name}#{profile.tag} • <span style={{ color: profile.color }}>{profile.customStatus}</span></p>
            {profile.activity && <p className="mt-1 flex items-center gap-1.5 text-[10.5px] text-lime"><Radio size={11} /> {profile.activity}</p>}
            <p className="mt-2 max-w-md text-[12px] text-paper/75">{bio}</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><BadgeChips badges={badges} /><Badge>LVL 12</Badge><Badge>SlopSound HQ</Badge><Badge>Oyun Tayfası</Badge></div>
          </div>
          <Button variant="outline" size="sm" onClick={() => document.getElementById("gif-search")?.scrollIntoView({ behavior: "smooth" })}><Camera size={13} /> GIF / Banner Seç</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <SectionTitle>Kullanıcı adı</SectionTitle>
            <Input value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })} className="mt-2" />
            <p className="mt-1.5 text-[10.5px] text-muted">3-20 karakter, boşluk yok.</p>
          </div>
          <div>
            <SectionTitle>Etiket</SectionTitle>
            <Input value={`#${profile.tag}`} disabled className="mt-2 opacity-60" />
            <p className="mt-1.5 text-[10.5px] text-muted">Etiketin sabit, değiştirilemez.</p>
          </div>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between"><SectionTitle>Hakkımda</SectionTitle><span className="text-[10px] text-muted tabular">{bio.length} / 190</span></div>
          <Textarea value={bio} maxLength={190} onChange={(e) => { setBio(e.target.value); updateProfile({ bio: e.target.value }); }} className="mt-2" rows={3} />
        </div>
        <div className="mt-5">
          <SectionTitle>Durumun</SectionTitle>
          <div className="mt-2"><Chips options={["Çevrimiçi", "Boşta", "Rahatsız Etme", "Görünmez"]} value={{ online: "Çevrimiçi", idle: "Boşta", dnd: "Rahatsız Etme", offline: "Görünmez" }[profile.status]} onChange={(v) => updateProfile({ status: ({ "Çevrimiçi": "online", "Boşta": "idle", "Rahatsız Etme": "dnd", "Görünmez": "offline" } as const)[v] })} /></div>
        </div>
        <div className="mt-5">
          <SectionTitle>Özel durum mesajı</SectionTitle>
          <Input value={profile.customStatus} onChange={(e) => updateProfile({ customStatus: e.target.value })} className="mt-2" />
          <p className="mt-1.5 text-[10.5px] text-muted">Profilinde adının altında görünür.</p>
        </div>
        <div className="mt-5">
          <SectionTitle>Profil rengi</SectionTitle>
          <div className="mt-3 flex flex-wrap gap-3">
            {profileColors.map((color) => (
              <button
                key={color}
                onClick={() => updateProfile({ color })}
                className={cn("grid h-10 w-10 place-items-center rounded-full border-2 transition hover:scale-110", profile.color === color ? "border-paper" : "border-transparent")}
                style={{ background: color }}
              >
                {profile.color === color && <Check size={15} className="text-ink" />}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card id="gif-search">
        <SectionTitle>Profil GIF ve Banner</SectionTitle>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">Tenor API anahtarınla ücretsiz GIF ara; avatar veya banner olarak kullan. Doğrudan GIF URL’si de yapıştırabilirsin.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input aria-label="Tenor API anahtarı" type="password" value={tenorKey} onChange={(e) => setTenorKey(e.target.value)} placeholder="Tenor API key" />
          <Input aria-label="GIF arama" value={gifQuery} onChange={(e) => setGifQuery(e.target.value)} placeholder="dance, cat, gaming…" />
          <Button variant="outline" disabled={gifLoading} onClick={() => void searchGifs()}><Search size={13} /> Ara</Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input aria-label="Avatar GIF URL" value={profile.avatarUrl} onChange={(e) => updateProfile({ avatarUrl: e.target.value })} placeholder="Avatar GIF URL" />
          <Input aria-label="Banner GIF URL" value={profile.bannerUrl} onChange={(e) => updateProfile({ bannerUrl: e.target.value })} placeholder="Banner GIF URL" />
        </div>
        {gifs.length > 0 && (
          <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
            {gifs.map((url) => (
              <div key={url} className="flex shrink-0 flex-col gap-1">
                <button onClick={() => updateProfile({ avatarUrl: url })} className="relative h-20 w-28 overflow-hidden rounded-xl border border-white/10 transition hover:border-brand"><img src={url} alt="GIF" className="h-full w-full object-cover" /><span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[8px] font-bold">Avatar</span></button>
                <button onClick={() => updateProfile({ bannerUrl: url })} className="relative h-6 w-28 overflow-hidden rounded-lg border border-white/10 transition hover:border-lime"><img src={url} alt="Banner" className="h-full w-full object-cover" /><span className="absolute inset-0 grid place-items-center bg-black/45 text-[8px] font-bold">Banner</span></button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => updateProfile({ avatarUrl: "", bannerUrl: "" })}><ImageIcon size={12} /> Varsayalana Dön</Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>Rich Presence</SectionTitle>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">Oyun veya müzik durumunu profilinde ve dock’ta göster. Bu alan yalnızca senin seçtiğin bilgiyi paylaşır.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Input aria-label="Aktivite metni" value={profile.activity} onChange={(e) => updateProfile({ activity: e.target.value })} placeholder="Örn. Valorant oynuyor" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => updateProfile({ activity: "Valorant oynuyor" })}><Gamepad2 size={12} /> Oyun</Button>
            <Button variant="outline" size="sm" onClick={() => updateProfile({ activity: "Spotify’da müzik dinliyor" })}><Music2 size={12} /> Müzik</Button>
            <Button variant="ghost" size="sm" onClick={() => updateProfile({ activity: "" })}>Temizle</Button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Bu haftaki aktiviten</SectionTitle>
        <div className="mt-3 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={activityData}>
              <defs><linearGradient id="actFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity={.45} /><stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity={0} /></linearGradient></defs>
              <Area type="monotone" dataKey="messages" stroke="hsl(var(--brand))" strokeWidth={2} fill="url(#actFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </Panel>
  );
}

function AccountPanel() {
  return (
    <Panel title="Hesap" description="E-posta, şifre ve hesabınla ilgili her şey.">
      <Card>
        <Row icon={AtSign} title="E-posta" description="Doğrulandı. Değiştirirsen tekrar doğrulaman gerekir."><Button variant="outline" size="sm">Değiştir</Button></Row>
        <Row icon={Smartphone} title="Telefon (isteğe bağlı)" description="+90 5XX XXX XX XX"><Button variant="outline" size="sm">Ekle</Button></Row>
        <Row icon={Lock} title="Şifre" description="Güçlü bir şifre kullan, kimseyle paylaşma."><Button variant="outline" size="sm" onClick={() => toast("Şifre değiştirme yakında")}>Şifre Değiştir</Button></Row>
        <Row icon={Shield} title="İki faktörlü doğrulama" description="Hesabını ekstra güvenlik katmanıyla koru."><Button variant="lime" size="sm" onClick={() => toast.success("2FA etkinleştirildi")}>Aç</Button></Row>
      </Card>
      <Card>
        <SectionTitle>Oturumlar</SectionTitle>
        <p className="mt-1 text-[11px] text-muted">Hesabın hangi cihazlarda açık.</p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-3 rounded-card bg-white/[.04] p-3"><Monitor size={17} className="text-brand" /><div className="flex-1"><p className="text-[12px] font-bold">Windows • Chrome</p><p className="text-[10px] text-muted">Şu an aktif • Bursa, TR</p></div><Badge className="border-lime/30 bg-lime/10 text-lime">BU CİHAZ</Badge></div>
          <div className="flex items-center gap-3 rounded-card bg-white/[.04] p-3"><Smartphone size={17} className="text-muted" /><div className="flex-1"><p className="text-[12px] font-bold">Android • SlopSound App</p><p className="text-[10px] text-muted">2 saat önce • İstanbul, TR</p></div><Button variant="ghost" size="sm" onClick={() => toast("Oturum kapatıldı")}>Kapat</Button></div>
        </div>
      </Card>
    </Panel>
  );
}

function PrivacyPanel() {
  const [v, setV] = useState({ dm: true, requests: true, presence: true, activity: false });
  return (
    <Panel title="Gizlilik" description="Kim sana yazabilir, kim seni ekleyebilir, sen kontrol et.">
      <Card>
        <ToggleRow icon={Bell} title="Herkes DM atabilir" description="Kapalıysa sadece arkadaşların yazabilir." checked={v.dm} onCheckedChange={(x) => setV({ ...v, dm: x })} />
        <ToggleRow icon={User} title="Arkadaşlık isteği al" description="Kapalıysa sadece davet linkinle eklenebilirsin." checked={v.requests} onCheckedChange={(x) => setV({ ...v, requests: x })} />
        <ToggleRow icon={Shield} title="Çevrimiçi durumumu göster" description="Kapalıysa Görünmez gibi görünürsün." checked={v.presence} onCheckedChange={(x) => setV({ ...v, presence: x })} />
        <ToggleRow icon={Palette} title="Oynadığım oyunu göster" description="Valorant, Spotify gibi aktiviteler görünür." checked={v.activity} onCheckedChange={(x) => setV({ ...v, activity: x })} />
        <Row icon={User} title="Engellenenler" description="2 kişi engelli"><Button variant="outline" size="sm" onClick={() => toast("Engellenenler listesi açıldı")}>Listeyi Gör</Button></Row>
      </Card>
    </Panel>
  );
}

function NotificationPanel() {
  const [v, setV] = useState({ dm: true, mention: true, server: false, sound: true });
  const [quiet, setQuiet] = useState("Kapalı");
  return (
    <Panel title="Bildirimler" description="Ne zaman ses çıksın, ne zaman sessiz kalsın.">
      <Card>
        <ToggleRow icon={Bell} title="DM bildirimleri" description="Biri sana yazınca bildirim gelsin." checked={v.dm} onCheckedChange={(x) => setV({ ...v, dm: x })} />
        <ToggleRow icon={AtSign} title="Etiketlenme (@) bildirimleri" description="Biri seni etiketleyince." checked={v.mention} onCheckedChange={(x) => setV({ ...v, mention: x })} />
        <ToggleRow icon={User} title="Sunucu bildirimleri" description="Tüm sunuculardan bildirim al." checked={v.server} onCheckedChange={(x) => setV({ ...v, server: x })} />
        <ToggleRow icon={Bell} title="Ses" description="Bildirim sesi çalsın." checked={v.sound} onCheckedChange={(x) => setV({ ...v, sound: x })} />
      </Card>
      <Card>
        <SectionTitle>Rahatsız etme saatleri</SectionTitle>
        <div className="mt-3"><Chips options={["Kapalı", "23:00 - 08:00", "00:00 - 09:00", "Özel saat seç"]} value={quiet} onChange={setQuiet} /></div>
        <p className="mt-2 text-[10.5px] text-muted">Bu saatlerde bildirim gelmez.</p>
      </Card>
    </Panel>
  );
}

function AppearancePanel() {
  const accent = useApp((s) => s.accent);
  const setAccent = useApp((s) => s.setAccent);
  const density = useApp((s) => s.density);
  const setDensity = useApp((s) => s.setDensity);
  const reduceMotion = useApp((s) => s.reduceMotion);
  const setReduceMotion = useApp((s) => s.setReduceMotion);
  const [theme, setTheme] = useState("Koyu + Mor");
  const [fontSize, setFontSize] = useState("Normal");
  return (
    <Panel title="Görünüm" description="SlopSound sana nasıl görünsün.">
      <Card>
        <SectionTitle>Tema</SectionTitle>
        <div className="mt-3"><Chips options={["Koyu + Mor", "Açık", "Sarı Siyah", "Sisteme Uysun"]} value={theme} onChange={(v) => { setTheme(v); toast(`Tema: ${v}`); }} /></div>
        <p className="mt-2 text-[10.5px] text-muted">RGB yok, sade. Renkleri aşağıdan özelleştirebilirsin.</p>
        <SectionTitle className="!mt-6">Vurgu rengi</SectionTitle>
        <div className="mt-3 flex flex-wrap gap-3">
          {accents.map((a) => (
            <button key={a.id} onClick={() => setAccent(a.id)} className={cn("flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-bold transition", accent === a.id ? "border-paper/40 bg-white/[.08]" : "border-white/[.08] text-muted hover:bg-white/[.05]")}>
              <span className="h-4 w-4 rounded-full" style={{ background: a.color }} />{a.label}
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <SectionTitle>Yazı boyutu</SectionTitle>
        <div className="mt-3"><Chips options={["Küçük", "Normal", "Büyük", "Çok Büyük"]} value={fontSize} onChange={setFontSize} /></div>
        <div className="mt-5">
          <ToggleRow icon={Palette} title="Kompakt mod" description="Mesajlar daha sıkı görünür, daha çok mesaj sığar." checked={density === "compact"} onCheckedChange={(v) => setDensity(v ? "compact" : "comfortable")} />
          <ToggleRow icon={Palette} title="Hareketleri azalt" description="Animasyonları kapat, daha hızlı hissettir." checked={reduceMotion} onCheckedChange={setReduceMotion} />
        </div>
      </Card>
    </Panel>
  );
}

function AudioPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audio = useAudio();
  const video = useVideo();
  const live = useLiveKit();
  const recording = useRecording();
  const joinVoice = useApp((s) => s.joinVoice);
  const leaveVoice = useApp((s) => s.leaveVoice);
  const voiceChannelId = useApp((s) => s.voiceChannelId);
  const voiceConnected = useApp((s) => s.voiceConnected);
  const channelGroups = useApp((s) => s.channelGroups);
  const [testing, setTesting] = useState(false);
  const [capture, setCapture] = useState<NativeCaptureStatus | null>(null);

  useEffect(() => { void audio.refreshDevices(); void video.refreshDevices(); void nativeCaptureStatus().then(setCapture); }, []);
  useEffect(() => { if (video.cameraOn) video.attachCamera(videoRef.current); }, [video.cameraOn, video.attachCamera]);

  const selectClass = "max-w-[190px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] outline-none";
  const inputClass = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] outline-none placeholder:text-muted/60";
  const deviceName = (id: string, list: MediaDeviceInfo[], fallback: string) =>
    list.find((d) => d.deviceId === id)?.label || fallback;
  const connected = live.status === ConnectionState.Connected;
  const voiceChannelName = channelGroups.flatMap((g) => g.channels).find((c) => c.id === voiceChannelId)?.name ?? "—";

  async function testMic() {
    const ok = await audio.ensureMic();
    if (!ok) { toast.error("Mikrofon izni alınamadı"); return; }
    setTesting(true);
    toast.success("Mikrofon testi başladı — konuş, çubuğu izle");
  }

  async function toggleCamera() {
    const ok = video.cameraOn ? (video.stopCamera(), true) : await video.startCamera();
    toast[ok ? "success" : "error"](ok ? (video.cameraOn ? "Kamera açıldı" : "Kamera kapatıldı") : "Kamera izni alınamadı");
  }

  return (
    <Panel title="Ses ve Video" description="Mikrofon, kamera, codec ve LiveKit bağlantısı.">
      <Card>
        <SectionTitle>Ses</SectionTitle>
        <div className="mt-2">
          <Row icon={Mic2} title="Giriş cihazı (mikrofon)" description="Konuşurken kullanılacak cihaz.">
            <select aria-label="Mikrofon cihazı" className={selectClass} value={audio.inputId} onChange={(e) => audio.setInputDevice(e.target.value)}>
              <option value="">Varsaylan Mikrofon</option>
              {audio.devices.inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mikrofon ${d.deviceId.slice(0, 6)}`}</option>)}
            </select>
          </Row>
          <Row icon={Bell} title="Çıkış cihazı (kulaklık)" description="Seslerin nereden çalınacağı.">
            <select aria-label="Çıkış cihazı" className={selectClass} value={audio.outputId} onChange={(e) => audio.setOutputDevice(e.target.value)}>
              <option value="">Varsaylan Hoparlör</option>
              {audio.devices.outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Çıkış ${d.deviceId.slice(0, 6)}`}</option>)}
            </select>
          </Row>
          <div className="py-4">
            <div className="mb-2 flex items-center justify-between"><SectionTitle>Mikrofon sesi</SectionTitle><span className="tabular text-[11px] font-bold text-brand">%{audio.volume}</span></div>
            <input aria-label="Mikrofon sesi" type="range" min={0} max={100} value={audio.volume} onChange={(e) => audio.setVolume(Number(e.target.value))} style={{ "--fill": `${audio.volume}%` } as React.CSSProperties} className="w-full" />
          </div>
          <ToggleRow icon={Mic2} title="Gürültü engelleme" description="Arka plan sesini azaltır." checked={audio.noiseSuppression} onCheckedChange={audio.setNoiseSuppression} />
          <ToggleRow icon={Bell} title="Yankı engelleme" description="Hoparlörden gelen sesi mikrofona almaz." checked={audio.echoCancellation} onCheckedChange={audio.setEchoCancellation} />
          <ToggleRow icon={Mic2} title="Otomatik ses seviyesi" description="Sesini sabit tutar." checked={audio.autoGain} onCheckedChange={audio.setAutoGain} />
          <ToggleRow icon={Keyboard} title="Bas-Konuş" description="Konuşmak için V tuşuna basman gerekir." checked={audio.pushToTalk} onCheckedChange={audio.setPushToTalk} />
          <ToggleRow icon={Bell} title="Bildirim sesleri" description="Mesaj ve bağlantı sesleri çalsın." checked={audio.soundEnabled} onCheckedChange={audio.setSoundEnabled} />
        </div>
      </Card>

      <Card>
        <SectionTitle>Kamera ve Görüntü</SectionTitle>
        <div className="mt-2">
          <Row icon={Camera} title="Kamera cihazı" description="MediaDevices API ile seçilen fiziksel kamera.">
            <select aria-label="Kamera cihazı" className={selectClass} value={video.deviceId} onChange={(e) => video.setDevice(e.target.value)}>
              <option value="">Varsaylan Kamera</option>
              {video.devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Kamera ${d.deviceId.slice(0, 6)}`}</option>)}
            </select>
          </Row>
          <Row icon={Monitor} title="Çözünürlük" description="Kamera yakalama çözünürlüğü.">
            <select aria-label="Çözünürlük" className={selectClass} value={video.resolution} onChange={(e) => video.setResolution(e.target.value as typeof video.resolution)}>
              {resolutions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Row>
          <Row icon={Monitor} title="Kare hızı (FPS)" description="Akıcılık ile CPU kullanımı dengesi.">
            <select aria-label="Kare hızı" className={selectClass} value={video.fps} onChange={(e) => video.setFps(Number(e.target.value))}>
              {fpsOptions.map((f) => <option key={f} value={f}>{f} FPS</option>)}
            </select>
          </Row>
          <Row icon={Monitor} title="Video kalitesi" description="Bitrate ve simulcast katmanları.">
            <select aria-label="Video kalitesi" className={selectClass} value={video.quality} onChange={(e) => { video.setQuality(e.target.value as typeof video.quality); live.setPublishQuality(e.target.value as typeof video.quality); }}>
              {qualityOptions.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
            </select>
          </Row>
          <Row icon={Monitor} title="Codec" description="WebRTC video kodlayıcı. VP9/H.264 için yedek VP8 katmanı.">
            <select aria-label="Codec" className={selectClass} value={video.codec} onChange={(e) => video.setCodec(e.target.value as typeof video.codec)}>
              {codecOptions.map((c) => <option key={c.id} value={c.id}>{c.label} • {c.note}</option>)}
            </select>
          </Row>
          <ToggleRow icon={Sparkles} title="WebCodecs stili" description={video.webCodecsSupported ? "Gerçek zamanlı kontrast/vinyet filtresi (WebCodecs)." : "Bu tarayıcıda WebCodecs desteklenmiyor."} checked={video.styleFilter} onCheckedChange={video.setStyleFilter} />
          <Row icon={MonitorUp} title="Paylaşım kaynağı" description="Tüm ekran veya belirli pencere; LiveKit displaySurface kullanır.">
            <div className="flex gap-1">
              <button aria-label="Tüm ekran" onClick={() => video.setScreenSource("monitor")} data-active={video.screenSource === "monitor"} className="icon-btn h-7 w-7"><Monitor size={13} /></button>
              <button aria-label="Pencere" onClick={() => video.setScreenSource("window")} data-active={video.screenSource === "window"} className="icon-btn h-7 w-7"><AppWindow size={13} /></button>
            </div>
          </Row>
          <ToggleRow icon={Radio} title="Sistem sesini paylaş" description="WebView2 her zaman sistem sesi vermez; gerekirse native WASAPI yakalaması gerekir." checked={video.shareSystemAudio} onCheckedChange={video.setShareSystemAudio} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void toggleCamera()}><Camera size={14} /> {video.cameraOn ? "Kamerayı Kapat" : "Kamerayı Aç"}</Button>
          <Button variant="outline" onClick={() => void testMic()}><Mic2 size={14} /> Mikrofonu Test Et</Button>
          {testing && <Button variant="ghost" onClick={() => { audio.stopMic(); setTesting(false); }}>Testi Bitir</Button>}
        </div>
        {testing && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-brand to-lime transition-[width] duration-75" style={{ width: `${Math.round(audio.level * 100)}%` }} />
            </div>
            <p className="mt-2 text-[10px] text-muted">Giriş seviyesi: %{Math.round(audio.level * 100)} • {deviceName(audio.inputId, audio.devices.inputs, "Varsaylan mikrofon")}</p>
          </div>
        )}
        {video.cameraOn && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
            <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full object-cover" />
            <p className="px-3 py-2 text-[9.5px] text-muted">Canlı önizleme • {resolutions.find((r) => r.id === video.resolution)?.width}×{resolutions.find((r) => r.id === video.resolution)?.height} @ {video.fps} FPS</p>
          </div>
        )}
        {video.error && <p className="mt-3 text-[11px] text-danger">{video.error}</p>}
        {audio.status === "denied" && <p className="mt-3 text-[11px] text-danger">Mikrofon izni reddedildi. Tarayıcı/Tauri izinlerini kontrol et.</p>}
      </Card>

      <Card>
        <SectionTitle>LiveKit Bağlantısı</SectionTitle>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">Sunucu URL ve kısa ömürlü JWT token backend tarafından üretilir. Token kalıcı saklanmaz. Seçili kanal: <span className="font-bold text-paper/80">{voiceChannelName}</span></p>
        <div className="mt-4 space-y-2">
          <input aria-label="LiveKit URL" className={inputClass} value={live.url} readOnly placeholder="Ses kanalına katılınca otomatik gelir" />
          <input aria-label="LiveKit token" type="password" className={inputClass} value={live.token ? "••••••••••••••••" : ""} readOnly placeholder="Backend token'ı otomatik alınır" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant={voiceConnected ? "danger" : "primary"} onClick={() => void (voiceConnected ? leaveVoice() : joinVoice(voiceChannelId))}>
            {voiceConnected ? "Ses Kanalından Ayrıl" : "Ses Kanalına Katıl"}
          </Button>
          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold", connected ? "bg-lime/15 text-lime" : "bg-white/[.06] text-muted")}>
            {live.status}
          </span>
          <Button variant="outline" onClick={() => void live.setScreenShare(!live.screenSharing)}>
            <MonitorUp size={14} /> {live.screenSharing ? "Paylaşımı Durdur" : "Ekran Paylaş"}
          </Button>
        </div>
        {live.error && <p className="mt-3 text-[11px] text-danger">{live.error}</p>}
        {connected && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/[.04] p-2"><p className="font-display text-[16px] font-extrabold text-lime">{live.participants.length}</p><p className="text-[9px] text-muted">Katılımcı</p></div>
            <div className="rounded-xl bg-white/[.04] p-2"><p className="font-display text-[16px] font-extrabold text-brand">{live.screens.length}</p><p className="text-[9px] text-muted">Paylaşım</p></div>
            <div className="rounded-xl bg-white/[.04] p-2"><p className="font-display text-[16px] font-extrabold text-warn">{live.activeSpeakerIds.length}</p><p className="text-[9px] text-muted">Konuşan</p></div>
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-white/[.04] p-2"><p className="tabular font-display text-[15px] font-extrabold text-lime">{live.stats.rttMs || "—"} ms</p><p className="text-[9px] text-muted">Ping • WebRTC Stats</p></div>
          <div className="rounded-xl bg-white/[.04] p-2"><p className="tabular font-display text-[15px] font-extrabold text-warn">{live.stats.packetLoss}%</p><p className="text-[9px] text-muted">Paket kaybı</p></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void live.reconnect()}><RefreshCw size={12} /> Bağlantıyı Yeniden Kur</Button>
          <span className="rounded-full bg-white/[.06] px-2.5 py-1 text-[10px] font-bold text-muted">Opus • {live.stats.quality}</span>
        </div>
        <div className="mt-4 space-y-2 border-t border-white/[.06] pt-4">
          <p className="text-[10px] font-bold text-muted">STUN / TURN (coturn)</p>
          <input aria-label="STUN sunucusu" className={inputClass} value={live.stunUrl} onChange={(e) => live.setIceConfig({ stunUrl: e.target.value })} placeholder="stun:stun.l.google.com:19302" />
          <input aria-label="TURN sunucusu" className={inputClass} value={live.turnUrl} onChange={(e) => live.setIceConfig({ turnUrl: e.target.value })} placeholder="turn:turn.sunucun.com:3478" />
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="TURN kullanıcı adı" className={inputClass} value={live.turnUsername} onChange={(e) => live.setIceConfig({ turnUsername: e.target.value })} placeholder="kullanıcı" />
            <input aria-label="TURN şifresi" type="password" className={inputClass} value={live.turnPassword} onChange={(e) => live.setIceConfig({ turnPassword: e.target.value })} placeholder="şifre" />
          </div>
          <p className="text-[9px] text-muted/60">TURN şifresi kalıcı saklanmaz. Otomatik kalite LiveKit adaptiveStream + dynacast ile yönetilir.</p>
        </div>
        {live.history.length > 0 && (
          <div className="mt-4 border-t border-white/[.06] pt-4">
            <p className="text-[10px] font-bold text-muted">Bağlantı Geçmişi</p>
            <div className="no-scrollbar mt-2 max-h-28 space-y-1 overflow-y-auto">
              {[...live.history].reverse().map((event, index) => (
                <div key={`${event.at}-${index}`} className="flex items-center justify-between rounded-lg bg-white/[.03] px-2.5 py-1.5 text-[9.5px]">
                  <span className="font-bold text-paper/80">{event.state}</span>
                  <span className="text-muted">{event.detail ?? "—"}</span>
                  <span className="tabular text-muted/60">{new Date(event.at).toLocaleTimeString("tr-TR")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Kayıt ve Yakalama</SectionTitle>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">Kayıt her zaman görünür göstergeyle başlar; katılımcılara LiveKit veri kanalıyla bildirim gönderilir. Gizli kayıt yok.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant={recording.recording ? "danger" : "primary"} onClick={() => void (recording.recording ? recording.stop() : recording.start("meeting", video.screenSource === "window" ? "screen" : "screen"))}>
            <Circle size={13} fill={recording.recording ? "currentColor" : "none"} /> {recording.recording ? "Kaydı Durdur" : "Görüşmeyi Kaydet"}
          </Button>
          <Button variant="outline" disabled={recording.recording} onClick={() => void recording.start("local", "camera")}><Camera size={13} /> Yerel Kamera Kaydı</Button>
          {recording.lastUrl && <Button variant="outline" disabled={recording.saving} onClick={() => void recording.saveLast()}><Download size={13} /> Kaydı Sakla</Button>}
        </div>
        {recording.savedPath && <p className="mt-3 text-[10px] text-lime">Kaydedildi: {recording.savedPath}</p>}
        {recording.error && <p className="mt-3 text-[11px] text-danger">{recording.error}</p>}
        {capture && (
          <div className="mt-4 rounded-xl bg-white/[.04] p-3">
            <p className="text-[10px] font-bold text-muted">NATIVE YAKALAMA • {capture.os.toUpperCase()}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[9px]">
              <span className={cn("rounded-full px-2 py-1 font-bold", capture.graphics_capture ? "bg-lime/15 text-lime" : "bg-white/[.06] text-muted")}>Graphics Capture {capture.graphics_capture ? "VAR" : "YOK"}</span>
              <span className={cn("rounded-full px-2 py-1 font-bold", capture.wasapi ? "bg-lime/15 text-lime" : "bg-white/[.06] text-muted")}>WASAPI {capture.wasapi ? "VAR" : "YOK"}</span>
            </div>
            <p className="mt-2 text-[9.5px] leading-relaxed text-muted/70">{capture.note}</p>
          </div>
        )}
      </Card>
    </Panel>
  );
}

function LanguagePanel() {
  const [lang, setLang] = useState("Türkçe");
  const [translate, setTranslate] = useState(false);
  return (
    <Panel title="Dil" description="SlopSound hangi dilde konuşsun.">
      <Card>
        <SectionTitle>Uygulama dili</SectionTitle>
        <div className="mt-3"><Chips options={["Türkçe", "English", "Deutsch", "Français"]} value={lang} onChange={setLang} /></div>
        <div className="mt-4"><ToggleRow icon={Languages} title="Otomatik çeviri" description="Yabancı mesajları otomatik çevir." checked={translate} onCheckedChange={setTranslate} /></div>
      </Card>
    </Panel>
  );
}

function ShortcutsPanel() {
  const bindings = useShortcuts((s) => s.bindings);
  const setShortcut = useShortcuts((s) => s.setShortcut);
  const reset = useShortcuts((s) => s.reset);
  const [listening, setListening] = useState<ShortcutAction | null>(null);
  const [autostart, setAuto] = useState(false);

  useEffect(() => { void getAutostart().then(setAuto); }, []);

  useEffect(() => {
    if (!listening) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const parts = [
        e.ctrlKey ? "Control" : "",
        e.shiftKey ? "Shift" : "",
        e.altKey ? "Alt" : "",
        e.metaKey ? "Meta" : "",
        e.key.length === 1 ? e.key.toUpperCase() : e.key,
      ].filter(Boolean);
      setShortcut(listening!, parts.join("+"));
      setListening(null);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, setShortcut]);

  return (
    <Panel title="Klavye Kısayolları" description="Global kısayollar Tauri ile kaydedilir; istediğin gibi değiştir.">
      <Card>
        {(Object.keys(shortcutLabels) as ShortcutAction[]).map((action) => (
          <div key={action} className="flex items-center justify-between border-b border-white/[.06] py-4 last:border-0">
            <div><p className="text-[12.5px] font-bold">{shortcutLabels[action]}</p><p className="text-[10px] text-muted">Uygulama kapalıyken de çalışır</p></div>
            <button
              aria-label={`${shortcutLabels[action]} kısayolunu değiştir`}
              onClick={() => setListening(action)}
              className={cn("rounded-xl border px-3 py-2 text-[10px] font-bold transition", listening === action ? "border-lime bg-lime/15 text-lime" : "border-white/10 bg-white/[.05] text-muted hover:text-paper")}
            >
              {listening === action ? "Tuşlara bas…" : bindings[action].replaceAll("+", " + ")}
            </button>
          </div>
        ))}
        <div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={reset}>Varsayılanlara Dön</Button></div>
      </Card>
      <Card>
        <SectionTitle>Windows entegrasyonları</SectionTitle>
        <ToggleRow icon={Save} title="Otomatik başlatma" description="SlopSound Windows açılırken başlasın." checked={autostart} onCheckedChange={(v) => { setAuto(v); void setAutostart(v); }} />
        <Row icon={Bell} title="Test bildirimi" description="Tauri Notification ile masaüstü bildirimi gönder.">
          <Button variant="outline" size="sm" onClick={() => void notify("SlopSound", "Bildirim sistemi çalışıyor.")}>Gönder</Button>
        </Row>
        <Row icon={Keyboard} title="Panoya kopyala" description="Davet kodunu Tauri Clipboard ile kopyala.">
          <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText("SLOP-0420").then(() => toast.success("Kopyalandı"))}>Kopyala</Button>
        </Row>
        <p className="mt-2 text-[9.5px] text-muted/70">Sistem tepsesi simgesi, pencere yönetimi ve updater zaten native katmanda aktif.</p>
      </Card>
    </Panel>
  );
}

function StoragePanel() {
  return (
    <Panel title="Depolama" description="SlopSound cihazında ne kadar yer kaplıyor.">
      <Card>
        <div className="flex items-end justify-between"><SectionTitle>Toplam kullanım</SectionTitle><span className="font-display text-[28px] font-extrabold">412 <span className="text-[14px] text-muted">MB</span></span></div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[41%] rounded-full bg-gradient-to-r from-brand to-lime" /></div>
        <p className="mt-2 text-[10.5px] text-muted">Önbellek 268 MB • İndirilenler 144 MB</p>
      </Card>
      <Card>
        <Row icon={Trash2} title="Önbelleği temizle" description="Geçici dosyalar silinir, mesajların etkilenmez."><Button variant="outline" size="sm" onClick={() => toast.success("Önbellek temizlendi")}>Temizle</Button></Row>
        <Row icon={HardDrive} title="İndirilenleri sil" description="İndirdiğin dosyalar cihazdan kaldırılır."><Button variant="outline" size="sm" onClick={() => toast("İndirilenler silindi")}>Sil</Button></Row>
      </Card>
    </Panel>
  );
}

function DangerPanel() {
  return (
    <Panel title="Tehlikeli Bölge" description="Dikkat, bunlar geri alınamaz.">
      <Card className="border-danger/20">
        <Row icon={LogOut} title="Hesabı devre dışı bırak" description="Hesabın 30 gün askıya alınır, sonra istersen geri açarsın."><Button variant="danger" size="sm" onClick={() => toast("Hesap devre dışı bırakıldı")}>Devre Dışı Bırak</Button></Row>
        <Row icon={TriangleAlert} title="Hesabı kalıcı olarak sil" description="Tüm mesajların, sunucuların, arkadaşların silinir. Geri dönüş yok.">
          <Dialog>
            <DialogTrigger asChild><Button variant="danger" size="sm">Hesabı Sil</Button></DialogTrigger>
            <DialogContent>
              <h3 className="font-display text-[19px] font-extrabold">Emin misin?</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">Hesabın kalıcı olarak silinecek. Bu işlem geri alınamaz.</p>
              <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => toast("İşlem iptal edildi")}>Vazgeç</Button><Button variant="danger" onClick={() => toast.error("Bu bir prototip, hesabın silinmedi")}>Evet, sil</Button></div>
            </DialogContent>
          </Dialog>
        </Row>
        <Row icon={LogOut} title="Tüm cihazlardan çıkış yap" description="Şu anki cihaz dahil her yerden çıkış yaparsın."><Button variant="danger" size="sm" onClick={() => toast("Tüm cihazlardan çıkış yapıldı")}>Her Yerden Çıkış Yap</Button></Row>
      </Card>
    </Panel>
  );
}

function PerformancePanel() {
  const enabled = usePerf((s) => s.enabled);
  const setEnabled = usePerf((s) => s.setEnabled);
  const samples = usePerf((s) => s.samples);
  const fps = usePerf((s) => s.fps);
  const clear = usePerf((s) => s.clear);
  const live = useLiveKit();
  const avg = samples.length ? samples.reduce((sum, s) => sum + s.actualDuration, 0) / samples.length : 0;

  return (
    <Panel title="Performans" description="Render süreleri, FPS ve bağlantı geçmişi. Ölçüm yalnızca açtığında çalışır.">
      <Card>
        <SectionTitle>Canlı ölçüm</SectionTitle>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white/[.04] p-3"><p className="tabular font-display text-[18px] font-extrabold text-lime">{fps || "—"}</p><p className="text-[9px] text-muted">FPS</p></div>
          <div className="rounded-xl bg-white/[.04] p-3"><p className="tabular font-display text-[18px] font-extrabold text-brand">{avg ? avg.toFixed(1) : "—"}</p><p className="text-[9px] text-muted">Ort. render ms</p></div>
          <div className="rounded-xl bg-white/[.04] p-3"><p className="tabular font-display text-[18px] font-extrabold text-warn">{samples.length}</p><p className="text-[9px] text-muted">Örnek</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant={enabled ? "danger" : "primary"} size="sm" onClick={() => setEnabled(!enabled)}><Activity size={12} /> {enabled ? "Ölçümü Durdur" : "Ölçümü Başlat"}</Button>
          <Button variant="outline" size="sm" onClick={clear}>Temizle</Button>
        </div>
        {samples.length > 0 && (
          <div className="no-scrollbar mt-4 max-h-40 space-y-1 overflow-y-auto">
            {[...samples].reverse().map((sample, index) => (
              <div key={`${sample.at}-${index}`} className="flex items-center justify-between rounded-lg bg-white/[.03] px-2.5 py-1.5 text-[9.5px]">
                <span className="font-bold text-paper/80">{sample.id}</span>
                <span className="text-muted">{sample.phase}</span>
                <span className="tabular text-lime">{sample.actualDuration.toFixed(2)} ms</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <SectionTitle>Bağlantı durumu</SectionTitle>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-white/[.04] p-3"><p className="text-[10px] text-muted">Durum</p><p className="mt-1 text-[12px] font-bold">{live.status}</p></div>
          <div className="rounded-xl bg-white/[.04] p-3"><p className="text-[10px] text-muted">Ping</p><p className="mt-1 tabular text-[12px] font-bold">{live.stats.rttMs || "—"} ms</p></div>
          <div className="rounded-xl bg-white/[.04] p-3"><p className="text-[10px] text-muted">Paket kaybı</p><p className="mt-1 tabular text-[12px] font-bold">{live.stats.packetLoss}%</p></div>
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-muted">Detaylı bağlantı geçmişi Ses ve Video → LiveKit Bağlantısı panelinde.</p>
      </Card>
    </Panel>
  );
}

const panels: Record<string, React.ComponentType> = {
  "Profilim": ProfilePanel, "Hesap": AccountPanel, "Gizlilik": PrivacyPanel, "Bildirimler": NotificationPanel,
  "Görünüm": AppearancePanel, "Ses ve Video": AudioPanel, "Performans": PerformancePanel, "Dil": LanguagePanel,
  "Klavye Kısayolları": ShortcutsPanel, "Depolama": StoragePanel, "Tehlikeli Bölge": DangerPanel,
};

export function Settings() {
  const section = useApp((s) => s.settingsSection);
  const setSection = useApp((s) => s.setSettingsSection);
  const setView = useApp((s) => s.setView);
  const Active = panels[section] ?? ProfilePanel;

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[.06] px-4">
        <button onClick={() => setView("app")} className="icon-btn"><ArrowLeft size={16} /></button>
        <span className="font-display text-[13px] font-extrabold">Ayarlar</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[10.5px] text-muted sm:inline">Değişiklikler anında kaydedilir</span>
          <Button size="sm" onClick={() => toast.success("Tüm değişiklikler kaydedildi")}><Save size={13} /> Kaydet</Button>
        </div>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1040px] flex-col gap-6 px-5 py-7 md:flex-row">
          <nav className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto md:w-[220px] md:flex-col md:overflow-visible">
            {menu.map((group) => (
              <div key={group.group}>
                <p className="category-label !mt-4 !px-3 md:!mt-0">{group.group}</p>
                <div className="mt-1 flex gap-1 md:flex-col">
                  {group.items.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => setSection(item.label)}
                      className={cn(
                        "flex shrink-0 items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[12px] font-bold transition",
                        section === item.label ? "bg-brand/15 text-paper shadow-[inset_0_0_0_1px_hsl(var(--brand)/.35)]" : "text-muted hover:bg-white/[.05] hover:text-paper",
                        item.danger && "text-danger/80",
                      )}
                    >
                      <item.icon size={15} className={section === item.label ? "text-brand" : ""} />
                      <span className="whitespace-nowrap">{item.label}</span>
                      {item.badge && <span className="ml-auto grid h-[17px] min-w-[17px] place-items-center rounded-full bg-danger px-1 text-[9px] font-black text-white">{item.badge}</span>}
                      <ChevronRight size={12} className="ml-auto md:hidden" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="min-w-0 flex-1 pb-16"><Active /></div>
        </div>
      </div>
    </div>
  );
}
