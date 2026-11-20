import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import { useGaze } from "@blobatar/react/gaze";
import { MessageCircleQuestion, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { useAudio } from "@/lib/audio";
import { SlopAvatar } from "./SlopAvatar";
import { Button, Input } from "./ui";

const suggestions = [
  "Bugün ne yapalım?",
  "Sunlop kim?",
  "SlopSound'u anlat",
  "Bana bir oyun öner",
];

export function SlopCompanion() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const authenticated = useApp((s) => s.authenticated);
  const dms = useApp((s) => s.dms);
  const createDM = useApp((s) => s.createDM);
  const selectDM = useApp((s) => s.selectDM);
  const sendMessage = useApp((s) => s.sendMessage);
  const setView = useApp((s) => s.setView);
  const { ref } = useGaze({ travel: 3, lookAt: "pointer" });
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 120, damping: 18, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 120, damping: 18, mass: 0.4 });

  useEffect(() => {
    const move = (event: PointerEvent) => {
      x.set((event.clientX / window.innerWidth - 0.5) * 34);
      y.set((event.clientY / window.innerHeight - 0.5) * 22);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [x, y]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function ask(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    if (!authenticated) {
      toast("Giriş yaptıktan sonra sorabilirim");
      return;
    }
    setBusy(true);
    useAudio.getState().playSound("ask");
    try {
      const existing = dms.find((dm) => dm.name.toLowerCase() === "sunlop");
      if (existing) selectDM(existing.id);
      else {
        const id = await createDM("Sunlop");
        if (!id) return;
      }
      setView("app");
      await sendMessage(`@Sunlop ${value}`);
      setQuestion("");
      setOpen(false);
      toast.success("Sunlop'a sordum, cevabı DM'de");
    } catch {
      toast.error("Soru gönderilemedi");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <div className="pointer-events-none fixed bottom-24 right-5 z-[90] flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            className="pointer-events-auto w-[min(320px,calc(100vw-40px))] rounded-[22px] border border-brand/25 bg-[#17141f]/95 p-4 shadow-float backdrop-blur-xl"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-[10px] bg-brand/15 text-brand"><Sparkles size={14} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[12px] font-extrabold">Sloppi'ye sor</p>
                <p className="text-[9.5px] text-muted">Sunlop'a iletirim, cevabı DM'de gelir.</p>
              </div>
              <button onClick={() => setOpen(false)} className="icon-btn h-7 w-7" aria-label="Kapat"><X size={13} /></button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {suggestions.map((item) => (
                <button
                  key={item}
                  onClick={() => void ask(item)}
                  disabled={busy}
                  className="rounded-full border border-white/[.08] bg-white/[.04] px-2.5 py-1 text-[9.5px] font-bold text-muted transition hover:border-brand/40 hover:text-paper disabled:opacity-50"
                >
                  {item}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="mt-3 flex gap-2">
              <Input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Bir soru sor..."
                aria-label="Sloppi'ye soru"
                className="h-9 flex-1 text-[11px]"
              />
              <Button type="submit" size="sm" disabled={busy || !question.trim()} className="h-9 px-3">
                <Send size={13} />
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div style={{ x: springX, y: springY }} className="pointer-events-auto relative">
        <button
          onClick={() => { useAudio.getState().playSound("blop"); setOpen((value) => !value); }}
          className="group relative grid h-16 w-16 place-items-center rounded-full border border-brand/25 bg-[#17141f]/70 shadow-float backdrop-blur-xl transition hover:border-brand/60"
          title="Sloppi'ye sor"
          aria-label="Sloppi'ye sor"
        >
          <SlopAvatar name="slop sound" size={56} animate="always" showDot dotPosition="top-right" title="Sloppi" blobatarRef={ref} />
          <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-paper px-2 py-0.5 text-[8px] font-black text-ink opacity-0 transition group-hover:opacity-100">
            <MessageCircleQuestion size={9} /> SOR
          </span>
        </button>
      </motion.div>
    </div>
  );
}
