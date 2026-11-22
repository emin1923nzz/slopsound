import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import {
  User, AtSign, Shield, Bell, Palette, Mic2, Languages, Keyboard, HardDrive, TriangleAlert,
  Check, Camera, LogOut, Monitor, MonitorUp, Sparkles, ChevronRight, ArrowLeft, Save, Compass,
  Circle, RefreshCw, AppWindow, Radio, Download, Image as ImageIcon, Gamepad2, Music2, Activity, Focus, Link2, Youtube, Boxes, MousePointer2, ShieldCheck,
  Server as ServerIcon, Plus, UserPlus, Hash, Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { useApp, type Accent, type Language, type NotificationPrefs, type Theme } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { INVITE_BASE_URL } from "@/lib/config";
import { copyText } from "@/lib/native";
import { useAudio } from "@/lib/audio";
import { useVideo, resolutions, fpsOptions, qualityOptions, codecOptions } from "@/lib/video";
import { useLiveKit } from "@/lib/livekit";
import { useRecording } from "@/lib/recording";
import { getAutostart, nativeCaptureStatus, notify, setAutostart, type NativeCaptureStatus } from "@/lib/native";
import { shortcutLabels, useShortcuts, type ShortcutAction } from "@/lib/shortcuts";
import { ConnectionState } from "livekit-client";
import { usePerf } from "@/lib/perf";
import { cn } from "@/lib/utils";
import { Badge, Button, Input, SectionTitle, Switch, Textarea } from "./ui";
import { BadgeChips } from "./BadgeChips";
import { SlopAvatar } from "./SlopAvatar";
import { api } from "@/lib/api";

type MenuItem = { label: string; icon: React.ElementType; badge?: string; danger?: boolean };
const menu: { group: string; items: MenuItem[] }[] = [
  { group: "KULLANICI AYARLARI", items: [
    { label: "Profilim", icon: User }, { label: "Hesap", icon: AtSign }, { label: "AI Asistan", icon: Sparkles }, { label: "Gizlilik", icon: Shield }, { label: "Bildirimler", icon: Bell },
  ] },
  { group: "SUNUCU", items: [
    { label: "Sunucu Yönetimi", icon: ServerIcon },
    { label: "Keşfet", icon: Compass },
  ] },
  { group: "UYGULAMA", items: [
    { label: "Görünüm", icon: Palette }, { label: "Ses ve Video", icon: Mic2 }, { label: "Performans", icon: Activity }, { label: "Dil", icon: Languages },
    { label: "Entegrasyonlar", icon: Link2 }, { label: "Uzaktan Kontrol", icon: MousePointer2 }, { label: "Klavye Kısayolları", icon: Keyboard }, { label: "Depolama", icon: HardDrive }, { label: "Tehlikeli Bölge", icon: TriangleAlert, danger: true },
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
  return <div id={id} className={cn("glass glass-card rounded-panel p-5", className)}>{children}</div>;
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

type ProfilePatch = Partial<ReturnType<typeof useApp.getState>["profile"]>;
type QueueKey = "displayName" | "username" | "other";
const queueKeys: QueueKey[] = ["displayName", "username", "other"];
const MAX_PROFILE_IMAGE_BYTES = 8 * 1024 * 1024;
const PROFILE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function isValidDisplayName(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 && Array.from(trimmed).length <= 50 && !/[\u0000-\u001F\u007F]/.test(trimmed);
}

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_]{3,32}$/.test(value.trim());
}

export function resizeProfileImage(file: File, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        if (!image.width || !image.height) throw new Error("Görsel okunamadı");
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Görsel işlenemedi");
        const scale = Math.max(width / image.width, height / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
        const preferred = file.type === "image/webp" ? "image/webp" : "image/jpeg";
        let dataUrl = canvas.toDataURL(preferred, 0.8);
        if (preferred === "image/webp" && !dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        }
        resolve(dataUrl);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Görsel işlenemedi"));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Görsel okunamadı"));
    };
    image.src = objectUrl;
  });
}

