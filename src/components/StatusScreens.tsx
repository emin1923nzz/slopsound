import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, RefreshCw, Mail, Check, WifiOff, Zap, Router, RotateCw, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button, Switch } from "./ui";
import { SlopLogo } from "./SlopAvatar";

function useElapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setSeconds((s) => s + 1), 1000); return () => window.clearInterval(t); }, []);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
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

export function Maintenance() {
  const setView = useApp((s) => s.setView);
  const elapsed = useElapsed();
  const [progress, setProgress] = useState(68);
  const [checking, setChecking] = useState(false);
  const [email, setEmail] = useState("");
  const [autoCheck, setAutoCheck] = useState(true);
  const [remaining, setRemaining] = useState(14 * 60 + 32);

  useEffect(() => {
    const t = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(t);
  }, []);

  const hh = String(Math.floor(remaining / 3600)).padStart(2, "0");
  const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[.06] px-4">
        <div className="flex items-center gap-2"><SlopLogo size={24} /><span className="font-display text-[13px] font-extrabold">SlopSound</span><span className="text-[10px] text-muted">• Bakım</span></div>
        <span className="rounded-full border border-warn/30 bg-warn/10 px-3 py-1 text-[10px] font-black tracking-wider text-warn">BAKIMDA • {elapsed}</span>
      </header>
      <div className="relative flex flex-1 items-center justify-center overflow-y-auto p-5">
        <Ambient warm />
        <motion.div initial={{ opacity: 0, y: 16, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .5 }} className="glass relative my-auto w-[min(620px,100%)] rounded-[28px] p-8 shadow-[0_20px_50px_rgba(0,0,0,.45)]">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-warn/30 bg-warn/10 px-3 py-1 text-[9.5px] font-black tracking-wider text-warn">PLANLI BAKIM • 20 KASIM 2026</span>
            <button onClick={() => setView("app")} className="icon-btn"><ArrowLeft size={15} /></button>
          </div>
          <RobotScene />
          <h1 className="text-center font-display text-[28px] font-extrabold tracking-tight">SlopSound bakımda</h1>
          <p className="mx-auto mt-2 max-w-md text-center text-[12.5px] leading-relaxed text-muted">Şu an sunucuları daha hızlı, daha yumuşak yapıyoruz. Mesajların, sunucuların, arkadaşların silinmedi, hepsi duruyor. Bakım bitince kaldığın yerden devam edeceksin.</p>
          <div className="mt-6 grid grid-cols-3 gap-2">
            {[[hh, "SAAT"], [mm, "DAKİKA"], [ss, "SANİYE"]].map(([value, label], i) => (
              <div key={label} className={cn("rounded-2xl border p-3 text-center", i === 1 ? "border-brand/40 bg-brand/10" : "border-white/[.07] bg-white/[.03]")}>
                <p className={cn("font-display text-[24px] font-extrabold tabular", i === 1 && "text-brand")}>{value}</p><p className="text-[9px] font-bold tracking-wider text-muted">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-[10.5px] font-bold text-muted"><span>Bakım ilerlemesi…</span><span className="tabular">%{progress} • Tahmini bitiş: 23:45</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-brand to-lime transition-all duration-1000" animate={{ width: `${progress}%` }} /></div>
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            {[
              { icon: Zap, title: "Sunucu hızı", desc: "Mesajlar daha hızlı iletilecek." },
              { icon: Sparkles, title: "Yeni tasarım", desc: "Daha yumuşak, daha sade arayüz." },
              { icon: ShieldCheck, title: "Güvenlik", desc: "Hesap güvenliği güçlendiriliyor." },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/[.07] bg-white/[.03] p-3 transition hover:-translate-y-0.5 hover:border-brand/40">
                <item.icon size={15} className="text-brand" /><p className="mt-2 text-[11px] font-extrabold">{item.title}</p><p className="mt-0.5 text-[10px] text-muted">{item.desc}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 rounded-full bg-brand/70" /></div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="primary" disabled={checking} onClick={() => { setChecking(true); window.setTimeout(() => { setChecking(false); setProgress((p) => Math.min(100, p + 4)); toast(`Hala bakımdayız. İlerleme: %${progress + 4}`); }, 900); }}>
              <RefreshCw size={14} className={checking ? "animate-spin" : ""} /> {checking ? "Kontrol ediliyor..." : "Durumu Kontrol Et"}
            </Button>
            <Button variant="outline" onClick={() => setView("app")}><ArrowLeft size={14} /> Geri Dön</Button>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta yaz, bakım bitince haber verelim" className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/25 px-4 py-2.5 text-[11.5px] outline-none focus:border-brand/50" />
            <Button variant="lime" size="sm" onClick={() => email.includes("@") ? toast.success(`Tamam, bakım bitince ${email} adresine haber vereceğiz`) : toast.error("Geçerli bir e-posta yaz.")}><Mail size={13} /> Haber Ver</Button>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-muted"><Switch checked={autoCheck} onCheckedChange={setAutoCheck} /> Bakım bitince otomatik yenilenecek • Otomatik kontrol: {autoCheck ? "Açık" : "Kapalı"}</div>
        </motion.div>
      </div>
      <footer className="flex h-9 shrink-0 items-center justify-between border-t border-white/[.06] px-5 text-[9.5px] text-muted"><span>Son güncelleme: 20 Kasım 2026 • 23:31</span><span>Durum: Bakımda • Etkilenen: Tüm sunucular</span><span>destek@slopsound.gg</span></footer>
    </div>
  );
}

function CloudScene() {
  return (
    <div className="relative mx-auto h-[170px] w-[280px]">
      <div className="absolute left-1/2 top-4 h-[92px] w-[190px] -translate-x-1/2 animate-bob rounded-full bg-raised">
        <div className="absolute -left-6 top-4 h-12 w-12 rounded-full bg-raised" /><div className="absolute -right-7 top-5 h-14 w-14 rounded-full bg-raised" />
        <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-[11px] font-extrabold">Bağlantı koptu</p><p className="text-[10px] text-muted">SlopSound bekliyor</p></div></div>
      </div>
      <div className="absolute right-10 top-2 animate-pulse text-[22px] text-white/25">×</div>
      {[0, .4, .8].map((d) => <span key={d} className="absolute left-1/2 top-2 h-2 w-2 animate-ping rounded-full bg-warn" style={{ animationDelay: `${d}s`, marginLeft: `${(Number(d) * 60) - 40}px` }} />)}
      <div className="absolute bottom-6 left-1/2 flex h-1.5 w-[220px] -translate-x-1/2 items-center justify-center">
        <div className="h-full flex-1 rounded-full bg-white/15" /><div className="grid h-8 w-8 animate-[shake_1.8s_ease-in-out_infinite] place-items-center rounded-full bg-danger/20 text-[13px] font-black text-danger">!</div><div className="h-full flex-1 rounded-full bg-white/15" />
      </div>
      <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-1.5">{[0, .2, .4].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-duration:1.2s]" style={{ animationDelay: `${d}s` }} />)}</div>
    </div>
  );
}

export function Offline() {
  const setView = useApp((s) => s.setView);
  const elapsed = useElapsed();
  const [retrying, setRetrying] = useState(false);
  const [connected, setConnected] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [autoRetry, setAutoRetry] = useState(true);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!autoRetry || connected) return;
    const t = window.setInterval(() => setCountdown((c) => (c <= 1 ? 10 : c - 1)), 1000);
    return () => window.clearInterval(t);
  }, [autoRetry, connected]);

  function retry() {
    if (retrying || connected) return;
    setRetrying(true);
    const next = attempts + 1;
    setAttempts(next);
    window.setTimeout(() => {
      setRetrying(false);
      if (next >= 3) { setConnected(true); toast.success("Bağlanıldı! Mesajların gönderiliyor."); }
      else toast(`Bağlantı kurulamadı • deneme ${next}/3`);
    }, 1100);
  }

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[.06] px-4">
        <div className="flex items-center gap-2"><SlopLogo size={24} /><span className="font-display text-[13px] font-extrabold">SlopSound</span><span className="text-[10px] text-muted">• Bağlantı yok</span></div>
        <span className="rounded-full border border-danger/30 bg-danger/10 px-3 py-1 text-[10px] font-black tracking-wider text-danger">ÇEVRİMDIŞI • {elapsed}</span>
      </header>
      <div className="absolute inset-x-0 top-12 z-10 border-b border-danger/20 bg-danger/[.08] px-4 py-1.5 text-center text-[10.5px] font-bold text-danger">İnternet bağlantın kesildi. Mesajların gönderilmedi, bağlantı gelince tekrar deneyeceğiz.</div>
      <div className="relative flex flex-1 items-center justify-center overflow-y-auto p-5 pt-12">
        <Ambient />
        <motion.div initial={{ opacity: 0, y: 16, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .5 }} className="glass relative my-auto w-[min(560px,100%)] rounded-[28px] p-8 shadow-[0_20px_50px_rgba(0,0,0,.45)]">
          <div className="flex items-center justify-between"><span className="rounded-full border border-danger/30 bg-danger/10 px-3 py-1 text-[9.5px] font-black tracking-wider text-danger">OFFLINE_001</span><button onClick={() => setView("app")} className="icon-btn"><ArrowLeft size={15} /></button></div>
          <CloudScene />
          <h1 className="text-center font-display text-[26px] font-extrabold tracking-tight">İnternet yok, sorun değil</h1>
          <p className="mx-auto mt-2 max-w-md text-center text-[12.5px] leading-relaxed text-muted">SlopSound sunucuya ulaşamıyor. Mesajların kaybolmadı, bağlantı gelince kendiliğinden gönderilecek. Önce aşağıdakileri dene, olmazsa biz tekrar deneyeceğiz.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[10px] text-muted"><span className="rounded-full bg-white/[.06] px-2.5 py-1">Hata kodu: OFFLINE_001</span><span>Son deneme: az önce</span></div>
          {retrying && <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 animate-[shimmer_1s_linear_infinite] rounded-full bg-brand" /></div>}
          <p className="mt-4 text-center text-[10.5px] text-muted">{connected ? "Bağlantı kuruldu." : `Otomatik yeniden deneme: ${countdown} saniye sonra`}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant={connected ? "lime" : "primary"} onClick={retry} disabled={retrying || connected}>{connected ? <Check size={14} /> : <RefreshCw size={14} className={retrying ? "animate-spin" : ""} />}{connected ? "Bağlanıldı" : retrying ? "Deneniyor..." : "Tekrar Dene →"}</Button>
            <Button variant="outline" onClick={() => toast("Bağlantı kontrol ediliyor...")}><WifiOff size={14} /> Bağlantıyı Kontrol Et</Button>
            <Button variant="ghost" onClick={() => setView("app")}><ArrowLeft size={14} /> Geri Dön</Button>
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            {[
              { icon: WifiOff, title: "Wi-Fi'yi kontrol et", desc: "Modem ışıkları yanıyor mu? Uçak modu açık kalmış olabilir." },
              { icon: Router, title: "Modemi kapat aç", desc: "30 saniye bekle, tekrar aç. Çoğu sorun böyle çözülüyor." },
              { icon: RotateCw, title: "Sayfayı yenile", desc: "Ctrl + R yap. Olmazsa uygulamayı kapatıp tekrar aç." },
            ].map((tip) => (
              <button key={tip.title} onClick={() => toast(tip.title)} className="rounded-2xl border border-white/[.07] bg-white/[.03] p-3 text-left transition hover:-translate-y-0.5 hover:border-brand/40">
                <tip.icon size={15} className="text-warn" /><p className="mt-2 text-[11px] font-extrabold">{tip.title}</p><p className="mt-0.5 text-[10px] leading-snug text-muted">{tip.desc}</p>
              </button>
            ))}
          </div>
          <p className="mt-4 text-center text-[10px] text-muted">Çevrimdışıyken de eski mesajlarını okuyabilirsin. Yeni mesaj yazarsan kuyruğa eklenir.</p>
        </motion.div>
      </div>
      <footer className="flex h-9 shrink-0 items-center justify-between border-t border-white/[.06] px-5 text-[9.5px] text-muted"><span>Son mesaj: Ahmet: tasarım efsane olmuş • 12:42</span><span>Kuyrukta: 2 mesaj</span><button onClick={() => setAutoRetry((v) => !v)} className="font-bold text-brand">Otomatik deneme: {autoRetry ? "Açık" : "Kapalı"}</button></footer>
    </div>
  );
}
