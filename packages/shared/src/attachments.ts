import { z } from "zod";
import type { PersonSummary } from "./projects.ts";

// File attachments (PRD §11.11), shared by the API and the web app.

export type ResourceKind = "IMAGE" | "VIDEO" | "RAW";

/**
 * The allow-list: extension -> accepted declared types, Cloudinary's storage
 * kind and the formats Cloudinary may detect (PRD §11.11.4). Anything else,
 * for example "evil.exe", is refused.
 */
export const ATTACHMENT_TYPES: Record<
  string,
  { mimes: string[]; kind: ResourceKind; formats: string[] }
> = {
  jpg: { mimes: ["image/jpeg"], kind: "IMAGE", formats: ["jpg", "jpeg"] },
  jpeg: { mimes: ["image/jpeg"], kind: "IMAGE", formats: ["jpg", "jpeg"] },
  png: { mimes: ["image/png"], kind: "IMAGE", formats: ["png"] },
  gif: { mimes: ["image/gif"], kind: "IMAGE", formats: ["gif"] },
  webp: { mimes: ["image/webp"], kind: "IMAGE", formats: ["webp"] },
  // SVG can hold scripts: it is stored as a plain file and only ever downloaded.
  svg: { mimes: ["image/svg+xml"], kind: "RAW", formats: ["svg", ""] },
  pdf: { mimes: ["application/pdf"], kind: "IMAGE", formats: ["pdf"] },
  txt: { mimes: ["text/plain"], kind: "RAW", formats: ["txt", ""] },
  md: {
    mimes: ["text/markdown", "text/plain", "text/x-markdown"],
    kind: "RAW",
    formats: ["md", ""],
  },
  csv: { mimes: ["text/csv", "application/vnd.ms-excel"], kind: "RAW", formats: ["csv", ""] },
  json: { mimes: ["application/json"], kind: "RAW", formats: ["json", ""] },
  docx: {
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    kind: "RAW",
    formats: ["docx", ""],
  },
  xlsx: {
    mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    kind: "RAW",
    formats: ["xlsx", ""],
  },
  pptx: {
    mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    kind: "RAW",
    formats: ["pptx", ""],
  },
  zip: {
    mimes: ["application/zip", "application/x-zip-compressed"],
    kind: "RAW",
    formats: ["zip", ""],
  },
  mp4: { mimes: ["video/mp4"], kind: "VIDEO", formats: ["mp4"] },
  webm: { mimes: ["video/webm"], kind: "VIDEO", formats: ["webm"] },
};

export const MAX_ATTACHMENTS_PER_TASK = 50;
/** A signed download link works for 15 minutes (PRD §11.11.2). */
export const ATTACHMENT_URL_MINUTES = 15;

/** "../my report?.pdf" -> "my report_.pdf": no folders, no control characters, 1-255 characters. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim();
  return (clean || "file").slice(0, 255);
}

export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/** The allow-list entry for a file, or null when it is not allowed. */
export function attachmentType(fileName: string, mimeType: string) {
  const entry = ATTACHMENT_TYPES[extensionOf(fileName)];
  return entry && entry.mimes.includes(mimeType.toLowerCase()) ? entry : null;
}

export const signAttachmentSchema = z
  .object({
    taskId: z.uuid().optional(),
    commentId: z.uuid().optional(),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(3).max(127),
    sizeBytes: z.number().int().positive(),
  })
  .refine((value) => !!value.taskId !== !!value.commentId, {
    message: "Attach the file to either a task or a comment",
  })
  .refine((value) => attachmentType(value.fileName, value.mimeType) !== null, {
    message: "This kind of file cannot be attached",
    path: ["fileName"],
  });

export const attachmentUrlSchema = z.object({
  variant: z.enum(["original", "preview"]).default("original"),
});

export type SignAttachmentInput = z.input<typeof signAttachmentSchema>;

// ---------------------------------------------------------------------------
// What the API answers
// ---------------------------------------------------------------------------

export interface AttachmentSummary {
  id: string;
  taskId: string | null;
  commentId: string | null;
  originalName: string;
  mimeType: string;
  bytes: number;
  kind: ResourceKind;
  width: number | null;
  height: number | null;
  uploader: PersonSummary;
  createdAt: string;
  canDelete: boolean;
}

/** What the browser needs to upload one file straight to the storage service. */
export interface AttachmentUpload {
  attachmentId: string;
  url: string;
  fields: Record<string, string>;
}

export interface AttachmentUrl {
  url: string;
  expiresAt: string;
}
