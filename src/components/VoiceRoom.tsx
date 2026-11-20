import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, Headphones, HeadphoneOff, PhoneOff,
  Users, Signal, Sparkles, ArrowLeft, Radio, Circle, RefreshCw, Activity, Monitor, AppWindow, HardDrive,
} from "lucide-react";
import { toast } from "sonner";
import { ConnectionState, type RemoteVideoTrack } from "livekit-client";
import { useApp } from "@/lib/store";
import { useAudio } from "@/lib/audio";
import { useVideo, resolutions, qualityOptions } from "@/lib/video";
import { useLiveKit } from "@/lib/livekit";
import { useRecording } from "@/lib/recording";
import { cn } from "@/lib/utils";
import { SpeakingRing } from "./SpeakingRing";
import { SlopAvatar } from "./SlopAvatar";

const simulated = [
  { id: "deniz", name: "Deniz", color: "#C9F25B", mic: true, cam: false, role: "Yayında" },
  { id: "ahmet", name: "Ahmet", color: "#FF7460", mic: true, cam: true, role: "Valorant" },
  { id: "yagmur", name: "Yağmur", color: "#FFBA4A", mic: false, cam: false, role: "Müzik dinliyor" },
  { id: "mehmet", name: "Mehmet", color: "#4AD6EB", mic: true, cam: false, role: "Burada" },
];

type TileProps = {
  id: string;
  name: string;
  color: string;
  role: string;
  micOn: boolean;
  camOn: boolean;
  speaking: boolean;
  level?: number;
  isSelf?: boolean;
  track?: RemoteVideoTrack | null;
  localStream?: MediaStream | null;
  screen?: boolean;
};

function VideoTile({ id, name, color, role, micOn, camOn, speaking, level = 0, isSelf, track, localStream, screen }: TileProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const attachTrack = useLiveKit((s) => s.attachTrack);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (track) {
      attachTrack(el, track);
      return () => { try { track.detach(el); } catch { /* zaten ayrıldı */ } };
    }
    if (localStream) {
      el.srcObject = localStream;
      void el.play().catch(() => undefined);
    }
  }, [track, localStream, attachTrack]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: .94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={cn("voice-tile relative flex aspect-[4/3] flex-col items-center justify-center gap-3 p-4", screen && "col-span-2 aspect-video")}
      data-speaking={speaking}
      data-tile={id}
    >
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `radial-gradient(circle at 50% 30%, ${color}22, transparent 65%)` }} />
      {(camOn || screen) && <video ref={ref} autoPlay playsInline muted={isSelf || !track} className="absolute inset-0 h-full w-full object-cover" />}
      <div className="relative">
        <SlopAvatar name={name} size={64} className={cn("ring-2 ring-white/10", (camOn || screen) && "opacity-0")} />
        <SpeakingRing level={speaking ? Math.max(level, 0.18) : level} color={color} />
      </div>
      <div className={cn("relative rounded-full bg-black/35 px-3 py-1 text-center backdrop-blur", (camOn || screen) && "bg-black/55")}>
        <p className="font-display text-[13px] font-extrabold">{isSelf ? "Sen" : name}</p>
        <p className="mt-0.5 text-[10px] text-muted">{role}</p>
      </div>
      <div className={cn("absolute bottom-3 right-3 grid h-7 w-7 place-items-center rounded-full", micOn ? "bg-lime/15 text-lime" : "bg-danger/15 text-danger")}>
        {micOn ? <Mic size={13} /> : <MicOff size={13} />}
      </div>
      {screen && <span className="absolute left-3 top-3 rounded-full bg-brand/25 px-2 py-1 text-[9px] font-bold text-brand backdrop-blur">PAYLAŞIM</span>}
      {!screen && camOn && <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2 py-1 text-[9px] font-bold text-paper backdrop-blur">Kamera açık</span>}
    </motion.div>
  );
}

