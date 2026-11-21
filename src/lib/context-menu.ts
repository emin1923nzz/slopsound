import { copyText as copyNativeText, pasteText } from "./native";

export type EditableElement = HTMLInputElement | HTMLTextAreaElement;

const LINK_PATTERN = /https?:\/\/[^\s<>"'`]+/i;

export function findFirstLink(text: string) {
  let link = text.match(LINK_PATTERN)?.[0]?.replace(/[.,;:!?]+$/, "");
  if (!link) return null;
  for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
    while (link.endsWith(close) && (link.split(open).length - 1) < (link.split(close).length - 1)) {
      link = link.slice(0, -1);
    }
  }
  return link || null;
}

export async function copyToClipboard(text: string) {
  if (!text) return;
  await copyNativeText(text);
}

function setEditableValue(element: EditableElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function pasteIntoEditable(element: EditableElement) {
  const text = await pasteText();
  if (!text) return;
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  setEditableValue(element, `${element.value.slice(0, start)}${text}${element.value.slice(end)}`);
  const caret = start + text.length;
  element.setSelectionRange(caret, caret);
}

export async function cutFromEditable(element: EditableElement) {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? start;
  if (start === end) return;
  const selected = element.value.slice(start, end);
  await copyNativeText(selected);
  setEditableValue(element, `${element.value.slice(0, start)}${element.value.slice(end)}`);
  element.setSelectionRange(start, start);
}

export function selectAllInEditable(element: EditableElement) {
  element.focus();
  element.select();
}
