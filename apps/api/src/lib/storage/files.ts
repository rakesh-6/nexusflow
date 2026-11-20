import type { ResourceKind } from "@nexusflow/shared";
import { env } from "../../config/env.ts";
import { cloudinaryConfigured, signParams } from "./cloudinary.ts";

// Where attachment files live (PRD §11.11). Like email, there are two
// providers with the same shape: Cloudinary for the real app, and an
// in-memory one for tests, so uploads can be tested without an account.
// Files are "authenticated": nobody can open them without a link we sign.

export interface StoredFile {
  bytes: number;
  /** The format the service detected ("" for plain files). */
  format: string;
  width: number | null;
  height: number | null;
  version: string | null;
}

export interface FileStorage {
  readonly name: string;
  readonly configured: boolean;
  /** A one-time signed upload of exactly this file name and kind. */
  signUpload(publicId: string, kind: ResourceKind): { url: string; fields: Record<string, string> };
  /** What was really uploaded, or null if nothing was. */
  fetch(publicId: string, kind: ResourceKind): Promise<StoredFile | null>;
  destroy(publicId: string, kind: ResourceKind): Promise<void>;
  /** A download link that stops working after `expiresAt`. */
  signedUrl(
    publicId: string,
    kind: ResourceKind,
    format: string,
    expiresAt: Date,
    asAttachment: boolean,
  ): string;
}

const RESOURCE: Record<ResourceKind, string> = { IMAGE: "image", VIDEO: "video", RAW: "raw" };

function cloudinaryStorage(): FileStorage {
  const cloud = () => ({
    cloudName: env.CLOUDINARY_CLOUD_NAME ?? "",
    apiKey: env.CLOUDINARY_API_KEY ?? "",
    apiSecret: env.CLOUDINARY_API_SECRET ?? "",
  });
  const api = (kind: ResourceKind, action: string) =>
    `https://api.cloudinary.com/v1_1/${cloud().cloudName}/${RESOURCE[kind]}/${action}`;
  const signed = (params: Record<string, string | number>) => {
    const { apiKey, apiSecret } = cloud();
    return {
      ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
      api_key: apiKey,
      signature: signParams(params, apiSecret),
    };
  };
  const timestamp = () => Math.floor(Date.now() / 1000);

  return {
    name: "cloudinary",
    configured: cloudinaryConfigured,
    signUpload(publicId, kind) {
      return {
        url: api(kind, "upload"),
        fields: signed({
          public_id: publicId,
          timestamp: timestamp(),
          type: "authenticated",
          overwrite: "false",
        }),
      };
    },
    async fetch(publicId, kind) {
      const { apiKey, apiSecret, cloudName } = cloud();
      const path = publicId.split("/").map(encodeURIComponent).join("/");
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/resources/${RESOURCE[kind]}/authenticated/${path}`,
        {
          headers: {
            authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Cloudinary answered ${response.status}`);
      const resource = (await response.json()) as {
        bytes: number;
        format?: string;
        width?: number;
        height?: number;
        version?: number;
      };
      return {
        bytes: resource.bytes,
        format: resource.format ?? "",
        width: resource.width ?? null,
        height: resource.height ?? null,
        version: resource.version ? String(resource.version) : null,
      };
    },
    async destroy(publicId, kind) {
      const response = await fetch(api(kind, "destroy"), {
        method: "POST",
        body: new URLSearchParams(
          signed({
            public_id: publicId,
            timestamp: timestamp(),
            type: "authenticated",
            invalidate: "true",
          }),
        ),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Cloudinary answered ${response.status}`);
    },
    signedUrl(publicId, kind, format, expiresAt, asAttachment) {
      // Cloudinary's private download address, valid until expires_at.
      const params = new URLSearchParams(
        signed({
          public_id: publicId,
          ...(format ? { format } : {}),
          type: "authenticated",
          timestamp: timestamp(),
          expires_at: Math.floor(expiresAt.getTime() / 1000),
          ...(asAttachment ? { attachment: "true" } : {}),
        }),
      );
      return `${api(kind, "download")}?${params}`;
    },
  };
}

/** For tests: "uploads" are whatever a test puts here. */
export function memoryStorage() {
  const files = new Map<string, StoredFile>();
  const destroyed: string[] = [];
  const storage: FileStorage & {
    put(publicId: string, file: Partial<StoredFile> & { bytes: number }): void;
    destroyed: string[];
  } = {
    name: "memory",
    configured: true,
    destroyed,
    put(publicId, file) {
      files.set(publicId, { format: "", width: null, height: null, version: "1", ...file });
    },
    signUpload(publicId) {
      return { url: "https://upload.test/upload", fields: { public_id: publicId } };
    },
    async fetch(publicId) {
      return files.get(publicId) ?? null;
    },
    async destroy(publicId) {
      files.delete(publicId);
      destroyed.push(publicId);
    },
    signedUrl(publicId, _kind, _format, expiresAt) {
      return `https://files.test/${publicId}?expires=${expiresAt.getTime()}`;
    },
  };
  return storage;
}

export const testStorage = memoryStorage();

/** The storage the app uses: the in-memory one in tests, Cloudinary otherwise. */
export const fileStorage: FileStorage = env.NODE_ENV === "test" ? testStorage : cloudinaryStorage();
