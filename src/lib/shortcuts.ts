import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./native";

export type ShortcutAction = "mic" | "deafen" | "screen" | "ptt";

export const shortcutLabels: Record<ShortcutAction, string> = {
  mic: "Mikrofon aç / kapat",
  deafen: "Ses çıkışını kontrol et",
  screen: "Ekran paylaşımı",
  ptt: "Bas-konuş",
};

const defaults: Record<ShortcutAction, string> = {
  mic: "Control+Shift+M",
  deafen: "Control+Shift+D",
  screen: "Control+Shift+S",
  ptt: "Control+Shift+P",
};

type ShortcutState = {
  bindings: Record<ShortcutAction, string>;
  setShortcut: (action: ShortcutAction, accelerator: string) => void;
  reset: () => void;
  apply: () => Promise<void>;
};

export const useShortcuts = create<ShortcutState>()(persist((set, get) => ({
  bindings: defaults,
  setShortcut: (action, accelerator) => {
    set((s) => ({ bindings: { ...s.bindings, [action]: accelerator } }));
    void get().apply();
  },
  reset: () => {
    set({ bindings: defaults });
    void get().apply();
  },
  apply: async () => {
    if (!isTauri()) return;
    await invoke("update_shortcuts", { shortcuts: get().bindings });
  },
}), {
  name: "slopsound-shortcuts",
  storage: createJSONStorage(() => localStorage),
}));
