import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  ArrowRight, Check, Download, Radio, ShieldCheck, Sparkles, X, Zap,
} from "lucide-react";
import { isTauri } from "@/lib/native";
import { useApp } from "@/lib/store";
import { SlopLogo } from "./SlopAvatar";

type UpdateState = "checking" | "current" | "available" | "error" | "web";

const notes = [
  { icon: Radio, title: "Ses odaları", text: "Düşük gecikmeli konuşma, ekran paylaşımı ve canlı seviye halkaları." },
  { icon: Sparkles, title: "Sunlop", text: "Sunucunda ve DM'lerinde seninle birlikte çalışan asistan." },
  { icon: ShieldCheck, title: "Güvenli oturum", text: "HttpOnly cookie, rol tabanlı erişim ve denetim kayıtları." },
  { icon: Zap, title: "Performans", text: "Sanallaştırılmış mesajlar, FPS profili ve adaptif WebRTC kalitesi." },
];

export function Launcher({ loading, onClose }: { loading: boolean; onClose: () => void }) {
  const username = useApp((s) => s.user?.username ?? "Misafir");
  const authLoading = useApp((s) => s.authLoading);
  const bootstrapLoading = useApp((s) => s.bootstrapLoading);
  const [version, setVersion] = useState("0.1.1");
  const [updateState, setUpdateState] = useState<UpdateState>("checking");
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getVersion().then((v) => { if (!cancelled) setVersion(v); }).catch(() => undefined);
    if (!isTauri()) {
      setUpdateState("web");
      return () => { cancelled = true; };
    }
    setUpdateState("checking");
    void check()
      .then((result) => {
        if (cancelled) return;
        setUpdate(result);
        setUpdateState(result ? "available" : "current");
      })
      .catch(() => { if (!cancelled) setUpdateState("error"); });
    return () => { cancelled = true; };
  }, []);

  async function installUpdate() {
    if (!update || installing) return;
    setInstalling(true);
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch {
      setUpdateState("error");
      setInstalling(false);
    }
  }

  const updateLabel = {
    checking: "Güncellemeler kontrol ediliyor",
    current: "Güncelsin • v" + version,
    available: "Yeni sürüm hazır • v" + (update?.version ?? ""),
    error: "Güncelleme sunucusuna ulaşılamadı",
    web: "Web önizleme modu",
  }[updateState];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: .35 }}
      className="fixed inset-0 z-[100] overflow-hidden bg-ink text-paper"
    >
      <div className="atmosphere" />
      <div className="pointer-events-none absolute -left-40 top-1/3 h-[520px] w-[520px] rounded-full bg-brand/20 blur-[140px]" />
      <div className="pointer-events-none absolute -right-32 -top-40 h-[460px] w-[460px] rounded-full bg-lime/10 blur-[130px]" />
      <div className="launcher-grid absolute inset-0 opacity-[.16]" />

      <div className="relative z-10 flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <SlopLogo size={32} />
            <div>
              <p className="font-display text-[13px] font-extrabold leading-none tracking-tight">SlopSound</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[.18em] text-muted">UNSLOP Edition</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/[.08] bg-white/[.04] px-3 py-1.5 text-[10px] font-bold text-muted">v{version}</span>
            <button
              aria-label="Launcher'ı kapat"
              onClick={onClose}
              disabled={loading}
              className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-white/10 hover:text-paper disabled:opacity-30"
            ><X size={15} /></button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center gap-10 px-6 pb-10 lg:px-16">
          <div className="hidden w-14 shrink-0 flex-col items-center gap-3 rounded-[28px] border border-white/[.06] bg-white/[.03] p-3 lg:flex">
            {[Sparkles, Radio, ShieldCheck, Zap].map((Icon, index) => (
              <div key={index} className={`grid h-9 w-9 place-items-center rounded-[14px] ${index === 0 ? "bg-brand text-ink shadow-glow" : "text-muted"}`}>
                <Icon size={16} />
              </div>
            ))}
            <div className="mt-auto h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_10px_hsl(var(--lime)/.8)]" />
          </div>

          <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: .08, type: "spring", stiffness: 220, damping: 24 }}
            >
              <div className="relative mb-7 grid h-24 w-24 place-items-center">
                <SlopLogo size={96} animate="always" />
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
                  className="absolute -inset-3 rounded-[42px] border border-dashed border-brand/35"
                />
              </div>
              <h1 className="font-display text-[clamp(38px,6vw,68px)] font-black leading-[.95] tracking-[-.045em]">
                Konuş, oyna,
                <br /><span className="text-brand">takıl.</span>
              </h1>
              <p className="mt-5 max-w-md text-[13px] leading-relaxed text-muted">
                SlopSound launcher hazır. Oturumunu doğruluyor, sunucularını ve ses odalarını senin için getiriyor.
              </p>

              <div className="mt-8 max-w-md">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[.14em] text-muted">
                  <span>{!loading ? "Hazır" : authLoading ? "Oturum doğrulanıyor" : bootstrapLoading ? "Veriler yükleniyor" : "Bağlantı kuruluyor"}</span>
                  <span>{loading ? "•••" : "100%"}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.07]">
                  {loading ? (
                    <motion.div
                      animate={{ x: ["-110%", "310%"] }}
                      transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
                      className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-brand to-lime shadow-[0_0_18px_hsl(var(--brand)/.6)]"
                    />
                  ) : (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{ duration: .5, ease: [.2, .8, .2, 1] }}
                      className="h-full rounded-full bg-gradient-to-r from-brand via-brand to-lime shadow-[0_0_18px_hsl(var(--brand)/.6)]"
                    />
                  )}
                </div>
              </div>

              <button
                onClick={onClose}
                disabled={loading}
                className="btn btn-primary mt-7 disabled:opacity-40"
              >
                SlopSound'u Aç <ArrowRight size={15} />
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: .16, type: "spring", stiffness: 220, damping: 24 }}
              className="glass rounded-panel p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.18em] text-muted">Launcher Durumu</p>
                  <p className="mt-1 font-display text-[18px] font-extrabold">Merhaba, {username}</p>
                </div>
                <span className={`grid h-9 w-9 place-items-center rounded-full ${updateState === "available" ? "bg-warn/15 text-warn" : updateState === "checking" ? "bg-brand/15 text-brand" : updateState === "error" ? "bg-danger/15 text-danger" : "bg-lime/15 text-lime"}`}>
                  {updateState === "available" ? <Download size={16} /> : updateState === "checking" ? <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent" /> : updateState === "error" ? <X size={16} /> : <Check size={16} />}
                </span>
              </div>

              <div className="mt-5 rounded-2xl border border-white/[.07] bg-black/25 p-4">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${updateState === "checking" ? "animate-pulse bg-brand" : updateState === "error" ? "bg-danger" : "bg-lime"}`} />
                  <p className="text-[11px] font-bold">{updateLabel}</p>
                </div>
                <AnimatePresence>
                  {updateState === "available" && (
                    <motion.button
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      onClick={() => void installUpdate()}
                      disabled={installing}
                      className="btn btn-lime mt-3 w-full py-2 text-[11px] disabled:opacity-50"
                    >
                      {installing ? "İndiriliyor…" : "Güncelle ve Yeniden Başlat"}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-5 grid gap-2.5">
                {notes.map(({ icon: Icon, title, text }) => (
                  <div key={title} className="flex gap-3 rounded-2xl bg-white/[.035] p-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand"><Icon size={15} /></div>
                    <div>
                      <p className="text-[11.5px] font-extrabold">{title}</p>
                      <p className="mt-0.5 text-[10.5px] leading-snug text-muted">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        <div className="flex h-10 shrink-0 items-center justify-between border-t border-white/[.05] px-6 text-[9px] font-bold uppercase tracking-[.16em] text-muted/60">
          <span>SlopSound • Kendi kimliğinle</span>
          <span>ESC ile kapat</span>
        </div>
      </div>
    </motion.div>
  );
}
