import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Sparkles, X } from "lucide-react";

const RELEASE_ID = "slopsound-0.1.1";

const highlights = [
  "Mor, gri ve siyah temelli sade arayüz",
  "Dynamic Island tarzı sesli sohbet paneli",
  "Sağa kaydırarak yanıtlama ve uzun basma menüsü",
  "İmleci takip eden cam parlaması ve canlı ses halkası",
  "Köşeye yapışan ekran paylaşımı penceresi",
  "Discord tarzı profil: hitap, bio, banner ve avatar",
  "1-5 yıl ve owner rozetleri",
  "Otomatik uzaktan güncelleme ve FuntimeStudios imzası",
  "GTA6 esintili yeni arka plan",
];

export function WhatsNew() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("slopsound-release") === RELEASE_ID) return;
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  function close() {
    localStorage.setItem("slopsound-release", RELEASE_ID);
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[160] grid place-items-center bg-black/60 p-4 backdrop-blur-md"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, scale: .9, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: .94, y: 10 }}
            transition={{ duration: .4, ease: [.32, .72, 0, 1] }}
            onClick={(event) => event.stopPropagation()}
            className="glass-card glass w-full max-w-md rounded-panel p-6 shadow-float"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand/15 text-brand"><Sparkles size={20} /></div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[20px] font-extrabold tracking-tight">Yenilikler</h2>
                <p className="mt-1 text-[11.5px] text-muted">Bu sürümde neler değişti?</p>
              </div>
              <button onClick={close} aria-label="Kapat" className="icon-btn h-8 w-8"><X size={15} /></button>
            </div>
            <div className="mt-5 space-y-2.5">
              {highlights.map((item) => (
                <div key={item} className="flex items-start gap-2.5 rounded-2xl bg-white/[.04] px-3 py-2.5 text-[12px] text-paper/85">
                  <Check size={14} className="mt-0.5 shrink-0 text-brand" />{item}
                </div>
              ))}
            </div>
            <button onClick={close} className="btn btn-primary mt-5 w-full">Harika, devam et</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
