import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { useCallStore } from "@/lib/callStore";
import { cn } from "@/lib/utils";
import { SlopAvatar } from "./SlopAvatar";

function StreamVideo({ stream, muted, className }: { stream: MediaStream; muted?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
    return () => { el.srcObject = null; };
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function StreamAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
    return () => { el.srcObject = null; };
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

export function CallOverlay() {
  const incomingCall = useCallStore((s) => s.incomingCall);
  const outgoingCall = useCallStore((s) => s.outgoingCall);
  const activeCall = useCallStore((s) => s.activeCall);
  const localStream = useCallStore((s) => s.localStream);
  const remoteStream = useCallStore((s) => s.remoteStream);
  const micEnabled = useCallStore((s) => s.micEnabled);
  const cameraEnabled = useCallStore((s) => s.cameraEnabled);
  const error = useCallStore((s) => s.error);
  const acceptCall = useCallStore((s) => s.acceptCall);
  const declineCall = useCallStore((s) => s.declineCall);
  const cancelCall = useCallStore((s) => s.cancelCall);
  const endCall = useCallStore((s) => s.endCall);
  const toggleMic = useCallStore((s) => s.toggleMic);
  const toggleCamera = useCallStore((s) => s.toggleCamera);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const call = incomingCall ?? outgoingCall ?? activeCall;
  const isIncoming = Boolean(incomingCall);
  const isOutgoing = Boolean(outgoingCall);
  const isActive = Boolean(activeCall);
  const isVideo = call?.mode === "video";

  return (
    <AnimatePresence>
      {call && (
        <motion.div
          key="call-overlay"
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          className="no-drag pointer-events-auto fixed bottom-6 right-6 z-[130] w-[min(360px,calc(100vw-32px))]"
        >
          <div className="glass glass-card overflow-hidden rounded-panel shadow-float">
            <div className="flex items-center gap-2 border-b border-white/[.06] px-4 py-3">
              <div className={cn("grid h-8 w-8 place-items-center rounded-[12px]", isVideo ? "bg-brand/15 text-brand" : "bg-lime/15 text-lime")}>
                {isVideo ? <Video size={16} /> : <Phone size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[13px] font-extrabold">{isVideo ? "Görüntülü arama" : "Sesli arama"}</p>
                <p className="text-[10px] text-muted">{isIncoming ? "Gelen arama" : isOutgoing ? "Aranıyor..." : "Bağlandı"}</p>
              </div>
              {isActive && <span className="flex items-center gap-1 rounded-full bg-lime/15 px-2 py-0.5 text-[9px] font-black tracking-wider text-lime"><span className="h-1.5 w-1.5 rounded-full bg-lime" /> CANLI</span>}
            </div>

            {isActive && isVideo ? (
              <div className="relative aspect-video bg-black/40">
                {remoteStream ? (
                  <StreamVideo stream={remoteStream} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center">
                    <div className="flex flex-col items-center gap-2">
                      <SlopAvatar name={call.peer.username} size={56} className="ring-2 ring-white/10" />
                      <p className="text-[10px] text-muted">Bağlanıyor...</p>
                    </div>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3">
                  <span className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold backdrop-blur">{call.peer.username}</span>
                  {localStream && (
                    <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-ink shadow-lg">
                      <StreamVideo stream={localStream} muted className="h-full w-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-5">
                {isActive && remoteStream && <StreamAudio stream={remoteStream} />}
                <SlopAvatar name={call.peer.username} size={isActive ? 64 : 56} className="ring-2 ring-white/10" />
                <p className="max-w-full truncate font-display text-[15px] font-extrabold">{call.peer.username}</p>
                <p className="text-[10px] text-muted">
                  {isIncoming ? `${isVideo ? "Görüntülü" : "Sesli"} arama yapıyor` : isOutgoing ? "Aranıyor..." : isVideo ? "Görüntülü arama" : "Sesli bağlantı"}
                </p>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 border-t border-white/[.06] px-4 py-3">
              {isIncoming ? (
                <>
                  <button onClick={declineCall} className="btn btn-danger px-4 py-2 text-[12px]"><PhoneOff size={14} /> Reddet</button>
                  <button onClick={acceptCall} className="btn btn-lime px-4 py-2 text-[12px]">{isVideo ? <Video size={14} /> : <Phone size={14} />} Kabul Et</button>
                </>
              ) : isOutgoing ? (
                <button onClick={cancelCall} className="btn btn-danger px-4 py-2 text-[12px]"><PhoneOff size={14} /> İptal</button>
              ) : (
                <>
                  <button aria-label={micEnabled ? "Mikrofonu kapat" : "Mikrofonu aç"} onClick={toggleMic} className="icon-btn" data-active={micEnabled} data-off={!micEnabled}>
                    {micEnabled ? <Mic size={17} /> : <MicOff size={17} />}
                  </button>
                  <button aria-label={cameraEnabled ? "Kamerayı kapat" : "Kamerayı aç"} onClick={toggleCamera} disabled={!isVideo} className="icon-btn disabled:opacity-40" data-active={cameraEnabled} data-off={!cameraEnabled && isVideo}>
                    {cameraEnabled ? <Video size={17} /> : <VideoOff size={17} />}
                  </button>
                  <div className="mx-1 h-6 w-px bg-white/10" />
                  <button aria-label="Aramayı bitir" onClick={endCall} className="grid h-9 w-9 place-items-center rounded-full bg-danger text-white transition hover:scale-110"><PhoneOff size={16} /></button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
