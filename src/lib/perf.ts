import { create } from "zustand";

export type RenderSample = {
  id: string;
  phase: "mount" | "update";
  actualDuration: number;
  at: number;
};

type PerfState = {
  enabled: boolean;
  samples: RenderSample[];
  fps: number;
  setEnabled: (enabled: boolean) => void;
  record: (sample: RenderSample) => void;
  setFps: (fps: number) => void;
  clear: () => void;
};

export const usePerf = create<PerfState>((set) => ({
  enabled: false,
  samples: [],
  fps: 0,
  setEnabled: (enabled) => set({ enabled, samples: [] }),
  record: (sample) => set((s) => (s.enabled ? { samples: [...s.samples, sample].slice(-60) } : s)),
  setFps: (fps) => set({ fps }),
  clear: () => set({ samples: [] }),
}));
