import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, RefreshCw, Check, WifiOff, Router, RotateCw, Activity, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "./ui";
import { SlopLogo } from "./SlopAvatar";
import { API_BASE } from "@/lib/config";

export type HealthStatus = { ok: boolean; maintenance?: boolean; message?: string };

export async function checkHealth(): Promise<HealthStatus> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${API_BASE}/health`, { credentials: "include", signal: controller.signal });
    if (!response.ok) throw new Error(`Sağlık kontrolü başarısız (${response.status})`);
    const data = await response.json() as Partial<HealthStatus>;
    return {
      ok: data.ok === true,
      ...(data.maintenance === true ? { maintenance: true } : {}),
      ...(data.message ? { message: data.message } : {}),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("Sunucu yanıt vermedi");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function formatTime(date: Date | null) {
  return date ? date.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Henüz kontrol edilmedi";
}

function Ambient({ warm }: { warm?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className={cn("absolute -left-16 top-10 h-56 w-56 rounded-full animate-drift", warm ? "bg-warn/[.06]" : "bg-brand/[.08]")} />
      <div className={cn("absolute -right-20 top-1/3 h-80 w-80 rounded-full animate-drift [animation-delay:1.2s]", warm ? "bg-warn/[.05]" : "bg-brand/[.07]")} />
      <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-brand/[.06] animate-drift [animation-delay:2s]" />
    </div>
  );
}

function RobotScene() {
  return (
    <div className="relative mx-auto h-[168px] w-[280px]">
      <div className="absolute bottom-4 left-1/2 h-4 w-[260px] -translate-x-1/2 rounded-full bg-white/[.06]" />
      <div className="absolute left-1/2 top-6 h-[84px] w-[84px] -translate-x-1/2 animate-bob rounded-[22px] bg-raised shadow-float">
        <div className="absolute left-5 top-7 h-3 w-3 animate-blink rounded-full bg-warn" />
        <div className="absolute right-5 top-7 h-3 w-3 animate-blink rounded-full bg-warn" />
        <div className="absolute left-1/2 top-12 h-1.5 w-8 -translate-x-1/2 rounded-full bg-white/25" />
        <div className="absolute -left-5 top-10 h-2.5 w-7 origin-right animate-wave rounded-full bg-white/20" />
        <div className="absolute -right-5 top-10 h-2.5 w-7 origin-left animate-wave rounded-full bg-white/20 [animation-direction:reverse]" />
      </div>
      <div className="absolute right-8 top-4 grid h-12 w-12 animate-spin place-items-center rounded-full bg-brand/20 text-[22px] text-brand">↻</div>
      <div className="absolute left-6 top-2 text-[26px] text-white/20 animate-spin [animation-duration:6s]">○</div>
      <div className="absolute left-16 top-16 text-[18px] text-white/15 animate-spin [animation-duration:4s] [animation-direction:reverse]">○</div>
      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
        {[0, .2, .4].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-duration:1.2s]" style={{ animationDelay: `${d}s` }} />)}
      </div>
    </div>
  );
}

type ProbeState = "checking" | "online" | "offline" | "maintenance";

const STATUS_META: Record<ProbeState, { label: string; badge: string; title: string; description: string }> = {
  checking: {
    label: "KONTROL EDİLİYOR",
    badge: "border-brand/30 bg-brand/10 text-brand",
    title: "Durum kontrol ediliyor",
    description: "Sunucuya /health isteği gönderiliyor.",
  },
  online: {
    label: "ÇEVRİMİÇİ",
    badge: "border-lime/30 bg-lime/10 text-lime",
    title: "Sistem çalışıyor",
    description: "Health endpoint'i yanıt veriyor. SlopSound kullanıma hazır.",
  },
  offline: {
    label: "ÇEVRİMDIŞI",
    badge: "border-danger/30 bg-danger/10 text-danger",
    title: "Sunucuya ulaşılamıyor",
    description: "Health endpoint'inden yanıt alınamadı. Bağlantını kontrol edip yeniden dene.",
  },
  maintenance: {
    label: "BAKIMDA",
    badge: "border-warn/30 bg-warn/10 text-warn",
    title: "Bakım sürüyor",
    description: "Sunucu şu anda bakım modunda olduğunu bildiriyor.",
  },
};

export function Maintenance() {
  const setView = useApp((s) => s.setView);
  const [state, setState] = useState<ProbeState>("checking");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  async function refresh() {
    setState("checking");
    try {
      const health = await checkHealth();
      const next: ProbeState = health.maintenance ? "maintenance" : health.ok ? "online" : "offline";
      setState(next);
      setCheckedAt(new Date());
      setDetail(health.message ?? (next === "offline" ? "Sunucu hazır durumda değil." : null));
    } catch (error) {
      setState("offline");
      setCheckedAt(new Date());
      setDetail(error instanceof Error ? error.message : "Sağlık kontrolü başarısız");
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const meta = STATUS_META[state];
  const checking = state === "checking";

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[.06] px-4">
        <div className="flex items-center gap-2"><SlopLogo size={24} /><span className="font-display text-[13px] font-extrabold">SlopSound</span><span className="text-[10px] text-muted">• Sistem durumu</span></div>
        <span className={cn("rounded-full border px-3 py-1 text-[10px] font-black tracking-wider", meta.badge)}>{meta.label}</span>
      </header>
      <div className="relative flex flex-1 items-center justify-center overflow-y-auto p-5">
        <Ambient warm={state === "maintenance" || state === "offline"} />
        <motion.div initial={{ opacity: 0, y: 16, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .5 }} className="glass relative my-auto w-[min(620px,100%)] rounded-[28px] p-8 shadow-[0_20px_50px_rgba(0,0,0,.45)]">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-white/[.08] bg-white/[.04] px-3 py-1 text-[9.5px] font-black tracking-wider text-muted">CANLI SERVİS DURUMU</span>
            <button onClick={() => setView("app")} className="icon-btn"><ArrowLeft size={15} /></button>
          </div>
          <RobotScene />
          <h1 className="text-center font-display text-[28px] font-extrabold tracking-tight">{meta.title}</h1>
          <p className="mx-auto mt-2 max-w-md text-center text-[12.5px] leading-relaxed text-muted">{meta.description}</p>
          {detail && <p className={cn("mx-auto mt-3 max-w-md rounded-xl border px-3 py-2 text-center text-[11px] font-semibold", state === "maintenance" ? "border-warn/20 bg-warn/[.07] text-warn" : state === "offline" ? "border-danger/20 bg-danger/[.07] text-danger" : "border-white/[.08] bg-white/[.04] text-muted")}>{detail}</p>}
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[.07] bg-white/[.03] p-4">
              <p className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-muted"><Activity size={13} className="text-brand" /> SERVİS</p>
              <p className="mt-2 font-display text-[18px] font-extrabold">GET /health</p>
              <p className="mt-1 text-[10.5px] text-muted">{state === "online" ? "Yanıt alındı" : checking ? "İstek sürüyor" : "Yanıt alınamadı"}</p>
            </div>
            <div className="rounded-2xl border border-white/[.07] bg-white/[.03] p-4">
              <p className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-muted"><Clock3 size={13} className="text-brand" /> SON KONTROL</p>
              <p className="mt-2 font-display text-[15px] font-extrabold tabular">{formatTime(checkedAt)}</p>
              <p className="mt-1 text-[10.5px] text-muted">30 saniyede bir otomatik yenilenir</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="primary" disabled={checking} onClick={() => void refresh()}>
              <RefreshCw size={14} className={checking ? "animate-spin" : ""} /> {checking ? "Kontrol ediliyor..." : "Durumu Kontrol Et"}
            </Button>
            <Button variant="outline" onClick={() => setView("app")}><ArrowLeft size={14} /> Geri Dön</Button>
          </div>
        </motion.div>
      </div>
      <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-white/[.06] px-5 text-[9.5px] text-muted"><span>Kaynak: GET /health</span><span>Durum: {meta.label}</span><span className="truncate">Son kontrol: {formatTime(checkedAt)}</span></footer>
    </div>
  );
}

function CloudScene({ online }: { online: boolean }) {
  return (
    <div className="relative mx-auto h-[170px] w-[280px]">
      <div className="absolute left-1/2 top-4 h-[92px] w-[190px] -translate-x-1/2 animate-bob rounded-full bg-raised">
        <div className="absolute -left-6 top-4 h-12 w-12 rounded-full bg-raised" /><div className="absolute -right-7 top-5 h-14 w-14 rounded-full bg-raised" />
        <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-[11px] font-extrabold">{online ? "Bağlantı var" : "Bağlantı koptu"}</p><p className="text-[10px] text-muted">{online ? "Sunucuya ulaşıldı" : "Yeniden deneniyor"}</p></div></div>
      </div>
      <div className={cn("absolute right-10 top-2 animate-pulse text-[22px]", online ? "text-lime" : "text-white/25")}>{online ? "✓" : "×"}</div>
      {!online && [0, .4, .8].map((d) => <span key={d} className="absolute left-1/2 top-2 h-2 w-2 animate-ping rounded-full bg-warn" style={{ animationDelay: `${d}s`, marginLeft: `${(Number(d) * 60) - 40}px` }} />)}
      <div className="absolute bottom-6 left-1/2 flex h-1.5 w-[220px] -translate-x-1/2 items-center justify-center">
        <div className="h-full flex-1 rounded-full bg-white/15" /><div className={cn("grid h-8 w-8 place-items-center rounded-full text-[13px] font-black", online ? "bg-lime/20 text-lime" : "animate-[shake_1.8s_ease-in-out_infinite] bg-danger/20 text-danger")}>{online ? "✓" : "!"}</div><div className="h-full flex-1 rounded-full bg-white/15" />
      </div>
      <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-1.5">{[0, .2, .4].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-duration:1.2s]" style={{ animationDelay: `${d}s` }} />)}</div>
    </div>
  );
}

type ConnectivityState = "checking" | "offline" | "online";

const CONNECTIVITY_META: Record<ConnectivityState, { label: string; badge: string; title: string; description: string }> = {
  checking: {
    label: "KONTROL EDİLİYOR",
    badge: "border-brand/30 bg-brand/10 text-brand",
    title: "Bağlantı kontrol ediliyor",
    description: "Sunucuya /health isteği gönderiliyor.",
  },
  offline: {
    label: "BAĞLANTI YOK",
    badge: "border-danger/30 bg-danger/10 text-danger",
    title: "Sunucuya ulaşılamıyor",
    description: "SlopSound health endpoint'ine ulaşamıyor. Ağını kontrol edip yeniden dene.",
  },
  online: {
    label: "BAĞLANTI VAR",
    badge: "border-lime/30 bg-lime/10 text-lime",
    title: "Bağlantı geri geldi",
    description: "Health endpoint'i yanıt verdi. Sohbete dönebilirsin.",
  },
};

export function Offline() {
  const setView = useApp((s) => s.setView);
  const [state, setState] = useState<ConnectivityState>("checking");
  const [attempts, setAttempts] = useState(0);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const online = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  async function retry() {
    if (busy.current || online.current) return;
    busy.current = true;
    setState("checking");
    setAttempts((n) => n + 1);
    try {
      const health = await checkHealth();
      setCheckedAt(new Date());
      if (health.ok && !health.maintenance) {
        online.current = true;
        window.clearInterval(timer.current);
        setState("online");
        setError(null);
        toast.success("Bağlantı kuruldu");
      } else {
        setState("offline");
        setError(health.message ?? (health.maintenance ? "Sunucu bakımda" : "Sunucu hazır değil"));
      }
    } catch (cause) {
      setCheckedAt(new Date());
      setState("offline");
      setError(cause instanceof Error ? cause.message : "Bağlantı kurulamadı");
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    void retry();
    timer.current = window.setInterval(() => void retry(), 10_000);
    return () => window.clearInterval(timer.current);
  }, []);

  const meta = CONNECTIVITY_META[state];
  const connected = state === "online";
  const checking = state === "checking";

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[.06] px-4">
        <div className="flex items-center gap-2"><SlopLogo size={24} /><span className="font-display text-[13px] font-extrabold">SlopSound</span><span className="text-[10px] text-muted">• Bağlantı durumu</span></div>
        <span className={cn("rounded-full border px-3 py-1 text-[10px] font-black tracking-wider", meta.badge)}>{meta.label}</span>
      </header>
      {!connected && <div className="absolute inset-x-0 top-12 z-10 border-b border-danger/20 bg-danger/[.08] px-4 py-1.5 text-center text-[10.5px] font-bold text-danger">Health kontrolü başarısız. Sunucuya ulaşılamıyor.</div>}
      <div className={cn("relative flex flex-1 items-center justify-center overflow-y-auto p-5", !connected && "pt-12")}>
        <Ambient />
        <motion.div initial={{ opacity: 0, y: 16, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .5 }} className="glass relative my-auto w-[min(560px,100%)] rounded-[28px] p-8 shadow-[0_20px_50px_rgba(0,0,0,.45)]">
          <div className="flex items-center justify-between"><span className={cn("rounded-full border px-3 py-1 text-[9.5px] font-black tracking-wider", meta.badge)}>{meta.label}</span><button onClick={() => setView("app")} className="icon-btn"><ArrowLeft size={15} /></button></div>
          <CloudScene online={connected} />
          <h1 className="text-center font-display text-[26px] font-extrabold tracking-tight">{meta.title}</h1>
          <p className="mx-auto mt-2 max-w-md text-center text-[12.5px] leading-relaxed text-muted">{meta.description}</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/[.07] bg-white/[.03] p-3 text-center">
              <p className="font-display text-[20px] font-extrabold tabular">{attempts}</p><p className="mt-0.5 text-[9px] font-bold tracking-wider text-muted">DENEME</p>
            </div>
            <div className="rounded-2xl border border-white/[.07] bg-white/[.03] p-3 text-center">
              <p className="pt-1 font-display text-[14px] font-extrabold tabular">{checkedAt ? checkedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</p><p className="mt-0.5 text-[9px] font-bold tracking-wider text-muted">SON KONTROL</p>
            </div>
          </div>
          {error && !connected && <p className="mt-3 rounded-xl border border-danger/20 bg-danger/[.07] px-3 py-2 text-center text-[11px] font-semibold text-danger">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant={connected ? "lime" : "primary"} disabled={checking || connected} onClick={() => void retry()}>
              {connected ? <Check size={14} /> : <RefreshCw size={14} className={checking ? "animate-spin" : ""} />}
              {connected ? "Bağlanıldı" : checking ? "Deneniyor..." : "Tekrar Dene"}
            </Button>
            <Button variant="outline" onClick={() => setView("app")}><ArrowLeft size={14} /> Sohbete Dön</Button>
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            {[
              { icon: WifiOff, title: "Wi-Fi'yi kontrol et", desc: "Modem ışıkları yanıyor mu? Uçak modu açık kalmış olabilir." },
              { icon: Router, title: "Modemi kapat aç", desc: "30 saniye bekle, tekrar aç. Çoğu sorun böyle çözülüyor." },
              { icon: RotateCw, title: "Sayfayı yenile", desc: "Ctrl + R yap. Olmazsa uygulamayı kapatıp tekrar aç." },
            ].map((tip) => (
              <div key={tip.title} className="rounded-2xl border border-white/[.07] bg-white/[.03] p-3">
                <tip.icon size={15} className="text-warn" /><p className="mt-2 text-[11px] font-extrabold">{tip.title}</p><p className="mt-0.5 text-[10px] leading-snug text-muted">{tip.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-[10px] text-muted">Sonuç yalnızca /health isteği başarılı olduğunda bağlantı kuruldu olarak bildirilir.</p>
        </motion.div>
      </div>
      <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-white/[.06] px-5 text-[9.5px] text-muted"><span>Kaynak: GET /health</span><span>{connected ? "Otomatik kontrol durdu" : "Otomatik kontrol: 10 saniyede bir"}</span><span>Toplam deneme: {attempts}</span></footer>
    </div>
  );
}
