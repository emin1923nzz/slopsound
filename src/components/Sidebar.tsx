import { useMemo, useState, type FormEvent } from "react";
import { DialogTitle } from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import {
  Hash, Volume2, Megaphone, ChevronDown, Plus, Compass, Download, Search,
  MessageCircle, Mic, MicOff, Video, VideoOff, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { INVITE_BASE_URL } from "@/lib/config";
import { copyText } from "@/lib/native";
import { useLiveKit } from "@/lib/livekit";
import { cn } from "@/lib/utils";
import { Button, Dialog, DialogContent, Input, Tooltip, TooltipContent, TooltipTrigger } from "./ui";
import { SlopAvatar, SlopLogo } from "./SlopAvatar";

function Rail() {
  const activeServer = useApp((s) => s.activeServer);
  const sidebarTab = useApp((s) => s.sidebarTab);
  const selectServer = useApp((s) => s.selectServer);
  const setView = useApp((s) => s.setView);
  const unreadDMs = useApp((s) => s.unreadDMs);
  const servers = useApp((s) => s.servers);
  const dmUnread = Object.values(unreadDMs).reduce((a, b) => a + b, 0);

  return (
    <div className="flex w-[68px] shrink-0 flex-col items-center gap-2 border-r border-white/[.05] bg-ink/60 py-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={() => setView("landing")} className="rail-btn grid place-items-center" data-active={sidebarTab === "servers"}>
            <SlopLogo size={30} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">SlopSound</TooltipContent>
      </Tooltip>
      <div className="my-1 h-px w-8 bg-white/10" />
      <div className="flex flex-col items-center gap-2.5 overflow-y-auto no-scrollbar">
        {servers.map((server) => (
          <Tooltip key={server.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => selectServer(server.id)}
                className={cn("rail-btn font-display text-[12px]", activeServer === server.id && "text-brand")}
                data-active={activeServer === server.id}
              >
                {server.name.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase()}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{server.name}</TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => useApp.getState().setCreateServerOpen(true)} className="rail-btn text-lime"><Plus size={19} /></button>
          </TooltipTrigger>
          <TooltipContent side="right">Sunucu ekle</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => toast("Keşfet yakında")} className="rail-btn"><Compass size={18} /></button>
          </TooltipTrigger>
          <TooltipContent side="right">Sunucuları keşfet</TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-auto flex flex-col items-center gap-2.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => useApp.getState().setSidebarTab("dms")} className="rail-btn relative">
              <MessageCircle size={18} />
              {dmUnread > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-ink" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Mesajlar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => toast("İndirmeler yakında")} className="rail-btn"><Download size={18} /></button>
          </TooltipTrigger>
          <TooltipContent side="right">İndirmeler</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function ChannelIcon({ type }: { type: string }) {
  if (type === "voice") return <Volume2 size={15} />;
  if (type === "announcement") return <Megaphone size={15} />;
  return <Hash size={15} />;
}

function ServerPanel() {
  const activeChannel = useApp((s) => s.activeChannel);
  const selectChannel = useApp((s) => s.selectChannel);
  const joinVoice = useApp((s) => s.joinVoice);
  const voiceConnected = useApp((s) => s.voiceConnected);
  const voiceChannel = useApp((s) => s.voiceChannel);
  const leaveVoice = useApp((s) => s.leaveVoice);
  const activeServer = useApp((s) => s.activeServer);
  const servers = useApp((s) => s.servers);
  const channelGroups = useApp((s) => s.channelGroups);
  const members = useApp((s) => s.members);
  const voiceChannelId = useApp((s) => s.voiceChannelId);
  const createInvite = useApp((s) => s.createInvite);
  const server = servers.find((s) => s.id === activeServer) ?? servers[0];
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const visibleGroups = channelGroups.filter((group) => group.channels.some((channel) => channel.serverId === activeServer));
  const groupNames = [...new Set(visibleGroups.map((group) => group.label))];

  async function invite() {
    if (!activeServer || inviteBusy) return;
    setInviteBusy(true);
    const code = await createInvite();
    setInviteBusy(false);
    if (!code) return toast.error(useApp.getState().error ?? "Davet oluşturulamadı");
    try {
      await copyText(`${INVITE_BASE_URL}${code}`);
      toast.success("Davet linki kopyalandı");
    } catch {
      toast.success("Davet oluşturuldu", { description: `${INVITE_BASE_URL}${code}` });
    }
  }

  return (
    <>
      <div className="mb-1 flex items-center gap-1 rounded-2xl px-3 py-2.5 transition hover:bg-white/[.05]">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[14px] font-extrabold tracking-tight">{server?.name ?? "Sunucu seçin"}</p>
          <p className="text-[10.5px] text-muted">{members.length} üye • {members.filter((m) => m.status === "online").length} çevrimiçi</p>
        </div>
        <button onClick={() => void invite()} aria-label="Davet et" title="Davet et" className="icon-btn h-7 w-7"><UserPlus size={14} /></button>
        <button onClick={() => setCreateChannelOpen(true)} aria-label="Kanal ekle" title="Kanal ekle" className="icon-btn h-7 w-7"><Plus size={15} /></button>
        <ChevronDown size={15} className="text-muted" />
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto pb-4">
        {visibleGroups.map((group) => {
          const groupKey = `${activeServer}:${group.label}`;
          const isCollapsed = collapsed[groupKey] ?? false;
          return (
            <div key={`${activeServer}:${group.label}`}>
              <button
                onClick={() => setCollapsed((current) => ({ ...current, [groupKey]: !isCollapsed }))}
                className="category-label flex w-full items-center gap-1.5 text-left transition hover:text-paper"
              >
                <ChevronDown size={11} className={cn("transition-transform", isCollapsed && "-rotate-90")} />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <span className="tabular text-[9px] opacity-60">{group.channels.length}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${group.label} grubuna kanal ekle`}
                  onClick={(event) => { event.stopPropagation(); setCreateChannelOpen(true); }}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); setCreateChannelOpen(true); } }}
                  className="grid h-5 w-5 place-items-center rounded-lg hover:bg-white/10"
                ><Plus size={12} /></span>
              </button>
              {!isCollapsed && (
                <div className="mt-1 space-y-[var(--row-gap)]">
                  {group.channels.map((channel) => {
                    const isVoice = channel.type === "voice";
                    const isActive = activeChannel === channel.id || (voiceConnected && voiceChannel === channel.name);
                    return (
                      <button
                        key={channel.id}
                        onClick={() => (isVoice ? void joinVoice(channel.id) : selectChannel(channel.id))}
                        className="channel-row channel-item group"
                        data-active={isActive}
                        data-name={channel.name}
                      >
                        <span className="shrink-0 opacity-80"><ChannelIcon type={channel.type} /></span>
                        <span className="min-w-0 flex-1 truncate text-left">{channel.name}</span>
                        {channel.live && <span className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_8px_hsl(var(--lime)/.8)]" />}
                        {channel.unread && <span className="unread-badge grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[9px] font-black text-white">{channel.unread}</span>}
                        {isVoice && channel.people ? <span className="text-[10px] font-bold text-muted">{channel.people}</span> : null}
                        {isVoice && voiceConnected && voiceChannelId === channel.id && (
                          <span onClick={(e) => { e.stopPropagation(); leaveVoice(); }} className="grid h-5 w-5 place-items-center rounded-full bg-danger/20 text-danger"><XIcon /></span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <CreateChannelDialog open={createChannelOpen} onOpenChange={setCreateChannelOpen} groups={groupNames} />
    </>
  );
}

function XIcon() { return <span className="text-[10px] font-black leading-none">×</span>; }

function DMPanel() {
  const query = useApp((s) => s.dmQuery);
  const setQuery = useApp((s) => s.setDmQuery);
  const activeDM = useApp((s) => s.activeDM);
  const selectDM = useApp((s) => s.selectDM);
  const unreadDMs = useApp((s) => s.unreadDMs);
  const setView = useApp((s) => s.setView);
  const dms = useApp((s) => s.dms);
  const members = useApp((s) => s.members);
  const user = useApp((s) => s.user);
  const createGroupDM = useApp((s) => s.createGroupDM);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);

  const filtered = useMemo(
    () => dms.filter((dm) => dm.name.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr"))),
    [query, dms],
  );

  return (
    <>
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="DM ara..."
          className="w-full rounded-full border border-white/[.06] bg-black/25 py-2.5 pl-9 pr-3 text-[12px] outline-none transition placeholder:text-muted/60 focus:border-brand/50"
        />
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto pb-4">
        <div className="mb-2 flex items-center justify-between px-3">
          <p className="category-label !mt-0 !px-0">Arkadaşlar</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setGroupOpen(true)} className="text-[11px] font-bold text-lime hover:underline">+ Grup</button>
            <button onClick={() => setView("addFriend")} className="text-[11px] font-bold text-brand hover:underline">+ Ekle</button>
          </div>
        </div>
        <div className="space-y-[var(--row-gap)]">
          {filtered.map((dm) => (
            <button
              key={dm.id}
              onClick={() => selectDM(dm.id)}
              className={cn("channel-row", activeDM === dm.id && "data-[active=true]:bg-brand/10")}
              data-active={activeDM === dm.id}
            >
              <SlopAvatar name={dm.name} size={32} status={dm.status} showDot />
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-[12.5px] font-bold text-paper">{dm.name}</p>
                <p className="truncate text-[10.5px] text-muted">{dm.preview}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[9.5px] text-muted/70">{dm.time}</span>
                {unreadDMs[dm.id] ? (
                  <span className="unread-badge grid h-[17px] min-w-[17px] place-items-center rounded-full bg-danger px-1 text-[9px] font-black text-white">{unreadDMs[dm.id]}</span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>
      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent className="w-[min(420px,92vw)]">
          <DialogTitle className="font-display text-[17px] font-extrabold">Grup sohbeti kur</DialogTitle>
          <p className="mt-1 text-[11px] text-muted">Sunucundaki kişilerden en az birini ekle.</p>
          <div className="mt-5 space-y-3">
            <Input autoFocus value={groupName} maxLength={48} onChange={(event) => setGroupName(event.target.value)} placeholder="Grup adı" aria-label="Grup adı" />
            <div className="no-scrollbar max-h-52 space-y-1 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2">
              {members.filter((member) => member.id !== user?.id && !member.bot).map((member) => (
                <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-[12px] hover:bg-white/[.05]">
                  <input
                    type="checkbox"
                    checked={selected.includes(member.id)}
                    onChange={(event) => setSelected((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))}
                    className="accent-[hsl(var(--brand))]"
                  />
                  <SlopAvatar name={member.name} size={22} status={member.status} />
                  <span className="min-w-0 flex-1 truncate font-bold">{member.name}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setGroupOpen(false)}>Vazgeç</Button>
              <Button
                disabled={groupBusy || !groupName.trim() || selected.length === 0}
                onClick={() => void (async () => {
                  setGroupBusy(true);
                  const id = await createGroupDM(groupName.trim(), selected);
                  setGroupBusy(false);
                  if (!id) return toast.error(useApp.getState().error ?? "Grup kurulamadı");
                  setGroupName(""); setSelected([]); setGroupOpen(false);
                  toast.success("Grup kuruldu");
                })()}
              >{groupBusy ? "Kuruluyor…" : "Grubu kur"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SunlopWidget() {
  const setView = useApp((s) => s.setView);
  const selectDM = useApp((s) => s.selectDM);
  const createDM = useApp((s) => s.createDM);
  const dms = useApp((s) => s.dms);
  return (
    <button
      onClick={() => {
        const dm = dms.find((item) => item.name.toLowerCase() === "sunlop");
        if (dm) selectDM(dm.id);
        else void createDM("Sunlop");
        setView("app");
      }}
      className="group relative m-3 mt-1 overflow-hidden rounded-[20px] border border-brand/25 bg-brand/[.09] p-3.5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-brand/50 hover:shadow-[0_14px_28px_hsl(var(--brand)/.22)]"
    >
      <span className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-brand/20 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <SlopAvatar name="Sunlop" size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-extrabold">Sunlop</p>
            <span className="rounded-full bg-brand/25 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-brand">AI</span>
          </div>
          <p className="mt-0.5 text-[10px] text-muted">AI asistanın</p>
          <p className="mt-2 flex items-center gap-1 text-[10.5px] font-bold text-brand transition group-hover:gap-2">Sunlop'a sor <span>→</span></p>
        </div>
      </div>
    </button>
  );
}

function VoiceStatus() {
  const voiceConnected = useApp((s) => s.voiceConnected);
  const voiceChannel = useApp((s) => s.voiceChannel);
  const liveParticipants = useLiveKit((s) => s.participants);
  const micOn = useApp((s) => s.micOn);
  const camOn = useApp((s) => s.camOn);
  const toggleMic = useApp((s) => s.toggleMic);
  const toggleCam = useApp((s) => s.toggleCam);
  const leaveVoice = useApp((s) => s.leaveVoice);
  const setView = useApp((s) => s.setView);

  if (!voiceConnected) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-3 mb-2 rounded-2xl border border-lime/25 bg-lime/[.07] p-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-lime" />
          </span>
          <p className="text-[11px] font-extrabold text-lime">Sesli bağlantı</p>
        </div>
        <button onClick={leaveVoice} className="text-[10px] font-bold text-muted hover:text-danger">Ayrıl</button>
      </div>
      <p className="mt-1 pl-4 text-[10.5px] text-muted">{voiceChannel} • {liveParticipants.length + 1} kişi</p>
      <div className="mt-2.5 flex items-center gap-1.5 pl-1">
        <button onClick={toggleMic} className="icon-btn h-7 w-7" data-active={micOn} data-off={!micOn}>
          {micOn ? <Mic size={13} /> : <MicOff size={13} />}
        </button>
        <button onClick={toggleCam} className="icon-btn h-7 w-7" data-active={camOn}>
          {camOn ? <Video size={13} /> : <VideoOff size={13} />}
        </button>
        <button onClick={() => setView("app")} className="ml-auto rounded-full bg-white/[.06] px-2.5 py-1 text-[10px] font-bold text-muted hover:text-paper">Odaya git</button>
      </div>
    </motion.div>
  );
}

function CreateChannelDialog({ open, onOpenChange, groups }: { open: boolean; onOpenChange: (open: boolean) => void; groups: string[] }) {
  const createChannel = useApp((s) => s.createChannel);
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice" | "announcement">("text");
  const [group, setGroup] = useState("Kanallar");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    const label = group.trim() || "Kanallar";
    if (!value || busy) return;
    setBusy(true);
    const ok = await createChannel(value, type, label);
    setBusy(false);
    if (ok) { setName(""); onOpenChange(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(420px,92vw)]">
        <DialogTitle className="font-display text-[17px] font-extrabold">Kanal veya grup kur</DialogTitle>
        <p className="mt-1 text-[11px] text-muted">Yeni kanal, ses odası veya tamamen yeni bir grup oluştur.</p>
        <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-3">
          <Input autoFocus value={name} maxLength={48} onChange={(event) => setName(event.target.value)} placeholder="Kanal adı" aria-label="Kanal adı" />
          <div className="grid grid-cols-2 gap-3">
            <select value={type} onChange={(event) => setType(event.target.value as typeof type)} aria-label="Kanal türü" className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-[13px] outline-none focus:border-brand/60">
              <option value="text">Yazı kanalı</option>
              <option value="voice">Sesli sohbet</option>
              <option value="announcement">Duyuru</option>
            </select>
            <Input value={group} maxLength={48} onChange={(event) => setGroup(event.target.value)} placeholder="Grup adı" aria-label="Grup adı" list="channel-groups" />
            <datalist id="channel-groups">
              {groups.map((item) => <option key={item} value={item} />)}
            </datalist>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Vazgeç</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Kuruluyor…" : "Oluştur"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateServerDialog() {
  const open = useApp((s) => s.createServerOpen);
  const setOpen = useApp((s) => s.setCreateServerOpen);
  const createServer = useApp((s) => s.createServer);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    const ok = await createServer(value);
    setBusy(false);
    if (ok) setName("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[min(420px,92vw)]">
        <DialogTitle className="font-display text-[17px] font-extrabold">Yeni sunucu kur</DialogTitle>
        <p className="mt-1 text-[11px] text-muted">Sunucu adını yaz, gerisini hazırlayalım.</p>
        <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-3">
          <Input autoFocus value={name} maxLength={64} onChange={(event) => setName(event.target.value)} placeholder="Sunucu adı" aria-label="Sunucu adı" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Kuruluyor…" : "Sunucuyu kur"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Sidebar() {
  const sidebarTab = useApp((s) => s.sidebarTab);
  const setSidebarTab = useApp((s) => s.setSidebarTab);
  const unreadDMs = useApp((s) => s.unreadDMs);
  const dmCount = Object.values(unreadDMs).reduce((a, b) => a + b, 0);

  return (
    <div className="relative z-10 flex h-full shrink-0">
      <CreateServerDialog />
      <Rail />
      <aside className="flex w-full min-w-[220px] flex-col border-r border-white/[.05] bg-surface/45">
        <div className="no-drag flex items-center gap-1 px-3 pb-2 pt-3">
          {([
            ["servers", "Sunucular"],
            ["dms", dmCount > 0 ? `DM • ${dmCount}` : "DM"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSidebarTab(key)}
              className={`relative flex-1 rounded-full py-2 text-[11px] font-extrabold transition-colors ${sidebarTab === key ? "text-ink" : "text-muted hover:text-paper"}`}
            >
              {sidebarTab === key && (
                <motion.span layoutId="sidebar-tab" className="absolute inset-0 rounded-full bg-brand" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={sidebarTab}
              initial={{ opacity: 0, x: sidebarTab === "dms" ? 12 : -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: sidebarTab === "dms" ? -12 : 12 }}
              transition={{ duration: .22, ease: [.2, .8, .2, 1] }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {sidebarTab === "servers" ? <ServerPanel /> : <DMPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
        <VoiceStatus />
        <SunlopWidget />
      </aside>
    </div>
  );
}
