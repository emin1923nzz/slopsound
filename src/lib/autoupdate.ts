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

    async function run() {
      if (busy || cancelled) return;
      if (useApp.getState().voiceConnected) return;
      const last = Number(localStorage.getItem(ATTEMPT_KEY) ?? 0);
      if (Date.now() - last < CHECK_INTERVAL) return;
      localStorage.setItem(ATTEMPT_KEY, String(Date.now()));
      busy = true;
      try {
        const update = await check();
        if (!update || cancelled) return;
        toast("Güncelleme indiriliyor", { description: `SlopSound v${update.version}` });
        await update.downloadAndInstall();
        await relaunch();
      } catch {
        // sessiz retry sonraki kontrol döngüsünde
      } finally {
        busy = false;
      }
    }

    const start = window.setTimeout(() => void run(), 5000);
    const timer = window.setInterval(() => void run(), CHECK_INTERVAL);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, []);
}