function ProfilePanel() {
  const profile = useApp((s) => s.profile);
  const badges = useApp((s) => s.user?.badges ?? []);
  const updateProfile = useApp((s) => s.updateProfile);
  const activityData = useApp((s) => s.activityData);
  const [draft, setDraft] = useState(profile);
  const [fieldError, setFieldError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const timers = useRef<Record<QueueKey, number | undefined>>({ displayName: undefined, username: undefined, other: undefined });
  const pending = useRef<Record<QueueKey, ProfilePatch>>({ displayName: {}, username: {}, other: {} });

  useEffect(() => {
    setDraft({
      ...profile,
      ...pending.current.displayName,
      ...pending.current.username,
      ...pending.current.other,
    });
  }, [profile]);

  const flush = useCallback(async (key: QueueKey) => {
    const patch = pending.current[key];
    if (!Object.keys(patch).length) return;
    pending.current[key] = {};
    const ok = await updateProfile(patch);
    toast[ok ? "success" : "error"](ok ? "Profil güncellendi" : useApp.getState().error ?? "Profil güncellenemedi");
  }, [updateProfile]);

  useEffect(() => () => {
    queueKeys.forEach((key) => {
      window.clearTimeout(timers.current[key]);
      void flush(key);
    });
  }, [flush]);

  function queue(key: QueueKey, patch: ProfilePatch) {
    setDraft((current) => ({ ...current, ...patch }));
    pending.current[key] = { ...pending.current[key], ...patch };
    window.clearTimeout(timers.current[key]);
    timers.current[key] = window.setTimeout(() => { void flush(key); }, 450);
  }

  async function saveNow(patch: ProfilePatch) {
    window.clearTimeout(timers.current.other);
    pending.current.other = { ...pending.current.other, ...patch };
    setDraft((current) => ({ ...current, ...patch }));
    await flush("other");
  }

  function queueDisplayName(value: string) {
    const valid = isValidDisplayName(value);
    setFieldError(valid ? "" : "Görünen ad 1-50 karakter olmalı.");
    if (valid) queue("displayName", { displayName: value.trim() });
  }

  function queueUsername(value: string) {
    const clean = value.trim();
    const valid = isValidUsername(clean);
    setFieldError(valid ? "" : "Kullanıcı adı 3-32 karakter olmalı; yalnızca a-z, 0-9 ve _ kullanılabilir.");
    if (valid) queue("username", { name: clean });
  }

  async function uploadImage(file: File | undefined, target: "avatar" | "banner") {
    if (!file) return;
    if (!PROFILE_IMAGE_TYPES.includes(file.type)) {
      const message = "PNG, JPG, WebP veya GIF seçmelisin";
      setMediaError(message);
      toast.error(message);
      return;
    }
    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      const message = "Görsel boyutu en fazla 8 MB olabilir";
      setMediaError(message);
      toast.error(message);
      return;
    }
    setUploading(target);
    setMediaError("");
    try {
      const dataUrl = target === "avatar"
        ? await resizeProfileImage(file, 256, 256)
        : await resizeProfileImage(file, 1280, 360);
      await saveNow(target === "avatar" ? { avatarUrl: dataUrl } : { bannerUrl: dataUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Görsel yüklenemedi";
      setMediaError(message);
      toast.error(message);
    } finally {
      setUploading(null);
    }
  }

  const displayName = draft.displayName || draft.name;
  const bannerStyle = draft.bannerUrl
    ? draft.bannerUrl.startsWith("linear-gradient")
      ? { background: draft.bannerUrl }
      : { backgroundImage: `url("${draft.bannerUrl}")` }
    : { background: `linear-gradient(120deg, ${draft.color}55, transparent 60%), radial-gradient(circle at 80% 20%, #C9F25B33, transparent 50%)` };

  return (
    <Panel title="Profilim" description="Diğer kullanıcılar seni böyle görür. Değişiklikler anında önizlemede görünür.">
      <Card>
        <SectionTitle>Önizleme</SectionTitle>
        <div className="mt-4 overflow-hidden rounded-card border border-white/[.06] bg-black/20">
          <div className="h-24 w-full bg-cover bg-center" style={bannerStyle} />
          <div className="-mt-8 flex flex-wrap items-end gap-4 p-5 pt-0">
          <SlopAvatar name={displayName} src={draft.avatarUrl} size={64} status={draft.status} showDot className="ring-4 ring-[#17141f]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="max-w-full break-words font-display text-[17px] font-extrabold">{displayName}</p>
              {draft.title && <span className="max-w-full break-words rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[9px] font-bold text-brand">{draft.title}</span>}
            </div>
            <p className="break-words text-[11.5px] text-muted">{displayName} @{draft.name}#{profile.tag} • <span style={{ color: draft.color }}>{draft.customStatus}</span></p>
            {draft.activity && <p className="mt-1 flex items-center gap-1.5 break-words text-[10.5px] text-lime"><Radio size={11} /> {draft.activity}</p>}
            <p className="mt-2 max-w-md break-words text-[12px] text-paper/75">{draft.bio}</p>
            {badges.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5"><BadgeChips badges={badges} /></div>}
          </div>
          <Button variant="outline" size="sm" onClick={() => document.getElementById("media-url")?.scrollIntoView({ behavior: "smooth" })}><Camera size={13} /> Görsel / Banner Seç</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <div className="min-w-0">
            <SectionTitle>Görünen ad</SectionTitle>
            <Input aria-label="Görünen ad" value={draft.displayName} maxLength={50} onChange={(e) => queueDisplayName(e.target.value)} onBlur={() => { if (fieldError) toast.error(fieldError); }} className="mt-2 min-w-0" placeholder="Adın Soyadın" />
            <p className="mt-1.5 break-words text-[10.5px] text-muted">Unicode ve boşluk destekli, 1-50 karakter. Önizlemede ve dock’ta görünür.</p>
          </div>
          <div className="min-w-0">
            <SectionTitle>Kullanıcı adı / @handle</SectionTitle>
            <Input aria-label="Kullanıcı adı / @handle" value={draft.name} maxLength={32} onChange={(e) => queueUsername(e.target.value)} onBlur={() => { if (fieldError) toast.error(fieldError); }} className="mt-2 min-w-0" placeholder="kullanici_adi" />
            <p className="mt-1.5 break-words text-[10.5px] text-muted">3-32 karakter; yalnızca a-z, 0-9 ve _. Geçerli olunca kaydedilir.</p>
          </div>
          <div className="min-w-0 xl:col-span-2">
            <SectionTitle>Etiket</SectionTitle>
            <Input value={`#${profile.tag}`} disabled className="mt-2 min-w-0 opacity-60" />
            <p className="mt-1.5 text-[10.5px] text-muted">Etiketin sabit, değiştirilemez.</p>
          </div>
        </div>
        {fieldError && <p className="mt-2 break-words text-[10.5px] text-danger">{fieldError}</p>}
        <div className="mt-5">
          <SectionTitle>Hitap / Unvan</SectionTitle>
          <Input value={draft.title} maxLength={60} onChange={(e) => queue("other", { title: e.target.value })} className="mt-2 min-w-0" placeholder="Örn. Oyun Kurucu, Owner, Tasarımcı" />
          <p className="mt-1.5 text-[10.5px] text-muted">Adının yanında rozet gibi görünür.</p>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between gap-2"><SectionTitle>Hakkımda</SectionTitle><span className="tabular text-[10px] text-muted">{draft.bio.length} / 190</span></div>
          <Textarea value={draft.bio} maxLength={190} onChange={(e) => queue("other", { bio: e.target.value })} className="mt-2" rows={3} />
        </div>
        <div className="mt-5">
          <SectionTitle>Durumun</SectionTitle>
          <div className="mt-2"><Chips options={["Çevrimiçi", "Boşta", "Rahatsız Etme", "Görünmez"]} value={{ online: "Çevrimiçi", idle: "Boşta", dnd: "Rahatsız Etme", offline: "Görünmez" }[draft.status]} onChange={(v) => { void saveNow({ status: ({ "Çevrimiçi": "online", "Boşta": "idle", "Rahatsız Etme": "dnd", "Görünmez": "offline" } as const)[v] }); }} /></div>
        </div>
        <div className="mt-5">
          <SectionTitle>Özel durum mesajı</SectionTitle>
          <Input value={draft.customStatus} onChange={(e) => queue("other", { customStatus: e.target.value })} className="mt-2 min-w-0" />
          <p className="mt-1.5 text-[10.5px] text-muted">Profilinde adının altında görünür.</p>
        </div>
        <div className="mt-5">
          <SectionTitle>Profil rengi</SectionTitle>
          <div className="mt-3 flex flex-wrap gap-3">
            {profileColors.map((color) => (
              <button
                key={color}
                onClick={() => { void saveNow({ color }); }}
                className={cn("grid h-10 w-10 place-items-center rounded-full border-2 transition hover:scale-110", draft.color === color ? "border-paper" : "border-transparent")}
                style={{ background: color }}
              >
                {draft.color === color && <Check size={15} className="text-ink" />}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card id="media-url">
        <SectionTitle>Profil Görseli ve Banner</SectionTitle>
        <p className="mt-1 break-words text-[11px] leading-relaxed text-muted">PNG, JPG, WebP veya GIF yükle. Avatar 256×256, banner 1280×360 boyutuna ölçeklenir; dosya sınırı 8 MB.</p>
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3">
          <SlopAvatar name={displayName} src={draft.avatarUrl} size={48} />
          <div className="h-12 min-w-[120px] flex-1 rounded-xl border border-white/10 bg-cover bg-center" style={bannerStyle} />
        </div>
        <input
          ref={avatarInput}
          type="file"
          accept={PROFILE_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void uploadImage(file, "avatar"); }}
        />
        <input
          ref={bannerInput}
          type="file"
          accept={PROFILE_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void uploadImage(file, "banner"); }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={uploading !== null} onClick={() => avatarInput.current?.click()}><Camera size={12} /> {uploading === "avatar" ? "Yükleniyor…" : "Avatar yükle"}</Button>
          <Button variant="outline" size="sm" disabled={uploading !== null} onClick={() => bannerInput.current?.click()}><ImageIcon size={12} /> {uploading === "banner" ? "Yükleniyor…" : "Banner yükle"}</Button>
          <Button variant="ghost" size="sm" onClick={() => { void saveNow({ avatarUrl: "", bannerUrl: "" }); }}><ImageIcon size={12} /> Varsayalana Dön</Button>
          <Button variant="outline" size="sm" onClick={() => { void saveNow({ bannerUrl: "" }); }}>Bannerı kaldır</Button>
        </div>
        {mediaError && <p className="mt-2 break-words text-[11px] text-danger">{mediaError}</p>}
        <details className="mt-4 rounded-xl border border-white/[.06] p-3">
          <summary className="cursor-pointer text-[11px] font-bold text-muted">Gelişmiş: görsel URL’leri</summary>
          <div className="mt-3 grid min-w-0 gap-2 xl:grid-cols-2">
            <Input aria-label="Avatar görsel URL" value={draft.avatarUrl} onChange={(e) => queue("other", { avatarUrl: e.target.value })} placeholder="Avatar görsel URL" className="min-w-0" />
            <Input aria-label="Banner görsel URL" value={draft.bannerUrl} onChange={(e) => queue("other", { bannerUrl: e.target.value })} placeholder="Banner görsel URL" className="min-w-0" />
          </div>
        </details>
      </Card>

      <Card>
        <SectionTitle>Rich Presence</SectionTitle>
        <p className="mt-1 break-words text-[11px] leading-relaxed text-muted">Oyun veya müzik durumunu profilinde ve dock’ta göster. Bu alan yalnızca senin seçtiğin bilgiyi paylaşır.</p>
        <div className="mt-4 grid min-w-0 gap-2 xl:grid-cols-2">
          <Input aria-label="Aktivite metni" value={draft.activity} onChange={(e) => queue("other", { activity: e.target.value })} placeholder="Örn. Valorant oynuyor" className="min-w-0" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => { void saveNow({ activity: "Valorant oynuyor" }); }}><Gamepad2 size={12} /> Oyun</Button>
            <Button variant="outline" size="sm" onClick={() => { void saveNow({ activity: "Spotify’da müzik dinliyor" }); }}><Music2 size={12} /> Müzik</Button>
            <Button variant="ghost" size="sm" onClick={() => { void saveNow({ activity: "" }); }}>Temizle</Button>
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

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function AccountPanel() {
  const user = useApp((s) => s.user);
  const refreshBootstrap = useApp((s) => s.refreshBootstrap);
  const [sessions, setSessions] = useState<{ id: string; createdAt: string; expiresAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [twoFa, setTwoFa] = useState<{ secret: string; otpauth: string } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaBusy, setTwoFaBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { setSessions(await api.sessions()); }
    catch { toast.error("Oturumlar yüklenemedi"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function closeSession(id: string) {
    setBusyId(id);
    try {
      await api.deleteSession(id);
      setSessions((list) => list.filter((x) => x.id !== id));
      toast.success("Oturum kapatıldı");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Oturum kapatılamadı"); }
    finally { setBusyId(null); }
  }

  async function setup2fa() {
    setTwoFaBusy(true);
    try { setTwoFa(await api.setup2fa()); setTwoFaCode(""); }
    catch (error) { toast.error(error instanceof Error ? error.message : "2FA başlatılamadı"); }
    finally { setTwoFaBusy(false); }
  }
  async function enable2fa() {
    if (!twoFaCode.trim()) return;
    setTwoFaBusy(true);
    try {
      await api.enable2fa(twoFaCode.trim());
      setTwoFa(null); setTwoFaCode("");
      await refreshBootstrap();
      toast.success("2FA etkinleştirildi");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Kod doğrulanamadı"); }
    finally { setTwoFaBusy(false); }
  }
  async function disable2fa() {
    if (!twoFaCode.trim()) return;
    setTwoFaBusy(true);
    try {
      await api.disable2fa(twoFaCode.trim());
      setTwoFa(null); setTwoFaCode("");
      await refreshBootstrap();
      toast.success("2FA kapatıldı");
    } catch (error) { toast.error(error instanceof Error ? error.message : "2FA kapatılamadı"); }
    finally { setTwoFaBusy(false); }
  }

  return (
    <Panel title="Hesap" description="E-posta, şifre ve oturum yönetimi.">
      <Card>
        <Row icon={AtSign} title="E-posta" description={user?.email ? maskEmail(user.email) : "—"}><span /></Row>
        <div className="border-t border-white/[.06] pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12.5px] font-bold">İki faktörlü doğrulama</p>
              <p className="mt-0.5 text-[11px] text-muted">Doğrulayıcı uygulamanla QR kodu tara ve kodu gir.</p>
            </div>
            <Badge className={user?.totpEnabled ? "border-lime/30 bg-lime/10 text-lime" : "border-white/10 bg-white/[.04] text-muted"}>
              {user?.totpEnabled ? "Aktif" : "Kapalı"}
            </Badge>
          </div>
          {!user?.totpEnabled && !twoFa && (
            <div className="mt-3"><Button variant="outline" size="sm" disabled={twoFaBusy} onClick={() => void setup2fa()}>QR Oluştur</Button></div>
          )}
          {twoFa && !user?.totpEnabled && (
            <div className="mt-4 space-y-3 rounded-2xl border border-brand/20 bg-brand/[.05] p-4">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <div className="rounded-xl bg-white p-2"><QRCodeSVG value={twoFa.otpauth} size={140} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted">QR okuyamazsan bu anahtarı elle gir:</p>
                  <code className="mt-1 block break-all rounded-lg bg-black/20 px-2 py-1 text-[10px] text-paper">{twoFa.secret}</code>
                </div>
              </div>
              <div className="flex gap-2">
                <Input value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value)} placeholder="6 haneli kod" inputMode="numeric" className="max-w-[180px]" />
                <Button size="sm" disabled={twoFaBusy || twoFaCode.trim().length < 6} onClick={() => void enable2fa()}>Doğrula ve Aç</Button>
              </div>
            </div>
          )}
          {user?.totpEnabled && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value)} placeholder="Kapatmak için kod" inputMode="numeric" className="max-w-[180px]" />
              <Button variant="danger" size="sm" disabled={twoFaBusy || twoFaCode.trim().length < 6} onClick={() => void disable2fa()}>2FA Kapat</Button>
            </div>
          )}
        </div>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div>
            <SectionTitle>Oturumlar</SectionTitle>
            <p className="mt-1 text-[11px] text-muted">Hesabının açık oturumları.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw size={13} /> Yenile</Button>
        </div>
        <div className="mt-4 space-y-2">
          {loading ? <p className="text-[11px] text-muted">Yükleniyor...</p>
          : sessions.length === 0 ? <p className="text-[11px] text-muted">Açık oturum bulunamadı.</p>
          : sessions.map((session) => (
            <div key={session.id} className="flex items-center gap-3 rounded-card bg-white/[.04] p-3">
              <Monitor size={17} className="text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold">Oturum {session.id.slice(0, 8)}</p>
                <p className="text-[10px] text-muted">Oluşturma: {new Date(session.createdAt).toLocaleString("tr-TR")} • Bitiş: {new Date(session.expiresAt).toLocaleString("tr-TR")}</p>
              </div>
              <Button variant="ghost" size="sm" disabled={busyId === session.id} onClick={() => void closeSession(session.id)}>Kapat</Button>
            </div>
          ))}
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
  const prefs = useApp((s) => s.notificationPrefs);
  const setPrefs = useApp((s) => s.setNotificationPrefs);
  const patch = (value: Partial<NotificationPrefs>) => setPrefs(value);
  return (
    <Panel title="Bildirimler" description="Ne zaman ses çıksın, ne zaman sessiz kalsın.">
      <Card>
        <ToggleRow icon={Bell} title="DM bildirimleri" description="Biri sana yazınca bildirim gelsin." checked={prefs.dm} onCheckedChange={(dm) => patch({ dm })} />
        <ToggleRow icon={AtSign} title="Etiketlenme (@) bildirimleri" description="Biri seni etiketleyince." checked={prefs.mention} onCheckedChange={(mention) => patch({ mention })} />
        <ToggleRow icon={User} title="Sunucu bildirimleri" description="Tüm sunuculardan bildirim al." checked={prefs.server} onCheckedChange={(server) => patch({ server })} />
        <ToggleRow icon={Bell} title="Ses" description="Bildirim sesi çalsın." checked={prefs.sound} onCheckedChange={(sound) => patch({ sound })} />
        <ToggleRow icon={Monitor} title="Masaüstü bildirimi" description="Uygulama odakta değilken sistem bildirimi göster." checked={prefs.desktop} onCheckedChange={(desktop) => patch({ desktop })} />
      </Card>
      <Card>
        <SectionTitle>Rahatsız etme saatleri</SectionTitle>
        <div className="mt-3"><Chips options={["Kapalı", "23:00 - 08:00", "00:00 - 09:00"]} value={prefs.quiet} onChange={(quiet) => patch({ quiet })} /></div>
        <p className="mt-2 text-[10.5px] text-muted">Bu saatlerde masaüstü bildirimi ve bildirim sesi gelmez.</p>
      </Card>
      <Card>
        <Row icon={Bell} title="Test bildirimi" description="Masaüstü bildirim sistemini doğrula.">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { void notify("SlopSound", "Bildirim ayarları çalışıyor.").then(() => toast.success("Test bildirimi gönderildi")); }}>Gönder</Button>
            <Button variant="ghost" size="sm" onClick={() => { toast.success("Uygulama içi bildirim örneği"); useAudio.getState().playSound("mention"); }}>Uygulama içi</Button>
          </div>
        </Row>
      </Card>
    </Panel>
  );
}

function AppearancePanel() {
  const restartTutorial = useApp((s) => s.restartTutorial);
  const accent = useApp((s) => s.accent);
  const setAccent = useApp((s) => s.setAccent);
  const density = useApp((s) => s.density);
  const setDensity = useApp((s) => s.setDensity);
  const reduceMotion = useApp((s) => s.reduceMotion);
  const setReduceMotion = useApp((s) => s.setReduceMotion);
  const focusMode = useApp((s) => s.focusMode);
  const toggleFocusMode = useApp((s) => s.toggleFocusMode);
  const uiScale = useApp((s) => s.uiScale);
  const setUiScale = useApp((s) => s.setUiScale);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const t = useT();
  const themes: { id: Theme; label: string; swatch: string }[] = [
    { id: "dark-violet", label: "Koyu + Mor", swatch: "linear-gradient(135deg,#17141f,#8B6CFF)" },
    { id: "light", label: "Açık", swatch: "linear-gradient(135deg,#f7f5ff,#d9d2ff)" },
    { id: "yellow-black", label: "Sarı Siyah", swatch: "linear-gradient(135deg,#0d0c05,#ffd60a)" },
    { id: "system", label: "Sisteme Uysun", swatch: "linear-gradient(135deg,#17141f 50%,#f7f5ff 50%)" },
  ];
  const fontSizes = [
    { label: "Küçük", value: 0.85 },
    { label: "Normal", value: 1 },
    { label: "Büyük", value: 1.12 },
    { label: "Çok Büyük", value: 1.25 },
  ];
  return (
    <Panel title="Görünüm" description="SlopSound sana nasıl görünsün.">
      <Card>
        <SectionTitle>{t("Tema")}</SectionTitle>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {themes.map((item) => (
            <button
              key={item.id}
              onClick={() => { setTheme(item.id); toast(`${t("Tema")}: ${t(item.label)}`); }}
              className={cn(
                "rounded-2xl border p-2 text-left backdrop-blur-xl transition",
                theme === item.id ? "border-brand/50 bg-brand/10 shadow-[inset_0_0_0_1px_hsl(var(--brand)/.25)]" : "border-white/[.08] bg-white/[.03] hover:border-brand/30 hover:bg-white/[.06]",
              )}
            >
              <span className="block h-10 rounded-xl border border-white/10" style={{ background: item.swatch }} />
              <span className="mt-2 block truncate text-[10.5px] font-bold">{t(item.label)}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] text-muted">RGB yok, sade. Renkleri aşağıdan özelleştirebilirsin.</p>
        <SectionTitle className="!mt-6">{t("Vurgu rengi")}</SectionTitle>
        <div className="mt-3 flex flex-wrap gap-3">
          {accents.map((a) => (
            <button key={a.id} onClick={() => setAccent(a.id)} className={cn("flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-bold transition", accent === a.id ? "border-paper/40 bg-white/[.08]" : "border-white/[.08] text-muted hover:bg-white/[.05]")}>
              <span className="h-4 w-4 rounded-full" style={{ background: a.color }} />{a.label}
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <SectionTitle>{t("Arayüz ölçeği")}</SectionTitle>
        <div className="mt-3"><Chips options={fontSizes.map((size) => size.label)} value={fontSizes.find((size) => size.value === uiScale)?.label ?? "Normal"} onChange={(label) => { const next = fontSizes.find((size) => size.label === label); if (next) setUiScale(next.value); }} /></div>
        <div className="mt-5">
          <ToggleRow icon={Palette} title={t("Yoğunluk")} description="Mesajlar daha sıkı görünür, daha çok mesaj sığar." checked={density === "compact"} onCheckedChange={(v) => setDensity(v ? "compact" : "comfortable")} />
          <ToggleRow icon={Palette} title={t("Hareketi azalt")} description="Animasyonları kapat, daha hızlı hissettir." checked={reduceMotion} onCheckedChange={setReduceMotion} />
          <ToggleRow icon={Focus} title={t("Odak modu")} description="Okunmayan rozetlerini gizler, dikkatini dağıtmaz." checked={focusMode} onCheckedChange={toggleFocusMode} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={restartTutorial}>{t("Tekrar göster")}</Button>
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
  const language = useApp((s) => s.language);
  const setLanguage = useApp((s) => s.setLanguage);
  const autoTranslate = useApp((s) => s.autoTranslate);
  const setAutoTranslate = useApp((s) => s.setAutoTranslate);
  const t = useT();
  const languages: { id: Language; label: string }[] = [
    { id: "tr", label: "Türkçe" }, { id: "en", label: "English" }, { id: "de", label: "Deutsch" }, { id: "fr", label: "Français" },
  ];
  const current = languages.find((item) => item.id === language) ?? languages[0];
  return (
    <Panel title={t("Dil")} description="SlopSound hangi dilde konuşsun.">
      <Card>
        <SectionTitle>{t("Uygulama dili")}</SectionTitle>
        <div className="mt-3">
          <Chips
            options={languages.map((item) => t(item.label))}
            value={t(current.label)}
            onChange={(label) => {
              const next = languages.find((item) => t(item.label) === label);
              if (next) setLanguage(next.id);
            }}
          />
        </div>
        <div className="mt-4">
          <ToggleRow
            icon={Languages}
            title={t("Otomatik çeviri")}
            description={t("Gelen mesajları seçtiğin dile çevirir.")}
            checked={autoTranslate}
            onCheckedChange={setAutoTranslate}
          />
        </div>
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
        <Row icon={Download} title="Güncellemeleri denetle" description="Yeni sürüm varsa indirir ve yeniden başlatır.">
          <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new CustomEvent("slopsound:check-update"))}>Denetle</Button>
        </Row>
        <p className="mt-2 text-[9.5px] text-muted/70">Sistem tepsisi, pencere yönetimi ve otomatik güncelleme aktif.</p>
      </Card>
    </Panel>
  );
}

function StoragePanel() {
  return (
    <Panel title="Depolama" description="Depolama ve yerel veriler.">
      <Card>
        <SectionTitle>Depolama kullanımı</SectionTitle>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">Depolama kullanım verisi şu anda mevcut değil.</p>
      </Card>
    </Panel>
  );
}

function DangerPanel() {
  const logout = useApp((s) => s.logout);
  const [confirmDisable, setConfirmDisable] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  async function logoutOthers() {
    try {
      const result = await api.deleteAllSessions();
      toast.success(`${result.removed} oturum kapatıldı`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Oturumlar kapatılamadı"); }
  }
  async function disableAccount() {
    if (confirmDisable !== "DEVRE DISI") { toast.error('Onay için "DEVRE DISI" yaz'); return; }
    try { await api.disableAccount(); toast.success("Hesap devre dışı bırakıldı"); await logout(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "İşlem başarısız"); }
  }
  async function deleteAccount() {
    if (confirmDelete !== "SIL") { toast.error('Onay için "SIL" yaz'); return; }
    try { await api.deleteAccount(); toast.success("Hesap silindi"); await logout(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "İşlem başarısız"); }
  }

  return (
    <Panel title="Tehlikeli Bölge" description="Dikkat, bunlar geri alınamaz.">
      <Card className="border-danger/20">
        <div className="space-y-4">
          <div className="rounded-2xl border border-danger/20 bg-danger/[.04] p-4">
            <p className="text-[12.5px] font-bold text-danger">Hesabı devre dışı bırak</p>
            <p className="mt-1 text-[11px] text-muted">Hesabın kapatılır, oturumların sonlandırılır. Onay için <b>DEVRE DISI</b> yaz.</p>
            <div className="mt-3 flex gap-2"><Input value={confirmDisable} onChange={(e) => setConfirmDisable(e.target.value)} placeholder="DEVRE DISI" className="max-w-[180px]" /><Button variant="danger" size="sm" onClick={() => void disableAccount()}>Devre Dışı Bırak</Button></div>
          </div>
          <div className="rounded-2xl border border-danger/20 bg-danger/[.04] p-4">
            <p className="text-[12.5px] font-bold text-danger">Hesabı kalıcı olarak sil</p>
            <p className="mt-1 text-[11px] text-muted">Hesap ve ilişkili veriler silinir. Onay için <b>SIL</b> yaz.</p>
            <div className="mt-3 flex gap-2"><Input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder="SIL" className="max-w-[180px]" /><Button variant="danger" size="sm" onClick={() => void deleteAccount()}>Kalıcı Sil</Button></div>
          </div>
          <Row icon={LogOut} title="Diğer cihazlardan çıkış yap" description="Bu cihazdaki oturum açık kalır, diğer oturumlar kapatılır."><Button variant="danger" size="sm" onClick={() => void logoutOthers()}>Diğer Oturumları Kapat</Button></Row>
        </div>
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

const integrations = [
  { id: "youtube", label: "YouTube", icon: Youtube, hint: "Kanalını veya oynatma listeni profiline bağla.", prefix: "YouTube'da" },
  { id: "spotify", label: "Spotify", icon: Music2, hint: "Dinlediğin müziği profil durumuna yansıt.", prefix: "Spotify'da dinliyor" },
  { id: "apple-music", label: "Apple Music", icon: Music2, hint: "Apple Music profilini bağla.", prefix: "Apple Music'te dinliyor" },
  { id: "steam", label: "Steam", icon: Gamepad2, hint: "Oynadığın oyunu profil durumuna yansıt.", prefix: "Steam'de oynuyor" },
  { id: "roblox", label: "Roblox", icon: Boxes, hint: "Roblox profilini ve oyun durumunu bağla.", prefix: "Roblox'ta oynuyor" },
];

function IntegrationsPanel() {
  const user = useApp((s) => s.user);
  const updateProfile = useApp((s) => s.updateProfile);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({
    youtube: user?.youtubeUrl ?? "", spotify: user?.spotifyUrl ?? "", "apple-music": user?.appleMusicUrl ?? "", steam: user?.steamUrl ?? "", roblox: user?.robloxUrl ?? "",
  });
  useEffect(() => {
    setDraft({ youtube: user?.youtubeUrl ?? "", spotify: user?.spotifyUrl ?? "", "apple-music": user?.appleMusicUrl ?? "", steam: user?.steamUrl ?? "", roblox: user?.robloxUrl ?? "" });
  }, [user?.youtubeUrl, user?.spotifyUrl, user?.appleMusicUrl, user?.steamUrl, user?.robloxUrl]);

  async function save(id: string, label: string, prefix: string) {
    const value = (draft[id] ?? "").trim();
    if (value && !/^https?:\/\//i.test(value)) { toast.error("Geçerli bir bağlantı gir"); return; }
    setBusy(id);
    const patch: Record<string, string> = {
      youtube: "youtubeUrl", spotify: "spotifyUrl", "apple-music": "appleMusicUrl", steam: "steamUrl", roblox: "robloxUrl",
    };
    const payload: Record<string, string> = { [patch[id]]: value };
    if (value) payload.activity = `${prefix}: ${label}`;
    const ok = await updateProfile(payload as any);
    setBusy(null);
    if (ok) toast.success(value ? `${label} bağlandı` : `${label} bağlantısı kaldırıldı`);
  }

  return (
    <Panel title="Entegrasyonlar" description="Profil bağlantılarını kaydet. Bağladığında durumun profilinde görünür.">
      <Card>
        <div className="space-y-1">
          {integrations.map(({ id, label, icon: Icon, hint, prefix }) => {
            const value = draft[id] ?? "";
            const connected = Boolean((user as any)?.[id === "apple-music" ? "appleMusicUrl" : `${id}Url`]);
            return (
              <div key={id} className="flex flex-col gap-2 border-b border-white/[.06] py-4 last:border-0 sm:flex-row sm:items-center">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] bg-brand/12 text-brand"><Icon size={16} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold">{label} {connected && <span className="ml-1 rounded-full bg-lime/15 px-1.5 py-0.5 text-[8px] font-black text-lime">BAĞLI</span>}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
                </div>
                <div className="flex gap-2">
                  <Input aria-label={`${label} profil bağlantısı`} value={value} onChange={(e) => setDraft((current) => ({ ...current, [id]: e.target.value }))} placeholder="https://..." className="w-full sm:w-[220px]" />
                  <Button variant="outline" size="sm" disabled={busy === id} onClick={() => void save(id, label, prefix)}>{busy === id ? "..." : "Kaydet"}</Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </Panel>
  );
}

function RemoteControlPanel() {
  const remote = useApp((s) => s.remoteControl);
  const setRemote = useApp((s) => s.setRemoteControl);
  const live = useLiveKit((s) => s.remoteControl);

  function copyCode() { void navigator.clipboard?.writeText(remote.code); toast.success("Kod kopyalandı"); }
  function regenerate() { setRemote({ code: Math.random().toString(36).slice(2, 8).toUpperCase() }); toast.success("Yeni kod oluşturuldu"); }

  return (
    <Panel title="Uzaktan Kontrol" description="Ekran paylaşımı sırasında kontrol izni. Gerçek kontrol sinyali LiveKit veri kanalıyla gönderilir.">
      <Card>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/20 bg-brand/[.07] p-4">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand/15 text-brand"><MousePointer2 size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-extrabold">Oturum kodu</p>
            <p className="mt-0.5 text-[11px] text-muted">Bu kod cihazını tanımlar. Aktif paylaşımda “Kontrol iste” butonu kullanılır.</p>
          </div>
          <code className="rounded-xl bg-black/30 px-3 py-2 font-display text-[15px] font-black tracking-[.2em] text-brand">{remote.code}</code>
          <Button variant="outline" size="sm" onClick={copyCode}>Kopyala</Button>
          <Button variant="ghost" size="sm" onClick={regenerate}>Yenile</Button>
        </div>
        <div className="mt-4 space-y-1">
          <ToggleRow icon={MousePointer2} title="Uzaktan kontrolü etkinleştir" description="Ekran paylaşırken kontrol isteklerini kabul et." checked={remote.enabled} onCheckedChange={(v) => setRemote({ enabled: v })} />
          <ToggleRow icon={Keyboard} title="Klavye girişine izin ver" description="Katılımcılar klavye olaylarını iletebilir." checked={remote.keyboard} onCheckedChange={(v) => setRemote({ keyboard: v })} />
          <ToggleRow icon={MousePointer2} title="Fare girişine izin ver" description="İmleç hareketi ve tıklamalar iletilebilir." checked={remote.mouse} onCheckedChange={(v) => setRemote({ mouse: v })} />
          <ToggleRow icon={ShieldCheck} title="Sadece yöneticiler" description="Kontrol yetkisini sunucu yöneticileriyle sınırla." checked={remote.adminsOnly} onCheckedChange={(v) => setRemote({ adminsOnly: v })} />
        </div>
        <p className="mt-3 text-[10.5px] text-muted">Canlı durum: {live.active ? `Aktif (${live.controllerName ?? "kontrolcü"})` : "Beklemede"}. OS seviyesinde fare/klavye enjeksiyonu için ek native agent gerekir.</p>
      </Card>
    </Panel>
  );
}

function DiscoverPanel() {
  const [servers, setServers] = useState<Array<{ id: string; name: string; color: string; iconUrl: string; memberCount: number; joined: boolean }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const refreshBootstrap = useApp((s) => s.refreshBootstrap);
  const selectServer = useApp((s) => s.selectServer);
  useEffect(() => { void api.discoverServers().then(setServers).catch(() => setServers([])); }, []);
  async function join(id: string) {
    setBusy(id);
    try {
      await api.joinDiscoverServer(id);
      setServers((current) => current.map((s) => s.id === id ? { ...s, joined: true } : s));
      await refreshBootstrap();
      selectServer(id);
      toast.success("Sunucuya katıldın");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Katılamadın"); }
    finally { setBusy(null); }
  }
  return (
    <Panel title="Keşfet" description="Popüler ve herkese açık sunucuları bul.">
      <Card>
        <div className="space-y-2">
          {servers.length === 0 && <p className="text-[11px] text-muted">Şu an herkese açık sunucu yok.</p>}
          {servers.map((server) => (
            <div key={server.id} className="flex items-center gap-3 rounded-2xl border border-white/[.06] bg-white/[.03] p-3">
              <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl text-[13px] font-black text-white" style={{ background: server.color }}>
                {server.iconUrl ? <img src={server.iconUrl} alt="" className="h-full w-full object-cover" /> : server.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold">{server.name}</p>
                <p className="text-[10.5px] text-muted">{server.memberCount} üye</p>
              </div>
              <Button size="sm" variant={server.joined ? "outline" : "primary"} disabled={server.joined || busy === server.id} onClick={() => void join(server.id)}>
                {server.joined ? "Katıldın" : busy === server.id ? "..." : "Katıl"}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </Panel>
  );
}

function ServerManagementPanel() {
  const activeServer = useApp((s) => s.activeServer);
  const servers = useApp((s) => s.servers);
  const channelGroups = useApp((s) => s.channelGroups);
  const members = useApp((s) => s.members);
  const createChannel = useApp((s) => s.createChannel);
  const createInvite = useApp((s) => s.createInvite);
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice" | "announcement">("text");
  const [group, setGroup] = useState("Kanallar");
  const [newGroup, setNewGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const server = servers.find((item) => item.id === activeServer);
  const visibleGroups = channelGroups.filter((item) => item.channels.some((channel) => channel.serverId === activeServer));

  async function addChannel() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const ok = await createChannel(name.trim(), type, group.trim() || "Kanallar");
    setBusy(false);
    if (ok) { setName(""); toast.success("Kanal oluşturuldu"); }
    else toast.error(useApp.getState().error ?? "Kanal oluşturulamadı");
  }

  async function addGroup() {
    if (!newGroup.trim() || busy) return;
    setBusy(true);
    const ok = await createChannel("genel", "text", newGroup.trim());
    setBusy(false);
    if (ok) { setNewGroup(""); toast.success("Grup oluşturuldu"); }
    else toast.error(useApp.getState().error ?? "Grup oluşturulamadı");
  }

  async function invite() {
    if (!activeServer) return toast.error("Önce bir sunucu seç.");
    const code = await createInvite();
    if (!code) return toast.error(useApp.getState().error ?? "Davet oluşturulamadı");
    try {
      await copyText(`${INVITE_BASE_URL}${code}`);
      toast.success("Davet linki kopyalandı");
    } catch {
      toast.success("Davet oluşturuldu", { description: `${INVITE_BASE_URL}${code}` });
    }
  }

  return (
    <Panel title="Sunucu Yönetimi" description="Kanal, ses odası, grup ve davet linklerini buradan yönet.">
      <Card>
        <SectionTitle>Seçili sunucu</SectionTitle>
        <p className="mt-2 font-display text-[18px] font-extrabold">{server?.name ?? "Sunucu seçilmedi"}</p>
        <p className="mt-1 text-[11px] text-muted">{members.length} üye • {visibleGroups.reduce((sum, item) => sum + item.channels.length, 0)} kanal</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void invite()}><UserPlus size={14} /> Davet linki oluştur ve kopyala</Button>
          <Button variant="outline" onClick={async () => {
            if (!activeServer) return;
            try { await api.updateServer(activeServer, { isPublic: true }); toast.success("Sunucu Keşfet'te görünür"); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Güncellenemedi"); }
          }}>Keşfet'te Yayınla</Button>
        </div>
      </Card>
      <Card>
        <SectionTitle>Yeni kanal veya ses odası</SectionTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Input value={name} maxLength={48} onChange={(event) => setName(event.target.value)} placeholder="Kanal adı" aria-label="Kanal adı" />
          <select value={type} onChange={(event) => setType(event.target.value as typeof type)} aria-label="Kanal türü" className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-[13px] outline-none focus:border-brand/60">
            <option value="text">Yazı kanalı</option>
            <option value="voice">Sesli sohbet</option>
            <option value="announcement">Duyuru</option>
          </select>
          <Input value={group} maxLength={48} onChange={(event) => setGroup(event.target.value)} placeholder="Grup adı" aria-label="Grup adı" />
        </div>
        <Button className="mt-4" disabled={busy || !name.trim()} onClick={() => void addChannel()}><Plus size={14} /> Kanalı oluştur</Button>
      </Card>
      <Card>
        <SectionTitle>Yeni grup kur</SectionTitle>
        <p className="mt-1 text-[11px] text-muted">Yeni grup, kendi kanal grubun olarak görünür.</p>
        <div className="mt-4 flex gap-2">
          <Input value={newGroup} maxLength={48} onChange={(event) => setNewGroup(event.target.value)} placeholder="Grup adı" aria-label="Yeni grup adı" />
          <Button disabled={busy || !newGroup.trim()} onClick={() => void addGroup()}>Grup kur</Button>
        </div>
      </Card>
      <Card>
        <SectionTitle>Kanallar</SectionTitle>
        <div className="mt-4 space-y-4">
          {visibleGroups.length === 0 && <p className="text-[11px] text-muted">Bu sunucuda henüz kanal yok.</p>}
          {visibleGroups.map((item) => (
            <div key={`${activeServer}:${item.label}`}>
              <p className="category-label !mt-0">{item.label}</p>
              <div className="mt-2 space-y-1">
                {item.channels.map((channel) => (
                  <div key={channel.id} className="flex items-center gap-2 rounded-xl bg-white/[.04] px-3 py-2 text-[12px]">
                    {channel.type === "voice" ? <Volume2 size={14} className="text-lime" /> : <Hash size={14} className="text-brand" />}
                    <span className="min-w-0 flex-1 truncate font-bold">{channel.name}</span>
                    <span className="text-[10px] text-muted">{channel.type === "voice" ? "Ses" : "Yazı"}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </Panel>
  );
}

function AIPanel() {
  const t = useT();
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<{ configured: boolean; custom: boolean; model: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [testQuestion, setTestQuestion] = useState("SlopSound'u anlat");
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    let active = true;
    api.aiStatus()
      .then((data) => { if (active) setStatus(data); })
      .catch(() => { if (active) setStatus({ configured: false, custom: false, model: "—" }); });
    return () => { active = false; };
  }, []);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.setAiKey(key.trim() || null);
      setStatus((current) => ({ configured: result.configured, custom: Boolean(key.trim()), model: current?.model ?? "—" }));
      setKey("");
      setAnswer("");
      toast.success(result.configured ? "Groq anahtarı kaydedildi" : "Groq anahtarı kaldırıldı");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Anahtar kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (busy || !testQuestion.trim()) return;
    setBusy(true);
    try {
      const result = await api.askAi(testQuestion.trim());
      setAnswer(result.answer);
      toast.success(result.source === "groq" ? "Groq ile cevap verdi" : "Yerel cevap kullanıldı");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Soru gönderilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={t("AI Asistan")} description="Sloppi'ye kendi Groq anahtarınla gerçek cevaplar verdir.">
      <Card>
        <SectionTitle>{t("Groq API anahtarı")}</SectionTitle>
        <p className="mt-1 text-[11px] text-muted">Anahtar sunucuda saklanır, arayüzde bir daha gösterilmez. Boş bırakıp kaydedersen kaldırılır.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} placeholder="gsk_..." aria-label="Groq API anahtarı" className="min-w-0 flex-1" />
          <Button onClick={() => void save()} disabled={busy}><Save size={13} /> {t("Kaydet")}</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge className={status?.configured ? "border-lime/30 bg-lime/10 text-lime" : "border-white/10 bg-white/[.04] text-muted"}>
            {status?.configured ? t("Aktif") : t("Anahtar yok")}
          </Badge>
          {status?.custom && <Badge className="border-brand/30 bg-brand/10 text-brand">{t("Kişisel anahtar")}</Badge>}
          <span className="text-[10px] text-muted">{t("Model")}: {status?.model ?? "—"}</span>
        </div>
      </Card>
      <Card>
        <SectionTitle>{t("Cevabı dene")}</SectionTitle>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input value={testQuestion} onChange={(event) => setTestQuestion(event.target.value)} placeholder={t("Bir soru sor")} aria-label="AI test sorusu" className="min-w-0 flex-1" />
          <Button variant="outline" onClick={() => void test()} disabled={busy || !testQuestion.trim()}>{t("Sor")}</Button>
        </div>
        {answer && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-white/[.04] p-3 text-[12px] leading-relaxed text-paper/85">{answer}</p>}
      </Card>
    </Panel>
  );
}

const panels: Record<string, React.ComponentType> = {
  "Profilim": ProfilePanel, "Hesap": AccountPanel, "AI Asistan": AIPanel, "Gizlilik": PrivacyPanel, "Bildirimler": NotificationPanel,
  "Sunucu Yönetimi": ServerManagementPanel, "Keşfet": DiscoverPanel,
  "Görünüm": AppearancePanel, "Ses ve Video": AudioPanel, "Performans": PerformancePanel, "Dil": LanguagePanel,
  "Entegrasyonlar": IntegrationsPanel, "Uzaktan Kontrol": RemoteControlPanel, "Klavye Kısayolları": ShortcutsPanel, "Depolama": StoragePanel, "Tehlikeli Bölge": DangerPanel,
};

export function Settings() {
  const section = useApp((s) => s.settingsSection);
  const setSection = useApp((s) => s.setSettingsSection);
  const setView = useApp((s) => s.setView);
  const t = useT();
  const Active = panels[section] ?? ProfilePanel;

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[.06] px-4">
        <button onClick={() => setView("app")} className="icon-btn"><ArrowLeft size={16} /></button>
        <span className="font-display text-[13px] font-extrabold">{t("Ayarlar")}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[10.5px] text-muted sm:inline">{t("Değişiklikler anında kaydedilir")}</span>
        </div>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1040px] flex-col gap-6 px-5 py-7 md:flex-row">
          <nav className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto md:w-[220px] md:flex-col md:overflow-visible">
            {menu.map((group) => (
              <div key={group.group}>
                <p className="category-label !mt-4 !px-3 md:!mt-0">{t(group.group)}</p>
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
                      <span className="whitespace-nowrap">{t(item.label)}</span>
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
