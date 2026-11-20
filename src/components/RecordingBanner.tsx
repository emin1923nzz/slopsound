import { AnimatePresence, motion } from "motion/react";
import { Circle, Download, Radio, X } from "lucide-react";
import { toast } from "sonner";
import { useRecording } from "@/lib/recording";
import { useLiveKit } from "@/lib/livekit";
import { Button } from "./ui";

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RecordingBanner() {
  const recording = useRecording((s) => s.recording);
  const mode = useRecording((s) => s.mode);
  const source = useRecording((s) => s.source);
  const elapsed = useRecording((s) => s.elapsed);
  const notified = useRecording((s) => s.notified);
  const lastUrl = useRecording((s) => s.lastUrl);
  const saving = useRecording((s) => s.saving);
  const savedPath = useRecording((s) => s.savedPath);
  const stop = useRecording((s) => s.stop);
  const saveLast = useRecording((s) => s.saveLast);
  const discardLast = useRecording((s) => s.discardLast);
  const notice = useLiveKit((s) => s.recordingNotice);

  const visible = recording || Boolean(lastUrl) || Boolean(notice);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -18 }}
          className="pointer-events-auto absolute left-1/2 top-[68px] z-40 w-[min(560px,calc(100%-32px))] -translate-x-1/2"
        >
          <div className="glass flex items-center gap-3 rounded-2xl border border-danger/30 px-4 py-2.5 shadow-float">
            <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-danger/15 text-danger">
              <Circle size={10} fill="currentColor" className="animate-pulse" />
              {recording && <span className="absolute inset-0 rounded-full border border-danger/40 animate-ping" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[12px] font-extrabold text-danger">
                {recording ? `KAYIT • ${mode === "meeting" ? "GÖRÜŞME" : "YEREL"}` : notice ? `${notice.by} kaydı ${notice.state === "started" ? "başlattı" : "durdurdu"}` : "KAYIT HAZIR"}
              </p>
              <p className="truncate text-[10px] text-muted">
                {recording
                  ? `${clock(elapsed)} • ${source === "screen" ? "Ekran" : "Kamera"} • ${notified ? "Katılımcılar bilgilendirildi" : "Yerel kayıt"}`
                  : savedPath
                    ? `Kaydedildi: ${savedPath}`
                    : notice
                      ? "Kayıt göstergesi tüm katılımcılarda görünür. Gizli kayıt yapılmaz."
                      : "Kaydı bilgisayarına kaydet veya at."}
              </p>
            </div>
            {recording && (
              <Button size="sm" variant="danger" onClick={() => void stop()}>
                Durdur
              </Button>
            )}
            {!recording && lastUrl && (
              <>
                <Button size="sm" variant="primary" disabled={saving} onClick={() => void saveLast().then(() => toast.success("Kayıt kaydedildi"))}>
                  <Download size={13} /> Kaydet
                </Button>
                <button aria-label="Kaydı at" onClick={discardLast} className="icon-btn h-7 w-7"><X size={13} /></button>
              </>
            )}
            {!recording && !lastUrl && notice && <Radio size={14} className="text-danger" />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
