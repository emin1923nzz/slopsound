import { useMemo, useState } from "react";
import { Sparkles, Palette, Languages, MessageCircle, ShieldCheck, ArrowRight, ArrowLeft } from "lucide-react";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button, Dialog, DialogContent } from "./ui";

export function Tutorial() {
  const authenticated = useApp((s) => s.authenticated);
  const tutorialDone = useApp((s) => s.tutorialDone);
  const completeTutorial = useApp((s) => s.completeTutorial);
  const setView = useApp((s) => s.setView);
  const setSettingsSection = useApp((s) => s.setSettingsSection);
  const t = useT();
  const [step, setStep] = useState(0);

  const steps = useMemo(() => [
    { icon: Sparkles, title: "SlopSound'a hoş geldin", text: "Burası senin alanın. Sunucular, DM'ler, ses odaları ve Sloppi tek yerde.", action: () => setView("app") },
    { icon: Palette, title: "Temanı seç", text: "Ayarlar > Görünüm'den Koyu+Mor, Açık, Sarı Siyah veya Sisteme Uysun temasını seçebilirsin.", action: () => { setView("settings"); setSettingsSection("Görünüm"); } },
    { icon: Languages, title: "Dilini ayarla", text: "Ayarlar > Dil'den uygulama dilini ve otomatik çeviriyi açabilirsin.", action: () => { setView("settings"); setSettingsSection("Dil"); } },
    { icon: MessageCircle, title: "Sloppi'ye sor", text: "Sağ alttaki Sloppi butonundan soru sorabilir, Ayarlar > AI Asistan'dan Groq anahtarını ekleyebilirsin.", action: () => { setView("settings"); setSettingsSection("AI Asistan"); } },
    { icon: ShieldCheck, title: "Hazırsın", text: "Profilini düzenle, arkadaş ekle veya bir sunucuya katıl. İyi sohbetler!", action: () => setView("app") },
  ], [setView, setSettingsSection]);

  if (!authenticated || tutorialDone) return null;
  const current = steps[step];
  const Icon = current.icon;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) completeTutorial(); }}>
      <DialogContent className="max-w-[520px] border-brand/20 bg-[#17141f]/95 p-0 backdrop-blur-2xl">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/15 text-brand"><Icon size={20} /></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-brand">{t("Tutorial")} {step + 1}/{steps.length}</p>
              <h2 className="font-display text-[22px] font-extrabold tracking-tight">{current.title}</h2>
            </div>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">{current.text}</p>
          <div className="mt-5 flex gap-1.5">
            {steps.map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-white/10"}`} />)}
          </div>
          <div className="mt-6 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={completeTutorial}>Atla</Button>
            <div className="flex gap-2">
              {step > 0 && <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}><ArrowLeft size={14} /> {t("Geri")}</Button>}
              <Button size="sm" onClick={() => { current.action(); if (step === steps.length - 1) completeTutorial(); else setStep((s) => s + 1); }}>
                {step === steps.length - 1 ? t("Bitir") : t("İleri")} <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
