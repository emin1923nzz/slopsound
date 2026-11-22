import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Toaster, toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
import { Dialog, DialogContent, TooltipProvider } from "./components/ui";
import { DialogTitle } from "@radix-ui/react-dialog";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api";
import type { UserProfile } from "@/lib/data";
import { useCallStore } from "@/lib/callStore";
import { useAudio } from "@/lib/audio";
import { useVideo } from "@/lib/video";
import { useLiveKit } from "@/lib/livekit";
import { useShortcuts } from "@/lib/shortcuts";
import { isTauri } from "@/lib/native";
import { useAutoUpdate } from "@/lib/autoupdate";
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
import { DynamicIsland } from "./components/DynamicIsland";
import { ScreenSharePip } from "./components/ScreenSharePip";
import { ChannelPeek } from "./components/ChannelPeek";
import { WhatsNew } from "./components/WhatsNew";
import { Tutorial } from "./components/Tutorial";
import { CallOverlay } from "./components/CallOverlay";
import { SlopAvatar } from "./components/SlopAvatar";
import { BadgeChips } from "./components/BadgeChips";
import { MessageCircle, AtSign, UsersRound } from "lucide-react";

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

function UserProfileDialog() {
  const selectedProfileId = useApp((s) => s.selectedProfileId);
  const closeProfile = useApp((s) => s.closeProfile);
  const createDM = useApp((s) => s.createDM);
  const setView = useApp((s) => s.setView);
  const currentUser = useApp((s) => s.user);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selectedProfileId) {
      setProfile(null);
      return;
    }
    let active = true;
    setLoading(true);
    api.getUser(selectedProfileId)
      .then((data) => { if (active) setProfile(data); })
      .catch(() => { if (active) { setProfile(null); toast.error("Profil yüklenemedi"); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedProfileId]);

  async function openDm() {
    if (!profile || busy) return;
    setBusy(true);
    const id = await createDM(profile.name);
    setBusy(false);
    if (!id) return toast.error(useApp.getState().error ?? "DM açılamadı");
    closeProfile();
    setView("app");
  }

  const statusLabel: Record<UserProfile["status"], string> = {
    online: "Çevrimiçi", idle: "Boşta", dnd: "Rahatsız etme", offline: "Çevrimdışı",
  };

  return (
    <Dialog open={Boolean(selectedProfileId)} onOpenChange={(open) => { if (!open) closeProfile(); }}>
      <DialogContent className="w-[min(460px,92vw)] overflow-hidden p-0">
        <div className="h-24 w-full" style={{ background: `linear-gradient(135deg, ${profile?.color ?? "#8B6CFF"}55, transparent)` }} />
        <div className="relative px-6 pb-6">
          <div className="-mt-10 mb-3">
            <SlopAvatar
              name={profile?.displayName ?? "..."}
              src={profile?.avatarUrl}
              size={76}
              status={profile?.status}
              showDot
              className="ring-4 ring-surface"
            />
          </div>
          <DialogTitle className="font-display text-[19px] font-extrabold">{profile?.displayName ?? (loading ? "Yükleniyor…" : "Profil")}</DialogTitle>
          {profile && (
            <>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted"><AtSign size={12} /> {profile.name}#{profile.tag}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[10px] font-bold text-muted">{statusLabel[profile.status]}</span>
                {profile.title && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">{profile.title}</span>}
                <BadgeChips badges={profile.badges} compact />
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted"><UsersRound size={13} /> {profile.mutual} ortak sunucu</p>
              {profile.customStatus && <p className="mt-3 text-[12px] font-semibold text-paper">{profile.customStatus}</p>}
              <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-muted">{profile.bio || "Bu kullanıcı henüz bir bio yazmadı."}</p>
              {profile.activity && <p className="mt-2 text-[11px] text-brand">{profile.activity}</p>}
              {profile.id !== currentUser?.id && !profile.bot && (
                <button
                  type="button"
                  onClick={() => void openDm()}
                  disabled={busy}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-[12px] font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  <MessageCircle size={15} /> {busy ? "Açılıyor…" : "DM aç"}
                </button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
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
  const focusMode = useApp((s) => s.focusMode);
  const servers = useApp((s) => s.servers);
  const activeServer = useApp((s) => s.activeServer);
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
  const bindCallEvents = useCallStore((s) => s.bindCallEvents);

  useAutoUpdate();

  useEffect(() => { void initAuth(); }, [initAuth]);

  useEffect(() => {
    bindCallEvents();
  }, [bindCallEvents]);

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
    document.documentElement.classList.toggle("focus-mode", focusMode);
  }, [focusMode]);

  useEffect(() => {
    const server = servers.find((item) => item.id === activeServer);
    if (!server?.color) return;
    document.documentElement.style.setProperty("--ambient-1", `${server.color}22`);
    document.documentElement.style.setProperty("--ambient-2", `${server.color}0d`);
  }, [servers, activeServer]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      const card = target?.closest(".glass-card") as HTMLElement | null;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
      card.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

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
    if (typeof Notification !== "undefined" && !isTauri() && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => undefined);
    }
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
          quality: video.screenQuality,
          contentHint: video.screenContentHint,
        }).then((ok) => {
          if (!ok) toast.error("Ekran paylaşımı başlatılamadı");
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
            <AnimatePresence mode="sync">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: reduceMotion ? 0 : .12, ease: [.2, .8, .2, 1] }}
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
          {view === "app" && (
            <>
              <Dock />
              <DynamicIsland />
              <ScreenSharePip />
              <ChannelPeek />
            </>
          )}
          <WhatsNew />
          <Tutorial />
          <UserProfileDialog />
          <CallOverlay />
          <Toaster
            position="bottom-right"
            offset={view === "app" ? 84 : 24}
            gap={10}
            theme="dark"
            toastOptions={{
              className: "slop-toast",
              style: {
                background: "linear-gradient(135deg, rgba(23,20,31,.96), rgba(40,34,58,.92))",
                color: "hsl(var(--paper))",
                border: "1px solid rgba(168,132,255,.28)",
                borderRadius: "16px",
                boxShadow: "0 18px 50px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08)",
                backdropFilter: "blur(18px)",
                fontFamily: "var(--font-body)",
                fontWeight: 700,
                fontSize: "12px",
                padding: "12px 14px",
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
