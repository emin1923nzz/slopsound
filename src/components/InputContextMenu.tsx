import type { ReactNode, RefObject } from "react";
import { Clipboard, Copy, FileText, Scissors } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard, cutFromEditable, pasteIntoEditable, selectAllInEditable } from "@/lib/context-menu";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "./ui";

async function copySelection(element: HTMLInputElement) {
  const text = element.value.slice(element.selectionStart ?? 0, element.selectionEnd ?? 0);
  if (!text) return;
  try {
    await copyToClipboard(text);
    toast.success("Kopyalandı");
  } catch {
    toast.error("Kopyalanamadı");
  }
}

async function cutSelection(element: HTMLInputElement) {
  try {
    await cutFromEditable(element);
    toast.success("Kesildi");
  } catch {
    toast.error("Kesilemedi");
  }
}

async function paste(element: HTMLInputElement) {
  try {
    await pasteIntoEditable(element);
  } catch {
    toast.error("Yapıştırılamadı");
  }
}

export function InputContextMenu({ inputRef, children }: { inputRef: RefObject<HTMLInputElement | null>; children: ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => { const element = inputRef.current; if (element) void cutSelection(element); }}>
          <Scissors size={14} className="text-muted" /> Kes
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => { const element = inputRef.current; if (element) void copySelection(element); }}>
          <Copy size={14} className="text-muted" /> Kopyala
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => { const element = inputRef.current; if (element) void paste(element); }}>
          <Clipboard size={14} className="text-brand" /> Yapıştır
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => { const element = inputRef.current; if (element) selectAllInEditable(element); }}>
          <FileText size={14} className="text-muted" /> Tümünü seç
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
