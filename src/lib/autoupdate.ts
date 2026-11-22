import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";
import { isTauri } from "@/lib/utils";
import { useApp } from "@/lib/store";

const CHECK_INTERVAL = 15 * 60 * 1000;
const ATTEMPT_KEY = "slopsound-last-update-attempt";

export function useAutoUpdate() {
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let busy = false;

    async function run(manual = false) {
      if (busy || cancelled) return;
      if (useApp.getState().voiceConnected) {
        if (manual) toast.info("Güncelleme için önce sesli aramadan çık");
        return;
      }
      const last = Number(localStorage.getItem(ATTEMPT_KEY) ?? 0);
      if (!manual && Date.now() - last < CHECK_INTERVAL) return;
      localStorage.setItem(ATTEMPT_KEY, String(Date.now()));
      busy = true;
      try {
        const update = await check();
        if (!update || cancelled) {
          if (manual) toast.success("Güncelsin", { description: "En yeni SlopSound sürümünü kullanıyorsun." });
          return;
        }
        const id = toast.loading(`v${update.version} indiriliyor`, { description: "İndirme bitince uygulama yeniden başlayacak." });
        let total = 0;
        let downloaded = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") total = event.data.contentLength ?? 0;
          if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            if (total > 0) toast.loading(`v${update.version} indiriliyor %${Math.min(99, Math.round((downloaded / total) * 100))}`, { id });
          }
        });
        toast.success("Güncelleme hazır, yeniden başlatılıyor", { id });
        await relaunch();
      } catch (error) {
        if (manual) toast.error(error instanceof Error ? error.message : "Güncelleme kontrolü başarısız");
      } finally {
        busy = false;
      }
    }

    const onManual = () => { void run(true); };
    window.addEventListener("slopsound:check-update", onManual);
    const start = window.setTimeout(() => void run(false), 5000);
    const timer = window.setInterval(() => void run(false), CHECK_INTERVAL);
    return () => {
      cancelled = true;
      window.removeEventListener("slopsound:check-update", onManual);
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, []);
}
