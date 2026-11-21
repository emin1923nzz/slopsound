import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";

type Peek = { visible: boolean; name: string; preview: string; x: number; y: number };

export function ChannelPeek() {
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [peek, setPeek] = useState<Peek>({ visible: false, name: "", preview: "", x: 0, y: 0 });

  useEffect(() => {
    function enter(event: PointerEvent) {
      const target = (event.target as HTMLElement).closest<HTMLElement>(".channel-item");
      if (!target) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const rect = target.getBoundingClientRect();
        const name = target.dataset.name ?? "kanal";
        const messages = useApp.getState().messages;
        const preview = messages[messages.length - 1]?.text ?? "Henüz mesaj yok";
        setPeek({
          visible: true,
          name,
          preview: preview.length > 72 ? `${preview.slice(0, 72)}…` : preview,
          x: Math.min(rect.right + 12, window.innerWidth - 292),
          y: Math.min(rect.top, window.innerHeight - 110),
        });
      }, 500);
    }
    function leave(event: PointerEvent) {
      if (!(event.target as HTMLElement).closest(".channel-item")) return;
      window.clearTimeout(timer.current);
      setPeek((current) => ({ ...current, visible: false }));
    }
    document.addEventListener("pointerover", enter);
    document.addEventListener("pointerout", leave);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener("pointerover", enter);
      document.removeEventListener("pointerout", leave);
    };
  }, []);

  return (
    <div ref={cardRef} className={`channel-peek-card ${peek.visible ? "visible" : ""}`} style={{ left: peek.x, top: peek.y }}>
      <p className="text-[12px] font-extrabold">#{peek.name}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-white/70">Son mesaj: “{peek.preview}”</p>
    </div>
  );
}
