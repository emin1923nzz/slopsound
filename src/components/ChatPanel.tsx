import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { DialogTitle } from "@radix-ui/react-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "motion/react";
import {
  Hash, Volume2, Megaphone, Pin, Bell, Search, Plus, Smile,
  ArrowUp, ArrowDown, Sparkles, Phone, Video, MoreHorizontal, Mic, Square,
  Reply, Copy, Trash2, X, FileText, Download, Forward,
  Link2, ExternalLink, Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api";
import { startCall } from "@/lib/callStore";
import type { Attachment, Message } from "@/lib/data";
import { formatDuration, useAudio } from "@/lib/audio";
import { openExternalHttp } from "@/lib/native";
import { copyToClipboard, findFirstLink } from "@/lib/context-menu";
import { cn } from "@/lib/utils";
import {
  Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
  ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger, Dialog, DialogContent,
  Tooltip, TooltipContent, TooltipTrigger,
} from "./ui";
import { BadgeChips } from "./BadgeChips";
import { InputContextMenu } from "./InputContextMenu";
import { SlopAvatar } from "./SlopAvatar";

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm",
  "audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "application/pdf",
  "application/zip", "application/x-zip-compressed", "application/json",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "text/markdown", "application/octet-stream",
];
const BLOCKED_ATTACHMENT_MIMES = new Set([
  "text/html", "image/svg+xml", "application/javascript", "text/javascript", "application/x-javascript",
]);
const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  "html", "htm", "svg", "js", "jsx", "ts", "tsx", "php", "exe", "bat", "cmd", "ps1", "sh", "jar", "msi", "scr", "vbs", "hta",
]);

function attachmentKind(file: File): "image" | "video" | "audio" | "file" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

function isAllowedAttachment(file: File): boolean {
  const mime = file.type || "application/octet-stream";
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_ATTACHMENT_MIMES.has(mime) || BLOCKED_ATTACHMENT_EXTENSIONS.has(extension)) return false;
  return ALLOWED_ATTACHMENT_TYPES.includes(mime) || mime.startsWith("application/") || mime.startsWith("text/");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadAttachment(attachment: Attachment) {
  const link = document.createElement("a");
  link.href = attachment.url;
  link.download = attachment.name || "dosya";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function prepareImage(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, 1280 / image.width, 1280 / image.height);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Görsel işlenemedi");
        context.drawImage(image, 0, 0, width, height);
        const mime = file.type === "image/webp" ? "image/webp" : "image/jpeg";
        resolve({
          kind: "image",
          mime,
          name: file.name,
          url: canvas.toDataURL(mime, 0.82),
          bytes: file.size,
          width,
          height,
        });
      } catch {
        reject(new Error("Görsel işlenemedi"));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Görsel okunamadı"));
    };
    image.src = url;
  });
}

function readMedia(file: File, kind: "video" | "audio"): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      kind,
      mime: file.type,
      name: file.name,
      url: String(reader.result),
      bytes: file.size,
    });
    reader.onerror = () => reject(new Error(kind === "audio" ? "Ses okunamadı" : "Video okunamadı"));
    reader.readAsDataURL(file);
  });
}

function readFile(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      kind: "file",
      mime: file.type || "application/octet-stream",
      name: file.name,
      url: String(reader.result),
      bytes: file.size,
    });
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🔥", "🎉", "👀", "🙏", "💯", "😅", "🤝", "✨", "😎"];

type MessageContextMenuProps = {
  message: Message;
  pinned: boolean;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onForward: () => void;
  onPin: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onOpenMedia: (url: string) => void;
  children: ReactNode;
};

