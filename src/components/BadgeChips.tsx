import { Crown, Flame, Gem, Medal, Sparkles, Star, type LucideIcon } from "lucide-react";
import { BADGE_LABELS, isBadgeId, type BadgeId } from "@/lib/badges";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui";

const badgeStyle: Record<BadgeId, { icon: LucideIcon; className: string }> = {
  founder: { icon: Crown, className: "border-warn/40 bg-warn/15 text-warn" },
  year_1: { icon: Sparkles, className: "border-brand/35 bg-brand/12 text-brand" },
  year_2: { icon: Medal, className: "border-cyan-400/35 bg-cyan-400/10 text-cyan-300" },
  year_3: { icon: Star, className: "border-lime/35 bg-lime/12 text-lime" },
  year_4: { icon: Flame, className: "border-orange-400/35 bg-orange-400/10 text-orange-300" },
  year_5: { icon: Gem, className: "border-pink-400/35 bg-pink-400/10 text-pink-300" },
};

export function BadgeChips({ badges = [], compact = false, className }: { badges?: string[]; compact?: boolean; className?: string }) {
  const visible = badges.filter(isBadgeId);
  if (visible.length === 0) return null;
  const shown = compact ? visible.slice(0, 2) : visible;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {shown.map((id) => {
        const { icon: Icon, className: tone } = badgeStyle[id];
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider", tone)}>
                <Icon size={10} />{!compact && BADGE_LABELS[id]}
              </span>
            </TooltipTrigger>
            <TooltipContent>{BADGE_LABELS[id]}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