export function VoiceRoom() {
  const voiceChannel = useApp((s) => s.voiceChannel);
  const leaveVoice = useApp((s) => s.leaveVoice);
  const micOn = useApp((s) => s.micOn);
  const camOn = useApp((s) => s.camOn);
  const deafened = useApp((s) => s.deafened);
  const toggleMic = useApp((s) => s.toggleMic);
  const toggleCam = useApp((s) => s.toggleCam);
  const toggleDeafen = useApp((s) => s.toggleDeafen);
  const speakingId = useApp((s) => s.speakingId);
  const setSpeaking = useApp((s) => s.setSpeaking);
  const profile = useApp((s) => s.profile);

  const levels = useAudio((s) => s.levels);
  const level = useAudio((s) => s.level);
  const audioStatus = useAudio((s) => s.status);
  const pushToTalk = useAudio((s) => s.pushToTalk);

  const videoStream = useVideo((s) => s.stream);
  const screenSharingLocal = useVideo((s) => s.screenSharing);
  const resolution = useVideo((s) => s.resolution);
  const fps = useVideo((s) => s.fps);
  const quality = useVideo((s) => s.quality);
  const codec = useVideo((s) => s.codec);
  const webCodecs = useVideo((s) => s.webCodecsSupported);
  const attachScreen = useVideo((s) => s.attachScreen);

  const liveStatus = useLiveKit((s) => s.status);
  const liveParticipants = useLiveKit((s) => s.participants);
  const liveScreens = useLiveKit((s) => s.screens);
  const activeSpeakerIds = useLiveKit((s) => s.activeSpeakerIds);
  const liveScreenSharing = useLiveKit((s) => s.screenSharing);
  const setScreenShare = useLiveKit((s) => s.setScreenShare);
  const stats = useLiveKit((s) => s.stats);
  const reconnect = useLiveKit((s) => s.reconnect);
  const screenSource = useVideo((s) => s.screenSource);
  const setScreenSource = useVideo((s) => s.setScreenSource);
  const shareSystemAudio = useVideo((s) => s.shareSystemAudio);
  const setShareSystemAudio = useVideo((s) => s.setShareSystemAudio);
  const screenHasSystemAudio = useVideo((s) => s.screenHasSystemAudio);
  const recording = useRecording((s) => s.recording);
  const recordingMode = useRecording((s) => s.mode);
  const startRecording = useRecording((s) => s.start);
  const stopRecording = useRecording((s) => s.stop);
  const screenSharing = liveScreenSharing || screenSharingLocal;

  const [showJoin, setShowJoin] = useState(true);
  const [simLevels, setSimLevels] = useState<Record<string, number>>({});
  useEffect(() => {
    const timer = window.setTimeout(() => setShowJoin(false), 1700);
    return () => window.clearTimeout(timer);
  }, []);

  const chartData = levels.map((v, i) => ({ t: i, v: Math.round(v * 100) }));
  const preset = resolutions.find((r) => r.id === resolution) ?? resolutions[2];
  const qualityLabel = qualityOptions.find((q) => q.id === quality)?.label.split(" ")[0] ?? "Orta";

  useEffect(() => {
    const ids = simulated.map((p) => p.id);
    const speakerTimer = window.setInterval(() => setSpeaking(ids[Math.floor(Math.random() * ids.length)]), 1600);
    const levelTimer = window.setInterval(() => {
      const next: Record<string, number> = {};
      ids.forEach((id) => { next[id] = Math.random() * 0.85; });
      setSimLevels(next);
    }, 110);
    return () => { window.clearInterval(speakerTimer); window.clearInterval(levelTimer); };
  }, [setSpeaking]);

  const selfSpeaking = micOn && !deafened && level > 0.12;
  const connected = liveStatus === ConnectionState.Connected;

  return (
    <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-ink/40">
      <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-1/3 h-72 w-72 rounded-full bg-lime/[.06] blur-3xl" />

      <AnimatePresence>
        {showJoin && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.08 }}
            transition={{ duration: .45 }}
            className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-ink/85 backdrop-blur-sm"
          >
            <motion.div initial={{ scale: .7, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 20 }} className="text-center">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }} className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-lime/15 text-lime">
                <Signal size={28} />
              </motion.div>
              <p className="mt-4 font-display text-[20px] font-extrabold">{voiceChannel}</p>
              <p className="mt-1 text-[11px] text-muted">Sesli odaya bağlanılıyor…</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative flex h-[60px] shrink-0 items-center gap-3 border-b border-white/[.06] px-5">
        <button aria-label="Sesli odadan ayrıl" onClick={leaveVoice} className="icon-btn"><ArrowLeft size={17} /></button>
        <div className="grid h-9 w-9 place-items-center rounded-[13px] bg-lime/15 text-lime"><Signal size={17} /></div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[15px] font-extrabold">{voiceChannel}</h2>
            <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[9px] font-black tracking-wider text-lime">CANLI</span>
            {recording && <span className="flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[9px] font-black tracking-wider text-danger"><Circle size={7} fill="currentColor" /> {recordingMode === "meeting" ? "KAYIT" : "YEREL KAYIT"}</span>}
          </div>
          <p className="text-[11px] text-muted">
            {connected ? "LiveKit • WebRTC" : "Yerel mod"} • {preset.label.split(" ")[0]} / {fps} FPS / {codec.toUpperCase()} / {qualityLabel}
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-white/[.07] bg-white/[.04] px-3 py-1.5 sm:flex">
          <Radio size={13} className={connected ? "text-lime" : "text-brand"} />
          <span className="text-[10px] font-bold text-muted">{connected ? "Sunucu bağlı" : "Yerel önizleme"}</span>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-white/[.07] bg-white/[.04] px-3 py-1.5 md:flex">
          <Users size={13} className="text-brand" />
          <span className="tabular text-[10px] font-bold text-muted">{liveParticipants.length + 1} kişi</span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 gap-4 p-5 pb-28">
        <div className="grid min-h-0 flex-1 grid-cols-2 content-center gap-3 lg:grid-cols-3">
          {simulated.map((person) => (
            <VideoTile
              key={person.id}
              id={person.id}
              name={person.name}
              color={person.color}
              role={person.role}
              micOn={person.mic}
              camOn={person.cam}
              speaking={speakingId === person.id}
              level={person.mic ? simLevels[person.id] ?? 0 : 0}
            />
          ))}
          {liveParticipants.map((p) => (
            <VideoTile
              key={p.id}
              id={p.id}
              name={p.name}
              color={p.color}
              role="LiveKit"
              micOn={p.audioOn}
              camOn={p.cameraOn}
              speaking={activeSpeakerIds.includes(p.id)}
              level={p.audioLevel}
              track={p.videoTrack}
            />
          ))}
          <VideoTile
            id="self"
            name={profile.name}
            color={profile.color}
            role={pushToTalk ? "Bas-konuş • V" : "Sen"}
            micOn={micOn}
            camOn={camOn}
            speaking={selfSpeaking}
            level={micOn && !deafened ? level : 0}
            isSelf
            localStream={videoStream}
          />
          {screenSharing && (
            liveScreens[0] ? (
              <VideoTile
                id="remote-screen"
                name={liveScreens[0].name}
                color={liveScreens[0].color}
                role="Ekran paylaşımı"
                micOn={false}
                camOn
                speaking={false}
                track={liveScreens[0].videoTrack}
                screen
              />
            ) : (
              <LocalScreenTile attachScreen={attachScreen} />
            )
          )}
        </div>

        <aside className="hidden w-[230px] shrink-0 flex-col gap-3 lg:flex">
          <div className="glass rounded-panel p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-brand" />
              <p className="font-display text-[12px] font-extrabold">Ses seviyesi</p>
            </div>
            <div className="mt-3 h-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="voiceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity={.5} />
                      <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="hsl(var(--brand))" strokeWidth={2} fill="url(#voiceFill)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
              <span>Mikrofon girişi • canlı</span>
              <span className={cn("tabular font-bold", level > 0.12 ? "text-lime" : "text-muted")}>%{Math.round(level * 100)}</span>
            </div>
            <p className="mt-1 text-[9.5px] text-muted/70">
              {audioStatus === "ready" ? "Gerçek mikrofon bağlı" : audioStatus === "denied" ? "Mikrofon izni gerekli" : "Mikrofon bekleniyor"}
            </p>
          </div>
          <div className="glass-soft rounded-panel p-4">
            <div className="flex items-center gap-2 text-muted"><Users size={14} /><p className="text-[11px] font-bold">Katılımcılar</p></div>
            <div className="mt-3 space-y-2">
              {[...simulated.map((p) => ({ id: p.id, name: p.name, color: p.color, mic: p.mic })), ...liveParticipants.map((p) => ({ id: p.id, name: p.name, color: p.color, mic: p.audioOn }))].map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                  <span className="flex-1 text-[11px] text-paper/80">{p.name}</span>
                  {p.mic ? <Mic size={11} className="text-lime" /> : <MicOff size={11} className="text-muted" />}
                </div>
              ))}
            </div>
          </div>
          <div className="glass-soft rounded-panel p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted"><Activity size={14} /><p className="text-[11px] font-bold">Bağlantı kalitesi</p></div>
              <button aria-label="Bağlantıyı yeniden kur" onClick={() => void reconnect()} className="icon-btn h-6 w-6"><RefreshCw size={12} /></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-white/[.04] p-2"><p className="tabular font-display text-[15px] font-extrabold text-lime">{stats.rttMs || "—"}<span className="text-[9px] text-muted"> ms</span></p><p className="text-[9px] text-muted">Ping</p></div>
              <div className="rounded-xl bg-white/[.04] p-2"><p className="tabular font-display text-[15px] font-extrabold text-warn">{stats.packetLoss}<span className="text-[9px] text-muted">%</span></p><p className="text-[9px] text-muted">Paket kaybı</p></div>
              <div className="rounded-xl bg-white/[.04] p-2"><p className="tabular font-display text-[15px] font-extrabold text-brand">{stats.jitterMs}<span className="text-[9px] text-muted"> ms</span></p><p className="text-[9px] text-muted">Jitter</p></div>
              <div className="rounded-xl bg-white/[.04] p-2"><p className="font-display text-[13px] font-extrabold text-paper">{stats.quality}</p><p className="text-[9px] text-muted">Opus • WebRTC</p></div>
            </div>
            <p className="mt-2 text-[9px] text-muted/70">Giriş {stats.kbpsIn} kb/s • Çıkış {stats.kbpsOut} kb/s • STUN/TURN hazır</p>
          </div>
          <div className="glass-soft rounded-panel p-4">
            <div className="flex items-center gap-2 text-muted"><MonitorUp size={14} /><p className="text-[11px] font-bold">Paylaşım kaynağı</p></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button aria-label="Tüm ekranı paylaş" onClick={() => setScreenSource("monitor")} data-active={screenSource === "monitor"} className="icon-btn h-auto flex-col gap-1 py-2 text-[9px]"><Monitor size={14} />Tüm ekran</button>
              <button aria-label="Pencere paylaş" onClick={() => setScreenSource("window")} data-active={screenSource === "window"} className="icon-btn h-auto flex-col gap-1 py-2 text-[9px]"><AppWindow size={14} />Pencere</button>
            </div>
            <button aria-label="Sistem sesini paylaş" onClick={() => setShareSystemAudio(!shareSystemAudio)} data-active={shareSystemAudio} className="mt-2 flex w-full items-center justify-between rounded-xl bg-white/[.04] px-3 py-2 text-[10px] text-paper/80">
              <span>Sistem sesi</span><span className={cn("font-bold", shareSystemAudio ? "text-lime" : "text-muted")}>{shareSystemAudio ? "Açık" : "Kapalı"}</span>
            </button>
            {screenSharing && shareSystemAudio && !screenHasSystemAudio && <p className="mt-2 text-[9px] text-warn">WebView2 sistem sesini vermedi; native WASAPI yakalaması gerekebilir.</p>}
          </div>
          <div className="glass-soft rounded-panel p-4">
            <p className="text-[10px] font-bold text-muted">GÖRÜNTÜ MOTORU</p>
            <div className="mt-2 space-y-1.5 text-[10px] text-paper/75">
              <div className="flex justify-between"><span>Çözünürlük</span><span className="tabular font-bold">{preset.width}×{preset.height}</span></div>
              <div className="flex justify-between"><span>Kare hızı</span><span className="tabular font-bold">{fps} FPS</span></div>
              <div className="flex justify-between"><span>Kalite</span><span className="font-bold">{qualityLabel}</span></div>
              <div className="flex justify-between"><span>Codec</span><span className="font-bold">{codec.toUpperCase()}</span></div>
              <div className="flex justify-between"><span>WebCodecs</span><span className="font-bold">{webCodecs ? "Var" : "Yok"}</span></div>
            </div>
          </div>
        </aside>
      </div>

      <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
        <div className="glass flex items-center gap-1.5 rounded-full px-3 py-2.5 shadow-float">
          <button aria-label={micOn ? "Mikrofonu kapat" : "Mikrofonu aç"} onClick={toggleMic} className="icon-btn" data-active={micOn} data-off={!micOn}>{micOn ? <Mic size={17} /> : <MicOff size={17} />}</button>
          <button aria-label={camOn ? "Kamerayı kapat" : "Kamerayı aç"} onClick={toggleCam} className="icon-btn" data-active={camOn}>{camOn ? <Video size={17} /> : <VideoOff size={17} />}</button>
          <button
            aria-label={screenSharing ? "Paylaşımı durdur" : "Ekranı paylaş"}
            onClick={() => void setScreenShare(!screenSharing).then((ok) => {
              if (!ok) toast.error("Ekran paylaşımı başlatılamadı");
            })}
            className="icon-btn"
            data-active={screenSharing}
          ><MonitorUp size={17} /></button>
          <button aria-label={deafened ? "Sesi aç" : "Sesi kapat"} onClick={toggleDeafen} className="icon-btn" data-active={!deafened} data-off={deafened}>{deafened ? <HeadphoneOff size={17} /> : <Headphones size={17} />}</button>
          <div className="mx-1 h-6 w-px bg-white/10" />
          <button
            aria-label={recording ? "Kaydı durdur" : "Görüşmeyi kaydet"}
            onClick={() => {
              if (recording) { void stopRecording(); return; }
              void startRecording("meeting", screenSharing ? "screen" : "camera").then((ok) => {
                if (ok) toast.success("Kayıt başladı — katılımcılar bilgilendirildi");
              });
            }}
            className="icon-btn"
            data-active={recording}
            data-off={recording}
          ><Circle size={15} fill={recording ? "currentColor" : "none"} /></button>
          <button
            aria-label="Yerel video kaydı"
            onClick={() => void startRecording("local", screenSharing ? "screen" : "camera").then((ok) => {
              if (ok) toast.success("Yerel kayıt başladı");
            })}
            className="icon-btn"
            disabled={recording}
          ><HardDrive size={16} /></button>
          <div className="mx-1 h-6 w-px bg-white/10" />
          <button aria-label="Sesli odadan ayrıl" onClick={() => { leaveVoice(); toast("Sesli odadan ayrıldın"); }} className="grid h-9 w-9 place-items-center rounded-full bg-danger text-white transition hover:scale-110"><PhoneOff size={16} /></button>
        </div>
      </div>
    </main>
  );
}

function LocalScreenTile({ attachScreen }: { attachScreen: (el: HTMLVideoElement | null) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { attachScreen(ref.current); }, [attachScreen]);
  return (
    <div className="voice-tile relative col-span-2 flex aspect-video items-center justify-center">
      <video ref={ref} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-contain" />
      <span className="absolute left-3 top-3 rounded-full bg-brand/25 px-2 py-1 text-[9px] font-bold text-brand backdrop-blur">EKRANIN</span>
    </div>
  );
}
