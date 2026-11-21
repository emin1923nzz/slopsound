import { z } from "zod";

export const attachmentSchema = z.object({
  kind: z.enum(["image", "video", "audio"]),
  mime: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"]),
  name: z.string().min(1).max(200),
  url: z.string().min(1).max(14_000_000),
  bytes: z.number().int().min(0).max(8_000_000),
  width: z.number().int().min(1).max(10_000).optional(),
  height: z.number().int().min(1).max(10_000).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.mime.startsWith(`${value.kind}/`)) {
    ctx.addIssue({ code: "custom", path: ["mime"], message: "mime_kind_mismatch" });
  }
  const prefix = `data:${value.mime};base64,`;
  if (!value.url.startsWith(prefix) || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.url.slice(prefix.length))) {
    ctx.addIssue({ code: "custom", path: ["url"], message: "invalid_data_url" });
  }
});

export const attachmentsSchema = z.array(attachmentSchema).max(2);

export type ChatAttachment = z.infer<typeof attachmentSchema>;