function MessageContextMenu({
  message, pinned, onReply, onReact, onForward, onPin, onCopy, onDelete, onOpenMedia, children,
}: MessageContextMenuProps) {
  const link = findFirstLink(message.text);
  const [selectedText, setSelectedText] = useState("");
  const attachment = message.attachments?.[0];
  const mediaUrl = attachment?.url ?? message.audioUrl ?? null;
  const imageUrl = attachment?.kind === "image" ? attachment.url : null;
  const isFile = attachment?.kind === "file";

  async function copyValue(text: string, success: string) {
    try {
      await copyToClipboard(text);
      toast.success(success);
    } catch {
      toast.error("Kopyalanamadı");
    }
  }

  async function openLink() {
    if (!link) return;
    try {
      await openExternalHttp(link);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bağlantı açılamadı");
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={(event) => {
        const selection = window.getSelection();
        setSelectedText(selection && event.currentTarget.contains(selection.anchorNode) ? selection.toString().trim() : "");
      }}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onReply}><Reply size={14} className="text-brand" /> Yanıtla</ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger><Smile size={14} className="text-warn" /> Tepki ekle</ContextMenuSubTrigger>
          <ContextMenuSubContent className="grid grid-cols-6 gap-1 p-2">
            {QUICK_EMOJIS.map((emoji) => (
              <ContextMenuItem
                key={emoji}
                onSelect={() => onReact(emoji)}
                className="grid h-8 w-8 place-items-center p-0 text-[16px]"
              >
                {emoji}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onSelect={onForward}><Forward size={14} className="text-lime" /> İlet</ContextMenuItem>
        <ContextMenuItem onSelect={onPin}><Pin size={14} className="text-lime" /> {pinned ? "Sabitlemeyi kaldır" : "Sabitle"}</ContextMenuItem>
        <ContextMenuItem onSelect={onCopy}><Copy size={14} className="text-muted" /> Metni kopyala</ContextMenuItem>
        {selectedText && selectedText !== message.text && (
          <ContextMenuItem onSelect={() => void copyValue(selectedText, "Seçim kopyalandı")}><Copy size={14} className="text-muted" /> Seçimi kopyala</ContextMenuItem>
        )}
        {link && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => void copyValue(link, "Link kopyalandı")}><Link2 size={14} className="text-brand" /> Linki kopyala</ContextMenuItem>
            <ContextMenuItem onSelect={() => void openLink()}><ExternalLink size={14} className="text-brand" /> Linki aç</ContextMenuItem>
          </>
        )}
        {mediaUrl && (
          <>
            <ContextMenuSeparator />
            {isFile && attachment && (
              <ContextMenuItem onSelect={() => downloadAttachment(attachment)}><Download size={14} className="text-lime" /> Dosyayı indir</ContextMenuItem>
            )}
            {imageUrl && (
              <ContextMenuItem onSelect={() => onOpenMedia(imageUrl)}><ImageIcon size={14} className="text-lime" /> Görseli aç</ContextMenuItem>
            )}
            <ContextMenuItem onSelect={() => void copyValue(mediaUrl, "Medya URL'si kopyalandı")}><Copy size={14} className="text-muted" /> Medya URL'sini kopyala</ContextMenuItem>
          </>
        )}
        {message.own && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onDelete} className="text-danger"><Trash2 size={14} /> Sil</ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function EmojiPicker({ onSelect, children }: { onSelect: (emoji: string) => void; children: React.ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" side="top" sideOffset={8} className="glass z-[170] grid grid-cols-6 gap-1 rounded-2xl p-2 shadow-float outline-none">
          {QUICK_EMOJIS.map((emoji) => (
            <DropdownMenu.Item
              key={emoji}
              onSelect={() => onSelect(emoji)}
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-xl text-[16px] outline-none data-[highlighted]:bg-white/[.1]"
            >
              {emoji}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MediaLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] w-[min(1100px,94vw)] flex-col items-center overflow-auto p-4">
        <DialogTitle className="sr-only">Görsel önizleme</DialogTitle>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <img src={url} alt="Büyük görsel" className="max-h-[78vh] max-w-full rounded-xl object-contain" />
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => void copyToClipboard(url).then(() => toast.success("Görsel URL'si kopyalandı")).catch(() => toast.error("Kopyalanamadı"))}><Copy size={14} className="text-muted" /> Görsel URL'sini kopyala</ContextMenuItem>
            <ContextMenuItem onSelect={onClose}><X size={14} className="text-danger" /> Önizlemeyi kapat</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <p className="mt-3 max-w-full break-all text-[10px] text-muted">{url.startsWith("data:") ? "Yerel görsel" : url}</p>
      </DialogContent>
    </Dialog>
  );
}

type ChannelHeaderProps = {
  searchOpen: boolean;
  onToggleSearch: () => void;
  onFindMessage: (text: string) => void;
};

function ChannelHeader({ searchOpen, onToggleSearch, onFindMessage }: ChannelHeaderProps) {
  const activeChannel = useApp((s) => s.activeChannel);
  const sidebarTab = useApp((s) => s.sidebarTab);
  const activeDM = useApp((s) => s.activeDM);
  const joinVoice = useApp((s) => s.joinVoice);
  const channelGroups = useApp((s) => s.channelGroups);
  const dms = useApp((s) => s.dms);
  const voiceChannelId = useApp((s) => s.voiceChannelId);
  const messages = useApp((s) => s.messages);
  const pinnedMessageIds = useApp((s) => s.pinnedMessageIds);
  const mutedChannelIds = useApp((s) => s.mutedChannelIds);
  const toggleChannelMute = useApp((s) => s.toggleChannelMute);
  const setView = useApp((s) => s.setView);
  const setSettingsSection = useApp((s) => s.setSettingsSection);

  const channel = useMemo(
    () => channelGroups.flatMap((g) => g.channels).find((c) => c.id === activeChannel),
    [activeChannel, channelGroups],
  );
  const dm = dms.find((d) => d.id === activeDM);
  const isDM = sidebarTab === "dms";
  const title = isDM ? dm?.name ?? "DM" : channel?.name ?? "genel";
  const description = isDM ? dm?.preview ?? "" : channel?.description ?? "";
  const Icon = channel?.type === "voice" ? Volume2 : channel?.type === "announcement" ? Megaphone : Hash;
  const callDisabled = isDM ? !activeDM || Boolean(dm?.ai) || Boolean(dm?.group) : true;
  const conversationId = isDM ? activeDM : activeChannel;
  const muted = Boolean(conversationId && mutedChannelIds.includes(conversationId));
  const pinned = useMemo(
    () => messages.filter((message) => pinnedMessageIds.includes(message.id)),
    [messages, pinnedMessageIds],
  );

  function openNotifications() {
    setSettingsSection("Bildirimler");
    setView("settings");
    toast("Bildirim ayarları açıldı");
  }

  function toggleMute() {
    if (!conversationId) return;
    toggleChannelMute(conversationId);
    toast.success(muted ? "Bildirimler açıldı" : "Bildirimler sessize alındı");
  }

  function startAudio() {
    if (isDM) {
      if (activeDM && !dm?.ai && !dm?.group) startCall(activeDM, "audio");
      return;
    }
    const voiceId = voiceChannelId ?? channelGroups.flatMap((g) => g.channels).find((c) => c.type === "voice")?.id;
    if (voiceId) void joinVoice(voiceId);
  }

  function startVideo() {
    if (activeDM && !dm?.ai && !dm?.group) startCall(activeDM, "video");
  }

  return (
    <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-white/[.06] bg-surface/30 px-5 backdrop-blur-xl">
      {isDM ? <SlopAvatar name={title} src={dm?.avatarUrl} size={36} /> : <div className="grid h-9 w-9 place-items-center rounded-[13px] bg-brand/12 text-brand"><Icon size={17} /></div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate font-display text-[15px] font-extrabold tracking-tight">{title}</h2>
          {channel?.live && <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[9px] font-black tracking-wider text-lime">CANLI</span>}
        </div>
        <p className="truncate text-[11px] text-muted">{description}</p>
      </div>
      <div className="flex items-center gap-0.5">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button aria-label="Sabitlenenler" title="Sabitlenenler" className="icon-btn"><Pin size={16} /></button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={8} className="glass z-[160] w-[280px] rounded-panel p-2 shadow-float outline-none">
              <DropdownMenu.Label className="category-label !px-2">Sabitlenen mesajlar</DropdownMenu.Label>
              {pinned.length === 0 ? (
                <p className="px-2 py-3 text-[11px] text-muted">Henüz sabitlenen mesaj yok.</p>
              ) : pinned.map((message) => (
                <DropdownMenu.Item
                  key={message.id}
                  onSelect={() => onFindMessage(message.text)}
                  className="cursor-pointer rounded-xl px-2 py-2 outline-none data-[highlighted]:bg-white/[.08]"
                >
                  <p className="truncate text-[11px] font-bold">{message.author}</p>
                  <p className="truncate text-[10.5px] text-muted">{message.text}</p>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <button aria-label="Bildirim ayarları" title="Bildirim ayarları" onClick={openNotifications} className={cn("icon-btn", !muted && "text-lime")}><Bell size={16} /></button>
        <button aria-label="Ara" title="Ara" onClick={onToggleSearch} data-active={searchOpen} className="icon-btn"><Search size={16} /></button>
        <div className="mx-1.5 h-5 w-px bg-white/10" />
        <Tooltip><TooltipTrigger asChild><button aria-label="Sesli arama" onClick={startAudio} disabled={callDisabled} className="icon-btn text-lime disabled:pointer-events-none disabled:opacity-40"><Phone size={16} /></button></TooltipTrigger><TooltipContent>Sesli arama</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><button aria-label="Görüntülü arama" onClick={startVideo} disabled={callDisabled} title={isDM ? "Görüntülü arama" : "Görüntülü arama yalnızca DM’lerde"} className="icon-btn disabled:pointer-events-none disabled:opacity-40"><Video size={16} /></button></TooltipTrigger><TooltipContent>Görüntülü arama</TooltipContent></Tooltip>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button aria-label="Daha fazla" title="Daha fazla" className="icon-btn"><MoreHorizontal size={17} /></button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={8} className="glass z-[160] w-[210px] rounded-panel p-2 shadow-float outline-none">
              <DropdownMenu.Item onSelect={openNotifications} className="cursor-pointer rounded-xl px-3 py-2 text-[11.5px] font-bold outline-none data-[highlighted]:bg-white/[.08]">Bildirim ayarları</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={toggleMute} className="cursor-pointer rounded-xl px-3 py-2 text-[11.5px] font-bold outline-none data-[highlighted]:bg-white/[.08]">{muted ? "Bildirimleri aç" : "Bildirimleri sessize al"}</DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-white/[.07]" />
              <DropdownMenu.Item onSelect={() => { setSettingsSection("Görünüm"); setView("settings"); toast("Ayarlar açıldı"); }} className="cursor-pointer rounded-xl px-3 py-2 text-[11.5px] font-bold outline-none data-[highlighted]:bg-white/[.08]">Ayarlar</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
}

type MessageRowProps = {
  message: Message;
  onOpenMedia: (url: string) => void;
  onForward: (message: Message) => void;
};

const MessageRow = memo(function MessageRow({ message, onOpenMedia, onForward }: MessageRowProps) {
  const reactToMessage = useApp((s) => s.reactToMessage);
  const setReplyTo = useApp((s) => s.setReplyTo);
  const deleteMessage = useApp((s) => s.deleteMessage);
  const togglePin = useApp((s) => s.togglePin);
  const openProfile = useApp((s) => s.openProfile);
  const members = useApp((s) => s.members);
  const pinned = useApp((s) => s.pinnedMessageIds.includes(message.id));
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const hasAudioAttachment = Boolean(message.attachments?.some((attachment) => attachment.kind === "audio"));
  const quoteLines = message.text.split("\n").filter((line) => line.startsWith("> "));
  const bodyText = message.text.split("\n").filter((line) => !line.startsWith("> ")).join("\n").trim();
  const autoTranslate = useApp((s) => s.autoTranslate);
  const language = useApp((s) => s.language);
  const [translated, setTranslated] = useState("");
  useEffect(() => {
    let active = true;
    setTranslated("");
    if (!autoTranslate || language === "tr" || message.own || !bodyText) return;
    const names: Record<string, string> = { en: "English", de: "German", fr: "French" };
    const timer = window.setTimeout(() => {
      api.translateText(bodyText, names[language] ?? "English")
        .then((result) => { if (active && result.translation !== bodyText) setTranslated(result.translation); })
        .catch(() => undefined);
    }, 400);
    return () => { active = false; window.clearTimeout(timer); };
  }, [autoTranslate, language, bodyText, message.own]);
  function showProfile() {
    const id = message.authorId || members.find((member) => member.name === message.author)?.id;
    if (id) openProfile(id);
  }
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
    setDragging(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    longPress.current = window.setTimeout(() => {
      if (!drag.current.moved) {
        setMenuOpen(true);
        setDragX(0);
        drag.current.x = 0;
      }
    }, 250);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    const dx = event.clientX - drag.current.startX;
    const dy = event.clientY - drag.current.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      drag.current.moved = true;
      setDragging(true);
      window.getSelection()?.removeAllRanges();
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
    setDragging(false);
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
      <SlopAvatar name={message.author} src={message.avatarUrl} size={36} className="mt-0.5" onClick={showProfile} />
      <div className="min-w-0 flex-1">
        {menuOpen && <div className="context-backdrop active" onClick={() => setMenuOpen(false)} />}
        <div className={cn("message-wrapper", menuOpen && "message-focused")}>
          <span
            className="reply-indicator"
            style={{ opacity: dragX > 20 ? 1 : 0, transform: `scale(${dragX > 20 ? 1 : .5})` }}
          ><Reply size={17} className="text-brand" /></span>
          <MessageContextMenu
            message={message}
            pinned={pinned}
            onReply={reply}
            onReact={(emoji) => void reactToMessage(message.id, emoji)}
            onForward={() => onForward(message)}
            onPin={() => { togglePin(message.id); toast.success(pinned ? "Sabitleme kaldırıldı" : "Mesaj sabitlendi"); }}
            onCopy={copyText}
            onDelete={() => { deleteMessage(message.id); toast.success("Mesaj silindi"); }}
            onOpenMedia={onOpenMedia}
          >
            <div
              className="message-bubble"
              data-own={message.own ? "true" : "false"}
              data-dragging={dragging ? "true" : undefined}
              style={{ transform: `translateX(${dragX}px)` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={showProfile} className="font-display text-[0.78125rem] font-extrabold tracking-normal hover:underline" style={{ color: message.color }}>{message.author}</button>
              {message.ai && <span className="rounded-full bg-brand/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-brand">AI</span>}
              <BadgeChips badges={message.badges} compact />
              <span className="text-[10px] text-muted/70">{message.time}</span>
            </div>
            {quoteLines.length > 0 && (
              <div className="reply-quote mt-1 border-l-2 border-brand/60 pl-2 text-[11px] text-muted">
                {quoteLines.map((line, index) => <p key={index} className="line-clamp-2 whitespace-pre-wrap break-words">{line.slice(2)}</p>)}
              </div>
            )}
            <p className={cn("mt-0.5 text-[0.8125rem] leading-relaxed text-paper", message.ai && "text-paper")}>{bodyText}</p>
            {translated && <p className="mt-1 text-[11px] italic leading-relaxed text-muted">↳ {translated}</p>}
            {message.attachments?.map((attachment, index) => {
              if (attachment.kind === "image") {
                return (
                  <button
                    key={index}
                    type="button"
                    className="mt-2 block cursor-zoom-in"
                    onClick={() => onOpenMedia(attachment.url)}
                  >
                    <img
                      src={attachment.url}
                      alt={attachment.name}
                      loading="lazy"
                      decoding="async"
                      onError={() => setPlaybackError("Görsel yüklenemedi")}
                      className="max-h-[280px] max-w-[320px] rounded object-contain"
                    />
                  </button>
                );
              }
              if (attachment.kind === "audio") {
                return (
                  <div key={index} className="mt-2 max-w-[320px] rounded-2xl border border-brand/20 bg-brand/[.07] p-2">
                    <audio
                      controls
                      preload="metadata"
                      src={attachment.url}
                      onError={() => setPlaybackError("Sesli mesaj oynatılamadı")}
                      className="w-full"
                    />
                    <p className="mt-1 break-words text-[9.5px] text-muted">Sesli mesaj • {formatDuration(message.duration ?? 0)}</p>
                  </div>
                );
              }
              if (attachment.kind === "file") {
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => downloadAttachment(attachment)}
                    className="mt-2 flex max-w-[320px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[.05] px-3 py-2 text-left transition hover:border-brand/50"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand"><FileText size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-bold">{attachment.name}</span>
                      <span className="block text-[9.5px] text-muted">{formatBytes(attachment.bytes)} • İndirmek için dokun</span>
                    </span>
                    <Download size={14} className="shrink-0 text-muted" />
                  </button>
                );
              }
              return (
                <video
                  key={index}
                  src={attachment.url}
                  controls
                  playsInline
                  preload="metadata"
                  onError={() => setPlaybackError("Video oynatılamadı")}
                  className="mt-2 max-h-[320px] max-w-[360px] rounded object-contain"
                />
              );
            })}
            {!hasAudioAttachment && message.audioUrl && (
              <div className="mt-2 max-w-[320px] rounded-2xl border border-brand/20 bg-brand/[.07] p-2">
                <audio
                  controls
                  preload="metadata"
                  src={message.audioUrl}
                  onError={() => setPlaybackError("Sesli mesaj oynatılamadı")}
                  className="w-full"
                />
                <p className="mt-1 text-[9.5px] text-muted">Sesli mesaj • {formatDuration(message.duration ?? 0)}</p>
              </div>
            )}
            {playbackError && <p className="mt-1 break-words text-[10px] text-danger">{playbackError}</p>}
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
                <EmojiPicker onSelect={(emoji) => { void reactToMessage(message.id, emoji); setMenuOpen(false); }}>
                  <button><Smile size={14} className="text-warn" /> Tepki ekle</button>
                </EmojiPicker>
                <button onClick={() => { onForward(message); setMenuOpen(false); }}><Forward size={14} className="text-lime" /> İlet</button>
                <button onClick={() => { togglePin(message.id); setMenuOpen(false); toast.success(pinned ? "Sabitleme kaldırıldı" : "Mesaj sabitlendi"); }}><Pin size={14} className="text-lime" /> {pinned ? "Sabitlemeyi kaldır" : "Sabitle"}</button>
                <button onClick={copyText}><Copy size={14} className="text-muted" /> Metni kopyala</button>
                {message.own && (
                  <button onClick={() => { deleteMessage(message.id); setMenuOpen(false); toast.success("Mesaj silindi"); }} className="text-danger"><Trash2 size={14} /> Sil</button>
                )}
              </div>
            )}
            </div>
          </MessageContextMenu>
        </div>
      </div>
      <div className="flex shrink-0 items-start gap-0.5">
        <button onClick={reply} className="icon-btn h-7 w-7" aria-label="Yanıtla"><Reply size={14} /></button>
        <EmojiPicker onSelect={(emoji) => void reactToMessage(message.id, emoji)}>
          <button className="icon-btn h-7 w-7" aria-label="Tepki ekle"><Smile size={14} /></button>
        </EmojiPicker>
        <button onClick={() => onForward(message)} className="icon-btn h-7 w-7" aria-label="İlet"><Forward size={14} /></button>
      </div>
    </div>
  );
});

function MessageList({ query, onOpenMedia, onForward }: { query: string; onOpenMedia: (url: string) => void; onForward: (message: Message) => void }) {
  const allMessages = useApp((s) => s.messages);
  const sidebarTab = useApp((s) => s.sidebarTab);
  const activeDM = useApp((s) => s.activeDM);
  const activeChannel = useApp((s) => s.activeChannel);
  const conversationId = sidebarTab === "dms" ? activeDM : activeChannel;
  const messages = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return allMessages;
    return allMessages.filter((message) =>
      message.text.toLocaleLowerCase("tr-TR").includes(needle) ||
      message.author.toLocaleLowerCase("tr-TR").includes(needle),
    );
  }, [allMessages, query]);
  const parentRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const getScrollElement = useCallback(() => parentRef.current, []);
  const estimateSize = useCallback(() => 74, []);
  const getItemKey = useCallback((index: number) => messages[index]?.id ?? index, [messages]);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement,
    estimateSize,
    getItemKey,
    overscan: 8,
  });
  const totalSize = virtualizer.getTotalSize();
  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    atBottomRef.current = true;
    setShowJump(false);
  }, [conversationId]);

  const onScroll = useCallback(() => {
    const element = parentRef.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    atBottomRef.current = atBottom;
    setShowJump(!atBottom);
  }, []);

  useLayoutEffect(() => {
    if (atBottomRef.current && messages.length) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [lastMessageId, conversationId, virtualizer]);

  function jumpToLatest() {
    virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    atBottomRef.current = true;
    setShowJump(false);
  }

  return (
    <>
      <div
        ref={parentRef}
        onScroll={onScroll}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4"
      >
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 rounded-card border border-brand/15 bg-brand/[.05] p-5">
            <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-brand/20 text-brand"><Sparkles size={18} /></div>
            <h3 className="font-display text-[17px] font-extrabold tracking-tight">Burasi SlopSound</h3>
            <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted">
              Kendi tarzımız var: yumuşak, sade, hızlı. İlk mesajını at, Sunlop yazarsan cevap versin.
            </p>
          </div>
          {query.trim() && messages.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-muted">“{query.trim()}” için mesaj bulunamadı.</p>
          ) : (
            <div style={{ height: totalSize, position: "relative" }}>
              {virtualizer.getVirtualItems().map((item) => (
                <div
                  key={messages[item.index].id}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <MessageRow message={messages[item.index]} onOpenMedia={onOpenMedia} onForward={onForward} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {showJump && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-28 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-brand/30 bg-surface/90 px-3 py-1.5 text-[11px] font-bold text-paper shadow-float backdrop-blur-xl transition hover:border-brand/60"
        >
          <ArrowDown size={13} /> En yeni mesaja git
        </button>
      )}
    </>
  );
}

function Composer() {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTypingAt = useRef(0);
  const sendMessage = useApp((s) => s.sendMessage);
  const sendVoiceMessage = useApp((s) => s.sendVoiceMessage);
  const notifyTyping = useApp((s) => s.notifyTyping);
  const replyTo = useApp((s) => s.replyTo);
  const setReplyTo = useApp((s) => s.setReplyTo);
  const setSidebarTab = useApp((s) => s.setSidebarTab);
  const selectDM = useApp((s) => s.selectDM);
  const createDM = useApp((s) => s.createDM);
  const dms = useApp((s) => s.dms);
  const recording = useAudio((s) => s.recording);
  const recordingSeconds = useAudio((s) => s.recordingSeconds);
  const lastRecordingBlob = useAudio((s) => s.lastRecordingBlob);
  const recordingError = useAudio((s) => s.recordingError);
  const clearRecordingError = useAudio((s) => s.clearRecordingError);
  const startRecording = useAudio((s) => s.startRecording);
  const stopRecording = useAudio((s) => s.stopRecording);
  const shouldSend = useRef(false);
  const recordedDuration = useRef(0);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (!recording && lastRecordingBlob && shouldSend.current) {
      shouldSend.current = false;
      const duration = recordedDuration.current || 1;
      void sendVoiceMessage(lastRecordingBlob, duration).then((sent) => {
        if (sent) toast.success("Sesli mesaj gönderildi");
        else toast.error(useApp.getState().error ?? "Sesli mesaj gönderilemedi");
      });
    }
  }, [recording, lastRecordingBlob, sendVoiceMessage]);

  useEffect(() => {
    if (recordingError) {
      toast.error(recordingError);
      clearRecordingError();
    }
  }, [recordingError, clearRecordingError]);

  async function toggleRecording() {
    if (recording) { shouldSend.current = true; recordedDuration.current = recordingSeconds; stopRecording(); return; }
    await startRecording();
  }

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    setValue(event.target.value);
    const now = Date.now();
    if (now - lastTypingAt.current >= 1000) {
      lastTypingAt.current = now;
      notifyTyping();
    }
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAllowedAttachment(file)) {
      toast.error("Görsel, video, ses veya güvenli belge dosyaları gönderebilirsin");
      return;
    }
    const kind = attachmentKind(file);
    const limit = kind === "file" ? MAX_FILE_BYTES : MAX_ATTACHMENT_BYTES;
    if (file.size > limit) {
      toast.error(kind === "file" ? "Belge boyutu en fazla 4 MB olabilir" : "Dosya boyutu en fazla 8 MB olabilir");
      return;
    }
    setUploading(true);
    try {
      if (kind === "image") setPending(await prepareImage(file));
      else if (kind === "audio" || kind === "video") setPending(await readMedia(file, kind));
      else setPending(await readFile(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dosya eklenemedi");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (sendingRef.current || uploading) return;
    const text = value.trim();
    if (!text && !pending) return;
    const currentPending = pending;
    const currentReply = replyTo;
    const bodyText = text || (
      currentPending?.kind === "video" ? "Video"
        : currentPending?.kind === "audio" ? "Ses"
          : currentPending?.kind === "file" ? currentPending.name
            : "Fotoğraf"
    );
    const body = currentReply ? `> ${currentReply.author}: ${currentReply.text}\n${bodyText}` : bodyText;
    sendingRef.current = true;
    setValue("");
    setPending(null);
    setReplyTo(null);
    try {
      const ok = await sendMessage(body, currentPending ? [currentPending] : undefined);
      if (!ok) {
        setValue(text);
        setPending(currentPending);
        setReplyTo(currentReply);
        toast.error(useApp.getState().error ?? "Mesaj gönderilemedi");
      }
    } finally {
      sendingRef.current = false;
    }
  }

  function openSunlop() {
    const existing = dms.find((item) => item.name.toLowerCase() === "sunlop");
    setSidebarTab("dms");
    if (existing) selectDM(existing.id);
    else void createDM("Sunlop").then((id) => { if (id) selectDM(id); });
  }

  return (
    <div className="relative z-10 px-4 pb-[84px]">
      <div className="mx-auto max-w-3xl">
        {pending && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-2 flex items-center gap-2 rounded-2xl border border-brand/25 bg-brand/[.08] px-3 py-2 backdrop-blur-xl"
          >
            {pending.kind === "image" ? (
              <img src={pending.url} alt={pending.name} className="h-10 w-10 rounded-lg object-cover" />
            ) : pending.kind === "audio" ? (
              <audio src={pending.url} controls className="h-10 w-40" />
            ) : pending.kind === "file" ? (
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/15 text-brand"><FileText size={16} /></span>
            ) : (
              <video src={pending.url} muted preload="metadata" className="h-10 w-10 rounded-lg object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold text-brand">{pending.kind === "image" ? "Fotoğraf" : pending.kind === "audio" ? "Ses" : pending.kind === "file" ? "Dosya" : "Video"} eklendi</p>
              <p className="truncate text-[11px] text-muted">{pending.name}</p>
            </div>
            <button onClick={() => setPending(null)} aria-label="Eki kaldır" className="icon-btn h-7 w-7"><X size={13} /></button>
          </motion.div>
        )}
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/webm,audio/mp4,audio/ogg,audio/mpeg,application/pdf,application/zip,application/x-zip-compressed,application/json,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,text/markdown,application/octet-stream"
          className="hidden"
          onChange={(event) => void onFileChange(event)}
        />
        <motion.div
          layout
          className="glass flex items-center gap-2 rounded-full px-2 py-2 shadow-float transition focus-within:border-brand/45 focus-within:shadow-[0_18px_44px_rgba(0,0,0,.46),0_0_0_3px_hsl(var(--brand)/.12)]"
        >
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Dosya ekle"
            className="icon-btn h-9 w-9 shrink-0 bg-white/[.05]"
          ><Plus size={17} /></button>
          <button
            aria-label={recording ? "Kaydı bitir ve gönder" : "Sesli mesaj kaydet"}
            onClick={() => void toggleRecording()}
            className={cn("icon-btn h-9 w-9 shrink-0", recording && "bg-danger/20 text-danger")}
          >
            {recording ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}
          </button>
          {recording && <span className="shrink-0 text-[10px] font-bold tabular text-danger">{formatDuration(recordingSeconds)}</span>}
          <InputContextMenu inputRef={inputRef}>
            <input
              ref={inputRef}
              value={value}
              onChange={onChange}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!e.repeat) void submit(); } }}
              placeholder="Mesaj yaz... Sunlop yaz, cevap versin"
              className="min-w-0 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-muted/60"
            />
          </InputContextMenu>
          <button
            onClick={openSunlop}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:scale-110"
            title="Sunlop'a sor"
          ><SlopAvatar name="Sunlop" size={28} /></button>
          <button
            onClick={() => void submit()}
            disabled={(!value.trim() && !pending) || uploading}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-ink transition hover:scale-110 hover:rotate-[-8deg] disabled:opacity-40"
          >
            <ArrowUp size={17} strokeWidth={2.6} />
          </button>
        </motion.div>
        <p className="mt-2 text-center text-[10px] text-muted/50">Enter ile gönder • Sunlop her zaman sol altta</p>
      </div>
    </div>
  );
}

export function ChatPanel() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const allMessages = useApp((s) => s.messages);
  const dms = useApp((s) => s.dms);
  const channelGroups = useApp((s) => s.channelGroups);
  const forwardMessage = useApp((s) => s.forwardMessage);
  const searchResults = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return 0;
    return allMessages.filter((message) =>
      message.text.toLocaleLowerCase("tr-TR").includes(needle) ||
      message.author.toLocaleLowerCase("tr-TR").includes(needle),
    ).length;
  }, [allMessages, searchQuery]);
  const forwardTargets = useMemo(() => [
    ...dms.map((dm) => ({ id: dm.id, name: dm.name, icon: "DM" })),
    ...channelGroups.flatMap((group) => group.channels.filter((channel) => channel.type !== "voice").map((channel) => ({ id: channel.id, name: `#${channel.name}`, icon: "#" }))),
  ], [dms, channelGroups]);

  function toggleSearch() {
    if (searchOpen) setSearchQuery("");
    setSearchOpen(!searchOpen);
  }

  async function openMedia(url: string) {
    if (/^(data:|blob:)/i.test(url)) {
      setLightboxUrl(url);
      return;
    }
    try {
      await openExternalHttp(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bağlantı açılamadı");
    }
  }

  return (
    <main className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-chat/40">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-brand/[.05] to-transparent" />
      <ChannelHeader
        searchOpen={searchOpen}
        onToggleSearch={toggleSearch}
        onFindMessage={(text) => { setSearchQuery(text); setSearchOpen(true); }}
      />
      {searchOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-white/[.06] bg-surface/20 px-5 py-2">
          <Search size={14} className="shrink-0 text-muted" />
          <InputContextMenu inputRef={searchInputRef}>
            <input
              ref={searchInputRef}
              autoFocus
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Bu sohbette ara..."
              aria-label="Bu sohbette ara"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted/60"
            />
          </InputContextMenu>
          {searchQuery.trim() && <span className="shrink-0 text-[10px] text-muted">{searchResults} sonuç</span>}
          <button
            aria-label="Aramayı kapat"
            onClick={toggleSearch}
            className="icon-btn h-7 w-7 shrink-0"
          ><X size={13} /></button>
        </div>
      )}
      <MessageList query={searchQuery} onOpenMedia={(url) => void openMedia(url)} onForward={setForwarding} />
      <Composer />
      <Dialog open={Boolean(forwarding)} onOpenChange={(open) => { if (!open) setForwarding(null); }}>
        <DialogContent className="w-[min(420px,92vw)]">
          <DialogTitle className="font-display text-[17px] font-extrabold">Mesajı ilet</DialogTitle>
          <p className="mt-1 truncate text-[11px] text-muted">{forwarding?.text || "Ekli mesaj"}</p>
          <div className="no-scrollbar mt-4 max-h-[320px] space-y-1 overflow-y-auto">
            {forwardTargets.map((target) => (
              <button
                key={target.id}
                onClick={() => {
                  if (!forwarding) return;
                  void forwardMessage(forwarding, target.id).then((ok) => {
                    if (ok) { toast.success("Mesaj iletildi"); setForwarding(null); }
                    else toast.error(useApp.getState().error ?? "Mesaj iletilmedi");
                  });
                }}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-[12px] font-bold transition hover:bg-white/[.06]"
              >
                <span className="grid h-7 w-7 place-items-center rounded-xl bg-brand/15 text-[10px] text-brand">{target.icon}</span>
                <span className="min-w-0 flex-1 truncate">{target.name}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" onClick={() => setForwarding(null)}>Vazgeç</Button>
          </div>
        </DialogContent>
      </Dialog>
      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </main>
  );
}
