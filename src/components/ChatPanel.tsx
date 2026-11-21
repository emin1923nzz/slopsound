import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "motion/react";
import {
  Hash, Volume2, Megaphone, Pin, Bell, Search, Plus, Smile,
  ArrowUp, Sparkles, Phone, Video, MoreHorizontal, Mic, Square, Play,
  Reply, Copy, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { formatDuration, useAudio } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui";
import { BadgeChips } from "./BadgeChips";
import { SlopAvatar } from "./SlopAvatar";

function ChannelHeader() {
  const activeChannel = useApp((s) => s.activeChannel);
  const sidebarTab = useApp((s) => s.sidebarTab);
  const activeDM = useApp((s) => s.activeDM);
  const joinVoice = useApp((s) => s.joinVoice);
  const channelGroups = useApp((s) => s.channelGroups);
  const dms = useApp((s) => s.dms);
  const voiceChannelId = useApp((s) => s.voiceChannelId);

  const channel = useMemo(
    () => channelGroups.flatMap((g) => g.channels).find((c) => c.id === activeChannel),
    [activeChannel, channelGroups],
  );
  const dm = dms.find((d) => d.id === activeDM);
  const isDM = sidebarTab === "dms";
  const title = isDM ? dm?.name ?? "DM" : channel?.name ?? "genel";
  const description = isDM ? dm?.preview ?? "" : channel?.description ?? "";
  const Icon = channel?.type === "voice" ? Volume2 : channel?.type === "announcement" ? Megaphone : Hash;

  return (
    <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-white/[.06] bg-surface/30 px-5 backdrop-blur-xl">
      {isDM ? <SlopAvatar name={title} size={36} /> : <div className="grid h-9 w-9 place-items-center rounded-[13px] bg-brand/12 text-brand"><Icon size={17} /></div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate font-display text-[15px] font-extrabold tracking-tight">{title}</h2>
          {channel?.live && <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[9px] font-black tracking-wider text-lime">CANLI</span>}
        </div>
        <p className="truncate text-[11px] text-muted">{description}</p>
      </div>
      <div className="flex items-center gap-0.5">
        <Tooltip><TooltipTrigger asChild><button className="icon-btn"><Pin size={16} /></button></TooltipTrigger><TooltipContent>Sabitlenenler</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><button className="icon-btn"><Bell size={16} /></button></TooltipTrigger><TooltipContent>Bildirimler</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><button className="icon-btn"><Search size={16} /></button></TooltipTrigger><TooltipContent>Ara</TooltipContent></Tooltip>
        <div className="mx-1.5 h-5 w-px bg-white/10" />
        <Tooltip><TooltipTrigger asChild><button aria-label="Sesli arama" onClick={() => {
          const voiceId = voiceChannelId ?? channelGroups.flatMap((g) => g.channels).find((c) => c.type === "voice")?.id;
          if (voiceId) void joinVoice(voiceId);
        }} className="icon-btn text-lime"><Phone size={16} /></button></TooltipTrigger><TooltipContent>Sesli arama</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><button aria-label="Görüntülü arama" onClick={() => toast("Görüntülü arama yakında")} className="icon-btn"><Video size={16} /></button></TooltipTrigger><TooltipContent>Görüntülü arama</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><button className="icon-btn"><MoreHorizontal size={17} /></button></TooltipTrigger><TooltipContent>Daha fazla</TooltipContent></Tooltip>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: import("@/lib/data").Message }) {
  const reactToMessage = useApp((s) => s.reactToMessage);
  const setReplyTo = useApp((s) => s.setReplyTo);
  const deleteMessage = useApp((s) => s.deleteMessage);
  const [dragX, setDragX] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const drag = useRef({ active: false, startX: 0, startY: 0, moved: false, x: 0 });
  const longPress = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(longPress.current), []);

  function reply() {
    setReplyTo({ id: message.id, author: message.author, text: message.text });
    setMenuOpen(false);
    setDragX(0);
    drag.current.x = 0;
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    drag.current = { active: true, startX: event.clientX, startY: event.clientY, moved: false, x: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    longPress.current = window.setTimeout(() => {
      if (!drag.current.moved) {
        setMenuOpen(true);
        setDragX(0);
        drag.current.x = 0;
      }
    }, 400);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    const dx = event.clientX - drag.current.startX;
    const dy = event.clientY - drag.current.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      drag.current.moved = true;
      window.clearTimeout(longPress.current);
    }
    if (dx > 0 && Math.abs(dx) > Math.abs(dy)) {
      drag.current.x = Math.min(dx, 96);
      setDragX(drag.current.x);
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    window.clearTimeout(longPress.current);
    if (!drag.current.active) return;
    drag.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.current.x > 64) reply();
    else { setDragX(0); drag.current.x = 0; }
  }

  function copyText() {
    setMenuOpen(false);
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(message.text)
      .then(() => toast.success("Mesaj kopyalandı"))
      .catch(() => toast.error("Mesaj kopyalanamadı"));
  }

  return (
    <div className="msg group flex gap-3" data-mention={message.mention}>
      <SlopAvatar name={message.author} size={36} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {menuOpen && <div className="context-backdrop active" onClick={() => setMenuOpen(false)} />}
        <div className={cn("message-wrapper", menuOpen && "message-focused")}>
          <span
            className="reply-indicator"
            style={{ opacity: dragX > 20 ? 1 : 0, transform: `scale(${dragX > 20 ? 1 : .5})` }}
          ><Reply size={17} className="text-brand" /></span>
          <div
            className="message-bubble"
            data-own={message.own ? "true" : "false"}
            style={{ transform: `translateX(${dragX}px)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[12.5px] font-extrabold" style={{ color: message.color }}>{message.author}</span>
              {message.ai && <span className="rounded-full bg-brand/20 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-brand">AI</span>}
              <BadgeChips badges={message.badges} compact />
              <span className="text-[10px] text-muted/70">{message.time}</span>
            </div>
            <p className={cn("mt-0.5 text-[13px] leading-relaxed text-paper/85", message.ai && "text-paper")}>{message.text}</p>
            {message.audioUrl && (
              <div className="mt-2 flex max-w-[320px] items-center gap-3 rounded-2xl border border-brand/20 bg-brand/[.07] px-3 py-2">
                <button
                  aria-label="Sesli mesajı oynat"
                  onClick={() => { const a = new Audio(message.audioUrl); void a.play().catch(() => undefined); }}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-ink transition hover:scale-110"
                ><Play size={13} fill="currentColor" /></button>
                <div className="min-w-0 flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 rounded-full bg-brand" /></div>
                  <p className="mt-1 text-[9.5px] text-muted">Sesli mesaj • {formatDuration(message.duration ?? 0)}</p>
                </div>
              </div>
            )}
            {message.reactions && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    onClick={() => void reactToMessage(message.id, r.emoji)}
                    className="rounded-full border border-white/10 bg-white/[.05] px-2 py-0.5 text-[11px] transition hover:border-brand/50"
                  >
                    {r.emoji} <span className="text-[10px] font-bold text-muted">{r.count}</span>
                  </button>
                ))}
              </div>
            )}
            {menuOpen && (
              <div className="ios-menu" onClick={(event) => event.stopPropagation()}>
                <button onClick={reply}><Reply size={14} className="text-brand" /> Yanıtla</button>
                <button onClick={() => { void reactToMessage(message.id, "👍"); setMenuOpen(false); }}><Smile size={14} className="text-warn" /> Tepki ekle</button>
                <button onClick={copyText}><Copy size={14} className="text-muted" /> Metni kopyala</button>
                {message.own && (
                  <button onClick={() => { deleteMessage(message.id); setMenuOpen(false); toast.success("Mesaj silindi"); }} className="text-danger"><Trash2 size={14} /> Sil</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition group-hover:opacity-100">
        <button onClick={reply} className="icon-btn h-7 w-7"><Reply size={14} /></button>
        <button onClick={() => void reactToMessage(message.id, "👍")} className="icon-btn h-7 w-7"><Smile size={14} /></button>
      </div>
    </div>
  );
}

function MessageList() {
  const messages = useApp((s) => s.messages);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 74,
    overscan: 8,
  });

  useEffect(() => {
    virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
  }, [messages.length, virtualizer]);

  return (
    <div ref={parentRef} className="no-scrollbar relative flex-1 overflow-y-auto px-4 pb-6 pt-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 rounded-card border border-brand/15 bg-brand/[.05] p-5">
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-brand/20 text-brand"><Sparkles size={18} /></div>
          <h3 className="font-display text-[17px] font-extrabold tracking-tight">Burasi SlopSound</h3>
          <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted">
            Kendi tarzımız var: yumuşak, sade, hızlı. İlk mesajını at, Sunlop yazarsan cevap versin.
          </p>
        </div>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => (
            <div
              key={messages[item.index].id}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <MessageRow message={messages[item.index]} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Composer() {
  const [value, setValue] = useState("");
  const sendMessage = useApp((s) => s.sendMessage);
  const sendVoiceMessage = useApp((s) => s.sendVoiceMessage);
  const notifyTyping = useApp((s) => s.notifyTyping);
  const replyTo = useApp((s) => s.replyTo);
  const setReplyTo = useApp((s) => s.setReplyTo);
  const setSidebarTab = useApp((s) => s.setSidebarTab);
  const selectDM = useApp((s) => s.selectDM);
  const dms = useApp((s) => s.dms);
  const recording = useAudio((s) => s.recording);
  const recordingSeconds = useAudio((s) => s.recordingSeconds);
  const lastRecordingUrl = useAudio((s) => s.lastRecordingUrl);
  const startRecording = useAudio((s) => s.startRecording);
  const stopRecording = useAudio((s) => s.stopRecording);
  const shouldSend = useRef(false);
  const recordedDuration = useRef(0);

  useEffect(() => {
    if (!recording && lastRecordingUrl && shouldSend.current) {
      shouldSend.current = false;
      void sendVoiceMessage(lastRecordingUrl, recordedDuration.current || 1);
      toast.success("Sesli mesaj gönderildi");
    }
  }, [recording, lastRecordingUrl, recordingSeconds, sendVoiceMessage]);

  async function toggleRecording() {
    if (recording) { shouldSend.current = true; recordedDuration.current = recordingSeconds; stopRecording(); return; }
    const ok = await startRecording();
    if (!ok) toast.error("Sesli mesaj için mikrofon izni gerekli");
  }

  async function submit() {
    const text = value.trim();
    if (!text) return;
    const body = replyTo ? `> ${replyTo.author}: ${replyTo.text}\n${text}` : text;
    const ok = await sendMessage(body);
    if (ok) { setValue(""); setReplyTo(null); }
    else toast.error(useApp.getState().error ?? "Mesaj gönderilemedi");
  }

  return (
    <div className="relative z-10 px-4 pb-4">
      <div className="mx-auto max-w-3xl">
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-2 flex items-center gap-2 rounded-2xl border border-brand/25 bg-brand/[.08] px-3 py-2 backdrop-blur-xl"
          >
            <Reply size={14} className="shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold text-brand">{replyTo.author} yanıtlanıyor</p>
              <p className="truncate text-[11px] text-muted">{replyTo.text}</p>
            </div>
            <button onClick={() => setReplyTo(null)} aria-label="Yanıtı kaldır" className="icon-btn h-7 w-7"><X size={13} /></button>
          </motion.div>
        )}
        <motion.div
          layout
          className="glass flex items-center gap-2 rounded-full px-2 py-2 shadow-float transition focus-within:border-brand/45 focus-within:shadow-[0_18px_44px_rgba(0,0,0,.46),0_0_0_3px_hsl(var(--brand)/.12)]"
        >
          <button onClick={() => toast("Dosya ekleme yakında")} className="icon-btn h-9 w-9 shrink-0 bg-white/[.05]"><Plus size={17} /></button>
          <button
            aria-label={recording ? "Kaydı bitir ve gönder" : "Sesli mesaj kaydet"}
            onClick={() => void toggleRecording()}
            className={cn("icon-btn h-9 w-9 shrink-0", recording && "bg-danger/20 text-danger")}
          >
            {recording ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}
          </button>
          {recording && <span className="shrink-0 text-[10px] font-bold tabular text-danger">{formatDuration(recordingSeconds)}</span>}
          <input
            value={value}
            onChange={(e) => { setValue(e.target.value); notifyTyping(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
            placeholder="Mesaj yaz... Sunlop yaz, cevap versin"
            className="min-w-0 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-muted/60"
          />
          <button
            onClick={() => {
              const dm = dms.find((item) => item.name.toLowerCase() === "sunlop");
              if (dm) selectDM(dm.id);
              setSidebarTab("dms");
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:scale-110"
            title="Sunlop'a sor"
          ><SlopAvatar name="Sunlop" size={28} /></button>
          <button onClick={() => void submit()} disabled={!value.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-ink transition hover:scale-110 hover:rotate-[-8deg] disabled:opacity-40">
            <ArrowUp size={17} strokeWidth={2.6} />
          </button>
        </motion.div>
        <p className="mt-2 text-center text-[10px] text-muted/50">Enter ile gönder • Sunlop her zaman sol altta</p>
      </div>
    </div>
  );
}

export function ChatPanel() {
  return (
    <main className="relative flex min-w-0 flex-1 flex-col bg-chat/40">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-brand/[.05] to-transparent" />
      <ChannelHeader />
      <MessageList />
      <Composer />
    </main>
  );
}
