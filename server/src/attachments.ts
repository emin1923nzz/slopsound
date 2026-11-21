import { z } from "zod";

const MEDIA_MIMES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg",
]);

const BLOCKED_MIMES = new Set([
  "text/html", "image/svg+xml", "application/javascript", "text/javascript", "application/x-javascript",
]);

const BLOCKED_EXTENSIONS = new Set([
  "html", "htm", "svg", "js", "jsx", "ts", "tsx", "php", "exe", "bat", "cmd", "ps1", "sh", "jar", "msi", "scr", "vbs", "hta",
]);

function isAllowedMime(mime: string): boolean {
  if (BLOCKED_MIMES.has(mime)) return false;
  if (MEDIA_MIMES.has(mime) || mime === "application/octet-stream") return true;
  return mime.startsWith("application/") || mime.startsWith("text/");
}

export const attachmentSchema = z.object({
  kind: z.enum(["image", "video", "audio", "file"]),
  mime: z.string().min(1).max(120).refine(isAllowedMime, "unsupported_mime"),
  name: z.string().min(1).max(200),
  url: z.string().min(1).max(14_000_000),
  bytes: z.number().int().min(0).max(8_000_000),
  width: z.number().int().min(1).max(10_000).optional(),
  height: z.number().int().min(1).max(10_000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.kind !== "file" && !value.mime.startsWith(`${value.kind}/`)) {
    ctx.addIssue({ code: "custom", path: ["mime"], message: "mime_kind_mismatch" });
  }
  if (value.kind === "file" && value.bytes > 4_000_000) {
    ctx.addIssue({ code: "custom", path: ["bytes"], message: "file_too_large" });
  }
  const extension = value.name.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXTENSIONS.has(extension)) {
    ctx.addIssue({ code: "custom", path: ["name"], message: "unsafe_file" });
  }
  const prefix = `data:${value.mime};base64,`;
  if (!value.url.startsWith(prefix) || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.url.slice(prefix.length))) {
    ctx.addIssue({ code: "custom", path: ["url"], message: "invalid_data_url" });
  }
});

export const attachmentsSchema = z.array(attachmentSchema).max(2);

export type ChatAttachment = z.infer<typeof attachmentSchema>;
