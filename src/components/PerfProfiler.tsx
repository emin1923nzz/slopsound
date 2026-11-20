import { Fragment, Profiler, useEffect, useRef, type ReactNode } from "react";
import { usePerf } from "@/lib/perf";

export function PerfProfiler({ id, children }: { id: string; children: ReactNode }) {
  const enabled = usePerf((s) => s.enabled);
  const record = usePerf((s) => s.record);
  const setFps = usePerf((s) => s.setFps);
  const frames = useRef(0);
  const last = useRef(performance.now());

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      frames.current += 1;
      if (now - last.current >= 1000) {
        setFps(Math.round((frames.current * 1000) / (now - last.current)));
        frames.current = 0;
        last.current = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [setFps]);

  const onRender = (renderId: string, phase: "mount" | "update" | "nested-update", actualDuration: number) => record({
    id: renderId,
    phase: phase === "mount" ? "mount" : "update",
    actualDuration,
    at: Date.now(),
  });

  if (!enabled) return <Fragment>{children}</Fragment>;

  return <Profiler id={id} onRender={onRender}>{children}</Profiler>;
}
