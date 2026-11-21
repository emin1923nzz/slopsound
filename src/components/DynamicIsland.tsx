import { useState } from "react";
import { Mic, MicOff, PhoneOff, Wifi } from "lucide-react";
import { useApp } from "@/lib/store";
import { useAudio } from "@/lib/audio";
import { useLiveKit } from "@/lib/livekit";
import { SlopAvatar } from "./SlopAvatar";

export function DynamicIsland() {
  const [expanded, setExpanded] = useState(false);
  const voiceConnected = useApp((s) => s.voiceConnected);
  const voiceChannel = useApp((s) => s.voiceChannel);
  const micOn = useApp((s) => s.micOn);
  const toggleMic = useApp((s) => s.toggleMic);
  const leaveVoice = useApp((s) => s.leaveVoice);
  const profileName = useApp((s) => s.profile.name);
  const level = useAudio((s) => s.level);
  const participants = useLiveKit((s) => s.participants.length);
  const rtt = useLiveKit((s) => s.stats.rttMs);

  if (!voiceConnected) return null;

  function toggle() {
    setExpanded((value) => !value);
    if (navigator.vibrate) navigator.vibrate(15);
  }

  const ringScale = 1 + Math.min(level, 1) * 0.35;
  const ringOpacity = Math.min(level * 1.6, 0.95);

  return (
    <div
      className={`island-pill no-drag ${expanded ? "expanded" : ""}`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        toggle();
      }}
      role="button"
      tabIndex={0}
      aria-label="Sesli sohbet paneli"
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") toggle(); }}
    >
      <div className="island-compact">
        <span className="pulse-dot" />
        <span className="min-w-0 flex-1 truncate text-center">{voiceChannel || "Sesli Sohbet"}</span>
        <div className="audio-wave"><span /><span /><span /></div>
      </div>
      <div className="island-expanded">
        <div className="flex items-center gap-3">
          <div className="relative grid h-12 w-12 shrink-0 place-items-center">
            <div className="voice-ring" style={{ transform: `scale(${ringScale})`, opacity: ringOpacity }} />
            <SlopAvatar name={profileName || "Sen"} size={44} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-[13px] font-extrabold">{profileName || "Sen"}</h4>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-white/60">
              <Wifi size={10} /> Ses Bağlantısı Güçlü • {rtt || 12}ms • {participants + 1} kişi
            </p>
          </div>
        </div>
        <div className="island-controls">
          <button
            className="btn-glass"
            aria-label={micOn ? "Mikrofonu kapat" : "Mikrofonu aç"}
            onClick={(event) => { event.stopPropagation(); toggleMic(); }}
          >
            {micOn ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
          <button
            className="btn-danger-glass"
            aria-label="Sesli sohbette ayrıl"
            onClick={(event) => { event.stopPropagation(); leaveVoice(); setExpanded(false); }}
          >
            <PhoneOff size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
