import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Minus, Square, X, Wifi, WifiOff, Download, Settings2, UserPlus, Rocket } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { cn, isTauri } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui";
import { SlopLogo } from "./SlopAvatar";
import { checkHealth, type HealthStatus } from "./StatusScreens";

async function winAction(action: "minimize" | "toggleMaximize" | "close") {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  if (action === "minimize") await win.minimize();
  if (action === "toggleMaximize") await win.toggleMaximize();
  if (action === "close") await win.close();
}

export function Titlebar() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const setLauncherOpen = useApp((s) => s.setLauncherOpen);
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      void checkHealth()
        .then((status) => { if (active) setHealth(status); })
        .catch(() => { if (active) setHealth({ ok: false }); });
    };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const issue = health && (!health.ok || health.maintenance) ? (health.maintenance ? "maintenance" : "offline") : null;

  async function checkUpdates() {
    if (!isTauri()) {
      toast.info("Güncelleme kontrolü sadece masaüstü sürümde çalışır");
      return;
    }
    setChecking(true);
    try {
      const update = await check();
      if (update) {
        toast("Yeni sürüm bulundu", { description: `v${update.version} indiriliyor…` });
        await update.downloadAndInstall();
        await relaunch();
      } else {
        toast.success("Güncelsin", { description: "En yeni SlopSound sürümünü kullanıyorsun." });
      }
    } catch {
      toast.error("Güncelleme kontrolü başarısız");
    } finally {
      setChecking(false);
    }
  }

  return (
    <header data-tauri-drag-region className="drag relative z-30 flex h-11 shrink-0 items-center justify-between border-b border-white/[.06] bg-ink/70 px-3 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 pl-1">
          <SlopLogo size={24} />
          <span className="font-display text-[13px] font-extrabold tracking-tight">SlopSound</span>
        </div>
        <div className="no-drag ml-2 hidden items-center gap-1 rounded-full bg-white/[.04] p-0.5 md:flex">
          {([
            ["app", "Sohbet"],
            ["addFriend", "Arkadaş"],
            ["settings", "Ayarlar"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`relative rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${view === key ? "text-ink" : "text-muted hover:text-paper"}`}
            >
              {view === key && (
                <motion.span
                  layoutId="titlebar-pill"
                  className="absolute inset-0 rounded-full bg-brand"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="no-drag flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button aria-label="Launcher'ı aç" onClick={() => setLauncherOpen(true)} className="icon-btn h-7 w-7"><Rocket size={14} /></button>
          </TooltipTrigger>
          <TooltipContent>Launcher'ı aç</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button aria-label="Güncellemeleri kontrol et" onClick={checkUpdates} disabled={checking} className="icon-btn h-7 w-7">
              <Download size={14} className={checking ? "animate-spin" : ""} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Güncellemeleri kontrol et</TooltipContent>
        </Tooltip>
        {issue && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={issue === "offline" ? "Bağlantı sorunu" : "Bakım durumu"}
                onClick={() => setView(issue)}
                className={cn("icon-btn h-7 w-7", issue === "offline" ? "text-danger" : "text-warn")}
              >
                {issue === "offline" ? <WifiOff size={14} /> : <Wifi size={14} />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{issue === "offline" ? "Bağlantı yok — ayrıntılar" : "Bakım sürüyor — ayrıntılar"}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button aria-label="Tanıtım ekranı" onClick={() => setView("landing")} className="icon-btn h-7 w-7"><UserPlus size={14} /></button>
          </TooltipTrigger>
          <TooltipContent>Tanıtım / giriş</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button aria-label="Ayarlar" onClick={() => setView("settings")} className="icon-btn h-7 w-7"><Settings2 size={14} /></button>
          </TooltipTrigger>
          <TooltipContent>Ayarlar</TooltipContent>
        </Tooltip>
        <div className="mx-2 h-4 w-px bg-white/10" />
        <button onClick={() => winAction("minimize")} className="grid h-8 w-9 place-items-center rounded-lg text-muted transition hover:bg-white/10 hover:text-paper"><Minus size={14} /></button>
        <button onClick={() => winAction("toggleMaximize")} className="grid h-8 w-9 place-items-center rounded-lg text-muted transition hover:bg-white/10 hover:text-paper"><Square size={11} /></button>
        <button onClick={() => winAction("close")} className="grid h-8 w-9 place-items-center rounded-lg text-muted transition hover:bg-danger/20 hover:text-danger"><X size={15} /></button>
      </div>
    </header>
  );
}
