import type { KeyboardEvent, Ref } from "react";
import { Blobatar } from "@blobatar/react";
import { useApp } from "@/lib/store";
import { useAudio } from "@/lib/audio";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/data";

type Props = {
  name: string;
  size?: number;
  status?: Status;
  showDot?: boolean;
  dotPosition?: "top-right" | "bottom-right";
  background?: boolean | "square" | "circle" | "squircle";
  hue?: number;
  title?: string;
  className?: string;
  animate?: "hover" | "always";
  onClick?: () => void;
  blobatarRef?: Ref<SVGSVGElement>;
};

const dotColor: Record<Status, string> = {
  online: "bg-lime",
  idle: "bg-amber",
  dnd: "bg-coral",
  offline: "bg-muted",
};

export function SlopAvatar({
  name,
  size = 36,
  status = "online",
  showDot = false,
  dotPosition = "bottom-right",
  background = "circle",
  hue,
  title,
  className,
  animate,
  onClick,
  blobatarRef,
}: Props) {
  const reduceMotion = useApp((s) => s.reduceMotion);
  const mode = reduceMotion ? undefined : animate ?? "hover";
  const dotSize = size >= 56 ? "h-3.5 w-3.5" : size >= 32 ? "h-2.5 w-2.5" : "h-2 w-2";

  function activate() {
    if (!onClick) return;
    useAudio.getState().playSound("blop");
    onClick();
  }

  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (!onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  }

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", onClick && "cursor-pointer")}
      style={{ width: size, height: size }}
      onClick={onClick ? activate : undefined}
      onKeyDown={onClick ? onKeyDown : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? title ?? name : undefined}
    >
      <Blobatar
        ref={blobatarRef}
        name={name}
        size={size}
        background={background}
        hue={hue}
        animate={mode}
        title={title ?? name}
        className={cn("block rounded-full", className)}
      />
      {showDot && (
        <span
          className={cn(
            "status-dot absolute ring-2 ring-[#17141f]",
            dotSize,
            dotColor[status],
            dotPosition === "top-right" ? "-right-0.5 -top-0.5" : "-bottom-0.5 -right-0.5",
          )}
        />
      )}
    </span>
  );
}

type LogoProps = Omit<Props, "name" | "background" | "hue" | "showDot" | "dotPosition" | "title">;

export function SlopLogo({ size = 28, className, animate, onClick }: LogoProps) {
  return (
    <SlopAvatar
      name="slop sound"
      size={size}
      background="squircle"
      hue={265}
      showDot
      dotPosition="top-right"
      title="SlopSound"
      className={className}
      animate={animate}
      onClick={onClick}
    />
  );
}
