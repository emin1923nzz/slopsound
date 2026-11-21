import { useMemo, useRef } from "react";
import { motion } from "motion/react";
import { Search, Crown, UserPlus, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { INVITE_BASE_URL } from "@/lib/config";
import { copyText } from "@/lib/native";
import { copyToClipboard } from "@/lib/context-menu";
import { type Member } from "@/lib/data";
import { cn } from "@/lib/utils";
import { BadgeChips } from "./BadgeChips";
import { InputContextMenu } from "./InputContextMenu";
import { SlopAvatar } from "./SlopAvatar";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "./ui";

function MemberRow({ member, onOpenDm, onCopyInvite }: { member: Member; onOpenDm: (member: Member) => void; onCopyInvite: () => void }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex items-center gap-2.5 rounded-card px-2.5 py-2 transition hover:bg-white/[.045]">
          <SlopAvatar name={member.name} size={32} status={member.status} showDot />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={cn("truncate text-[12.5px] font-bold", member.status === "offline" && "text-muted/60")}>{member.name}</span>
              {member.role === "Yönetim" && <Crown size={11} className="shrink-0 text-warn" />}
              {member.bot && <span className="rounded bg-brand/20 px-1 text-[8px] font-black text-brand">AI</span>}
              <BadgeChips badges={member.badges} compact />
            </div>
            <p className="truncate text-[10px] text-muted">{member.activity}</p>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => void copyToClipboard(member.name).then(() => toast.success("Ad kopyalandı")).catch(() => toast.error("Kopyalanamadı"))}><Copy size={14} className="text-muted" /> Adı kopyala</ContextMenuItem>
        {!member.bot && <ContextMenuItem onSelect={() => onOpenDm(member)}><MessageCircle size={14} className="text-brand" /> DM aç</ContextMenuItem>}
        <ContextMenuItem onSelect={onCopyInvite}><UserPlus size={14} className="text-lime" /> Davet linki kopyala</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function MembersPanel() {
  const query = useApp((s) => s.memberQuery);
  const setQuery = useApp((s) => s.setMemberQuery);
  const members = useApp((s) => s.members);
  const createInvite = useApp((s) => s.createInvite);
  const createDM = useApp((s) => s.createDM);
  const user = useApp((s) => s.user);
  const activeServer = useApp((s) => s.activeServer);
  const searchInputRef = useRef<HTMLInputElement>(null);

  async function openDm(member: Member) {
    if (member.id === user?.id) return;
    const id = await createDM(member.name);
    if (!id) return toast.error(useApp.getState().error ?? "DM açılamadı");
  }

  async function copyInvite() {
    if (!activeServer) return toast.error("Önce bir sunucu seç.");
    const code = await createInvite();
    if (!code) return toast.error(useApp.getState().error ?? "Davet oluşturulamadı");
    const link = `${INVITE_BASE_URL}${code}`;
    try {
      await copyText(link);
      toast.success("Davet linki kopyalandı");
    } catch {
      toast.success("Davet oluşturuldu", { description: link });
    }
  }

  const filtered = useMemo(
    () => members.filter((m) => m.name.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr"))),
    [query, members],
  );
  const groups = ["Yönetim", "AI", "Çevrimiçi", "Çevrimdışı"] as const;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex h-full w-full min-w-[200px] flex-col border-l border-white/[.05] bg-surface/35"
    >
      <div className="flex h-[60px] shrink-0 items-center gap-2 border-b border-white/[.06] px-4">
        <span className="font-display text-[12px] font-extrabold uppercase tracking-wider text-muted">Üyeler</span>
        <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[10px] font-bold text-muted">{members.length}</span>
        <button aria-label="Davet linki oluştur" onClick={() => void copyInvite()} className="icon-btn ml-auto"><UserPlus size={15} /></button>
      </div>
      <div className="p-3">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <InputContextMenu inputRef={searchInputRef}>
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Üye ara..."
              className="w-full rounded-full border border-white/[.06] bg-black/25 py-2 pl-8 pr-3 text-[11.5px] outline-none placeholder:text-muted/60 focus:border-brand/50"
            />
          </InputContextMenu>
        </div>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto px-2 pb-6">
        {groups.map((group) => {
          const list = filtered.filter((m) => m.role === group);
          if (!list.length) return null;
          return (
            <div key={group} className="mb-3">
              <p className="category-label !px-2.5">{group} — {list.length}</p>
              <div className="mt-1 space-y-0.5">
                {list.map((member) => (
                  <MemberRow key={member.id} member={member} onOpenDm={(target) => void openDm(target)} onCopyInvite={() => void copyInvite()} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </motion.aside>
  );
}
