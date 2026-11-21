import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mic, MicOff, Headphones, HeadphoneOff, Video, VideoOff, Settings2, ChevronUp, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { useAudio } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui";
import { SpeakingRing } from "./SpeakingRing";
import { BadgeChips } from "./BadgeChips";
import { SlopAvatar } from "./SlopAvatar";

const statusLabel: Record<string, string> = {
  online: "Çevrimiçi", idle: "Boşta", dnd: "Rahatsız Etme", offline: "Görünmez",
};
const statusClass: Record<string, string> = {
  online: "status-online", idle: "status-idle", dnd: "status-dnd", offline: "status-offline",
};

function ProfilePopover() {
  const profile = useApp((s) => s.profile);
  const badges = useApp((s) => s.user?.badges ?? []);
  const servers = useApp((s) => s.servers);
  const setView = useApp((s) => s.setView);
  const updateProfile = useApp((s) => s.updateProfile);
  const statuses = ["online", "idle", "dnd", "offline"] as const;
  const level = useAudio((s) => s.level);
  const micOn = useApp((s) => s.micOn);
  const displayName = profile.displayName || profile.name;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: .96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: .97 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="glass absolute bottom-[calc(100%+12px)] left-0 w-[300px] overflow-hidden rounded-panel shadow-float"
    >
      <div className="h-16 w-full bg-cover bg-center" style={profile.bannerUrl ? { backgroundImage: `url(${profile.bannerUrl})` } : { background: `linear-gradient(120deg, ${profile.color}55, transparent 60%), radial-gradient(circle at 80% 20%, #C9F25B33, transparent 50%)` }} />
      <div className="-mt-7 px-5 pb-5">
      <div className="flex items-end gap-3">
        <div className="relative">
          <SlopAvatar name={displayName} src={profile.avatarUrl} size={56} status={profile.status} showDot className="ring-4 ring-[#17141f]" />
          <SpeakingRing level={micOn ? level : 0} color={profile.color} size={56} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
              <p className="truncate font-display text-[15px] font-extrabold">{displayName}</p>
              <BadgeChips badges={badges} compact />
            </div>
            <p className="truncate text-[11px] text-muted">{displayName} @{profile.name}#{profile.tag}</p>
            <p className="mt-0.5 text-[10.5px]" style={{ color: profile.color }}>{profile.customStatus}</p>
            {profile.activity && <p className="mt-0.5 truncate text-[9.5px] text-lime">{profile.activity}</p>}
          </div>
      </div>
      <p className="mt-4 text-[11.5px] leading-relaxed text-paper/75">{profile.bio}</p>
      {servers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {servers.map((server) => (
            <span key={server.id} className="rounded-full bg-white/[.06] px-2 py-1 text-[9.5px] font-bold text-muted">{server.name}</span>
          ))}
        </div>
      )}
      <p className="category-label !mt-4 !px-0">Durum</p>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {statuses.map((status) => (
          <button
            key={status}
            onClick={() => { updateProfile({ status }); toast.success(`Durum: ${statusLabel[status]}`); }}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[8.5px] font-bold transition",
              profile.status === status ? "border-brand/50 bg-brand/12 text-paper" : "border-white/[.06] text-muted hover:bg-white/[.05]",
            )}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", statusClass[status])} />
            {statusLabel[status].split(" ")[0]}
          </button>
        ))}
      </div>
      <button onClick={() => setView("settings")} className="btn btn-ghost mt-4 w-full text-[11px]">Profili düzenle</button>
      </div>
    </motion.div>
  );
}

