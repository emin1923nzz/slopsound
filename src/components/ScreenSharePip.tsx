import { useEffect, useRef, useState } from "react";
import { Square, X } from "lucide-react";
import { useLiveKit } from "@/lib/livekit";
import { useVideo } from "@/lib/video";

type Point = { x: number; y: number };

export function ScreenSharePip() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const drag = useRef({ active: false, offsetX: 0, offsetY: 0 });
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [snapped, setSnapped] = useState(false);
  const [hidden, setHidden] = useState(false);
  const liveSharing = useLiveKit((s) => s.screenSharing);
  const localSharing = useVideo((s) => s.screenSharing);
  const screens = useLiveKit((s) => s.screens);
  const setScreenShare = useLiveKit((s) => s.setScreenShare);
  const liveLocalStream = useLiveKit((s) => s.localScreenStream);
  const localVideoStream = useVideo((s) => s.getScreenStream());
  const localStream = liveLocalStream ?? localVideoStream;
  const remote = screens[0] ?? null;
  const isSharing = liveSharing || localSharing;
  const visible = !hidden && (isSharing || Boolean(remote));

  useEffect(() => {
    if (isSharing || remote) setHidden(false);
  }, [isSharing, remote?.id]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !visible) return;
    if (localStream) {
      el.srcObject = localStream;
      void el.play().catch(() => undefined);
      return () => { el.srcObject = null; };
    }
    if (remote?.videoTrack) {
      useLiveKit.getState().attachTrack(el, remote.videoTrack);
      return () => { el.srcObject = null; };
    }
  }, [localStream, remote, visible]);

  useEffect(() => {
    if (!visible || snapped) return;
    const margin = 20;
    const width = 248;
    setPosition({
      x: window.innerWidth - width - margin,
      y: 64,
    });
    setSnapped(true);
  }, [visible, snapped]);

  if (!visible) return null;

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { active: true, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSnapped(false);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    setPosition({ x: event.clientX - drag.current.offsetX, y: event.clientY - drag.current.offsetY });
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    drag.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const margin = 20;
    const targetX = rect.left + rect.width / 2 < window.innerWidth / 2 ? margin : window.innerWidth - rect.width - margin;
    const targetY = rect.top + rect.height / 2 < window.innerHeight / 2 ? margin : window.innerHeight - rect.height - margin;
    setPosition({ x: targetX, y: targetY });
    setSnapped(true);
  }

  function close() {
    setHidden(true);
  }

  function stop() {
    setHidden(true);
    void setScreenShare(false);
  }

  return (
    <div
      className="pip-window no-drag"
      style={{ left: position.x, top: position.y, right: "auto", transition: snapped ? "left .5s var(--ease), top .5s var(--ease)" : "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <video ref={videoRef} autoPlay muted playsInline style={{ objectFit: "contain" }} />
      {isSharing && (
        <button
          aria-label="Paylaşımı durdur"
          onClick={stop}
          className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white/80 transition hover:bg-danger hover:text-white"
        >
          <Square size={12} fill="currentColor" />
        </button>
      )}
      <button
        aria-label="Pencereyi kapat"
        onClick={close}
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white/80 transition hover:bg-black/80 hover:text-white"
      >
        <X size={13} />
      </button>
      <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold text-white/80">
        {remote && !localStream ? `${remote.name} paylaşıyor` : "Ekran paylaşımı"}
      </span>
    </div>
  );
}
