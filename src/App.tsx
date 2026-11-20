import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Toaster } from "sonner";
import { listen } from "@tauri-apps/api/event";
import { TooltipProvider } from "./components/ui";
import { useApp } from "@/lib/store";
import { useAudio } from "@/lib/audio";
import { useVideo } from "@/lib/video";
import { useLiveKit } from "@/lib/livekit";
import { useShortcuts } from "@/lib/shortcuts";
import { isTauri } from "@/lib/native";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { MembersPanel } from "./components/MembersPanel";
import { VoiceRoom } from "./components/VoiceRoom";
import { Dock } from "./components/Dock";
import { Settings } from "./components/Settings";
import { AddFriend } from "./components/AddFriend";
import { Maintenance, Offline } from "./components/StatusScreens";
import { Landing } from "./components/Landing";
import { RecordingBanner } from "./components/RecordingBanner";
import { PerfProfiler } from "./components/PerfProfiler";
import { AuthScreen } from "./components/AuthScreen";
import { Launcher } from "./components/Launcher";
import { SlopCompanion } from "./components/SlopCompanion";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

function AppView() {
  const voiceConnected = useApp((s) => s.voiceConnected);
  const wide = useMediaQuery("(min-width: 1280px)");

  return (
    <PanelGroup direction="horizontal" className="h-full">
      <Panel defaultSize={24} minSize={18} maxSize={34} order={1}>
        <Sidebar />
      </Panel>
      <PanelResizeHandle className="group relative w-1 shrink-0 bg-transparent transition-colors hover:bg-brand/40 data-[resize-handle-state=drag]:bg-brand/60">
        <span className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 transition group-hover:bg-brand" />
      </PanelResizeHandle>
      <Panel defaultSize={wide ? 58 : 76} minSize={40} order={2}>
        {voiceConnected ? <VoiceRoom /> : <ChatPanel />}
      </Panel>
      {wide && (
        <>
          <PanelResizeHandle className="group relative w-1 shrink-0 bg-transparent transition-colors hover:bg-brand/40 data-[resize-handle-state=drag]:bg-brand/60">
            <span className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 transition group-hover:bg-brand" />
          </PanelResizeHandle>
          <Panel defaultSize={18} minSize={13} maxSize={26} order={3}>
            <MembersPanel />
          </Panel>
        </>
      )}
    </PanelGroup>
  );
}

export default function App() {
  const view = useApp((s) => s.view);
  const accent = useApp((s) => s.accent);
  const density = useApp((s) => s.density);
  const reduceMotion = useApp((s) => s.reduceMotion);
  const setView = useApp((s) => s.setView);
  const setSidebarTab = useApp((s) => s.setSidebarTab);
  const toggleMic = useApp((s) => s.toggleMic);
  const toggleDeafen = useApp((s) => s.toggleDeafen);
  const authenticated = useApp((s) => s.authenticated);
  const authLoading = useApp((s) => s.authLoading);
  const bootstrapLoading = useApp((s) => s.bootstrapLoading);
  const launcherOpen = useApp((s) => s.launcherOpen);
  const setLauncherOpen = useApp((s) => s.setLauncherOpen);
  const initAuth = useApp((s) => s.initAuth);

  useEffect(() => { void initAuth(); }, [initAuth]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("oauth");
    if (!status) return;
    if (status === "done") void useApp.getState().initAuth();
    else useApp.getState().setError("Google girişi tamamlanamadı");
    params.delete("oauth");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);

  useEffect(() => {
    if (authLoading || bootstrapLoading) return;
    const timer = window.setTimeout(() => setLauncherOpen(false), 650);
    return () => window.clearTimeout(timer);
  }, [authLoading, bootstrapLoading, setLauncherOpen]);

  useEffect(() => {
    if (!launcherOpen || authLoading || bootstrapLoading) return;
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setLauncherOpen(false);
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [launcherOpen, authLoading, bootstrapLoading, setLauncherOpen]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    document.documentElement.dataset.density = density;
    document.documentElement.style.setProperty("--reduce-motion", reduceMotion ? "1" : "0");
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  }, [accent, density, reduceMotion]);

  useEffect(() => {
    const refresh = () => {
      void useAudio.getState().refreshDevices();
      void useVideo.getState().refreshDevices();
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === ",") { e.preventDefault(); setView("settings"); }
      if (e.ctrlKey && e.key.toLowerCase() === "d") { e.preventDefault(); setSidebarTab("dms"); setView("app"); }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "m") { e.preventDefault(); toggleMic(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView, setSidebarTab, toggleMic]);

  useEffect(() => {
    if (!isTauri()) return;
    void useShortcuts.getState().apply();
    let unlisten: (() => void) | undefined;
    void listen("shortcut://mic", () => toggleMic()).then((fn) => { unlisten = fn; });
    const others = [
      listen("shortcut://deafen", () => toggleDeafen()),
      listen("shortcut://screen", () => {
        const video = useVideo.getState();
        void useLiveKit.getState().setScreenShare(!useLiveKit.getState().screenSharing, {
          source: video.screenSource,
          systemAudio: video.shareSystemAudio,
        });
      }),
      listen("shortcut://ptt", () => {
        const audio = useAudio.getState();
        audio.setPushToTalk(!audio.pushToTalk);
      }),
    ];
    return () => { unlisten?.(); void Promise.all(others).then((fns) => fns.forEach((fn) => fn())); };
  }, [toggleMic, toggleDeafen]);

  const launcherLoading = authLoading || bootstrapLoading;

  const appContent = authLoading ? null : authenticated ? (
    <TooltipProvider delayDuration={250}>
      <PerfProfiler id="slopsound-root">
        <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-ink text-paper">
          <div className="atmosphere" />
          <Titlebar />
          <RecordingBanner />
          <div className="relative z-10 min-h-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: .22, ease: [.2, .8, .2, 1] }}
                className="h-full"
              >
                {view === "app" && <AppView />}
                {view === "settings" && <Settings />}
                {view === "addFriend" && <AddFriend />}
                {view === "maintenance" && <Maintenance />}
                {view === "offline" && <Offline />}
                {view === "landing" && <Landing />}
              </motion.div>
            </AnimatePresence>
          </div>
          {view === "app" && <Dock />}
          <Toaster
            position="bottom-center"
            offset={view === "app" ? 84 : 24}
            theme="dark"
            toastOptions={{
              style: {
                background: "#F4F1EA",
                color: "#100E16",
                border: "none",
                borderRadius: "999px",
                fontWeight: 700,
                fontSize: "12px",
                boxShadow: "0 16px 36px rgba(0,0,0,.5)",
              },
            }}
          />
        </div>
      </PerfProfiler>
    </TooltipProvider>
  ) : <AuthScreen />;

  return (
    <>
      {appContent}
      <SlopCompanion />
      <AnimatePresence>
        {launcherOpen && <Launcher loading={launcherLoading} onClose={() => setLauncherOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