export function Dock() {
  const [profileOpen, setProfileOpen] = useState(false);
  const profile = useApp((s) => s.profile);
  const badges = useApp((s) => s.user?.badges ?? []);
  const micOn = useApp((s) => s.micOn);
  const camOn = useApp((s) => s.camOn);
  const deafened = useApp((s) => s.deafened);
  const toggleMic = useApp((s) => s.toggleMic);
  const toggleCam = useApp((s) => s.toggleCam);
  const toggleDeafen = useApp((s) => s.toggleDeafen);
  const setView = useApp((s) => s.setView);
  const activeServer = useApp((s) => s.activeServer);
  const selectServer = useApp((s) => s.selectServer);
  const servers = useApp((s) => s.servers);
  const voiceConnected = useApp((s) => s.voiceConnected);
  const voiceChannel = useApp((s) => s.voiceChannel);
  const level = useAudio((s) => s.level);
  const audioStatus = useAudio((s) => s.status);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4">
      <div className="pointer-events-auto relative flex items-center gap-2 rounded-full border border-white/[.09] bg-[#17141f]/90 px-2.5 py-2 shadow-float backdrop-blur-2xl">
        <AnimatePresence>{profileOpen && <ProfilePopover />}</AnimatePresence>

        <button
          onClick={() => setProfileOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition hover:bg-white/[.06]"
        >
          <div className="relative">
            <SlopAvatar name={profile.displayName || profile.name} src={profile.avatarUrl} size={36} status={profile.status} showDot />
            <SpeakingRing level={micOn ? level : 0} color={profile.color} size={36} />
          </div>
          <div className="hidden text-left sm:block">
            <div className="flex items-center gap-1.5">
              <p className="max-w-[110px] truncate text-[11.5px] font-extrabold">{profile.displayName || profile.name}</p>
              <BadgeChips badges={badges} compact />
            </div>
            <p className="max-w-[130px] truncate text-[9.5px] text-muted">{statusLabel[profile.status]} • {profile.customStatus}</p>
          </div>
          <ChevronUp size={12} className={cn("text-muted transition-transform", profileOpen && "rotate-180")} />
        </button>

        <div className="h-7 w-px bg-white/10" />

        <div className="flex items-center gap-0.5">
          <Tooltip><TooltipTrigger asChild>
            <button
              aria-label={micOn ? "Mikrofonu kapat" : "Mikrofonu aç"}
              onClick={() => {
                toggleMic();
                if (!micOn && audioStatus === "denied") toast.error("Mikrofon izni gerekli");
              }}
              className="icon-btn relative"
              data-active={micOn}
              data-off={!micOn}
              style={micOn && level > 0.08 ? { boxShadow: `0 0 0 ${Math.round(level * 5)}px rgba(139,108,255,${Math.min(.35, level * .5)})` } : undefined}
            >
              {micOn ? <Mic size={16} /> : <MicOff size={16} />}
            </button>
          </TooltipTrigger><TooltipContent>{micOn ? "Mikrofonu kapat" : "Mikrofonu aç"}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <button aria-label={deafened ? "Sesi aç" : "Sesi kapat"} onClick={toggleDeafen} className="icon-btn" data-active={!deafened} data-off={deafened}>{deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}</button>
          </TooltipTrigger><TooltipContent>{deafened ? "Sesi aç" : "Sesi kapat"}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <button aria-label={camOn ? "Kamerayı kapat" : "Kamerayı aç"} onClick={toggleCam} className="icon-btn" data-active={camOn}>{camOn ? <Video size={16} /> : <VideoOff size={16} />}</button>
          </TooltipTrigger><TooltipContent>{camOn ? "Kamerayı kapat" : "Kamerayı aç"}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <button aria-label="Ayarlar" onClick={() => setView("settings")} className="icon-btn"><Settings2 size={16} /></button>
          </TooltipTrigger><TooltipContent>Ayarlar</TooltipContent></Tooltip>
        </div>

        {voiceConnected && (
          <>
            <div className="h-7 w-px bg-white/10" />
            <button onClick={() => setView("app")} className="flex items-center gap-2 rounded-full bg-lime/10 px-3 py-1.5 text-[10px] font-bold text-lime">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" /><span className="relative h-2 w-2 rounded-full bg-lime" /></span>
              <span className="hidden md:inline">{voiceChannel}</span>
              <Sparkles size={11} />
            </button>
          </>
        )}

        <div className="h-7 w-px bg-white/10" />

        <div className="hidden items-center gap-1.5 md:flex">
          {servers.map((server) => (
            <Tooltip key={server.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => selectServer(server.id)}
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-[13px] font-display text-[10px] font-black transition-all hover:-translate-y-1 hover:rounded-full",
                    activeServer === server.id ? "bg-brand text-ink shadow-glow" : "bg-white/[.07] text-muted hover:text-paper",
                  )}
                >
                  {server.name.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase()}
                </button>
              </TooltipTrigger>
              <TooltipContent>{server.name}</TooltipContent>
            </Tooltip>
          ))}
          <button onClick={() => useApp.getState().setCreateServerOpen(true)} className="grid h-9 w-9 place-items-center rounded-[13px] bg-white/[.05] text-lime transition hover:-translate-y-1 hover:rounded-full">+</button>
        </div>
      </div>
    </div>
  );
}
