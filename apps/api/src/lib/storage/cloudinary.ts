import { createHash } from "node:crypto";
import { env } from "../../config/env.ts";

// Cloudinary's free plan stores profile photos (and file attachments from
// Phase 7). The browser uploads straight to Cloudinary with a signature made
// here, so files never pass through our server (PRD §11.11). No Cloudinary
// library is needed: the signature is a SHA-1 fingerprint, and the admin calls
// are plain HTTPS requests.

export const cloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

type Params = Record<string, string | number>;

/**
 * Cloudinary's signature: sort the parameters by name, join them as
 * "a=1&b=2", add the API secret, and take the SHA-1 fingerprint.
 */
export function signParams(params: Params, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1")
    .update(toSign + apiSecret)
    .digest("hex");
}

function config() {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary is not configured");
  }
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
  };
}

export interface SignedUpload {
  /** Where the browser sends the file (a form POST). */
  url: string;
  /** Form fields to send along with the file. */
  fields: Record<string, string>;
}

/** Everything the browser needs to upload one image straight to Cloudinary. */
export function createSignedImageUpload(options: {
  publicId: string;
  allowedFormats: string[];
  /** Applied while uploading, e.g. "c_fill,g_face,h_256,w_256" for a square avatar. */
  transformation?: string;
}): SignedUpload {
  const { cloudName, apiKey, apiSecret } = config();
  const params: Params = {
    public_id: options.publicId,
    timestamp: Math.floor(Date.now() / 1000),
    allowed_formats: options.allowedFormats.join(","),
    overwrite: "false",
    ...(options.transformation ? { transformation: options.transformation } : {}),
  };
  const fields = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );
  return {
    url: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    fields: { ...fields, api_key: apiKey, signature: signParams(params, apiSecret) },
  };
}

export interface CloudinaryImage {
  public_id: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  version: number;
  resource_type: string;
}

/** Asks Cloudinary what was really uploaded, so the browser's word is never trusted. */
export async function fetchImage(publicId: string): Promise<CloudinaryImage | null> {
  const { cloudName, apiKey, apiSecret } = config();
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload/${publicId
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const response = await fetch(url, {
    headers: { authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Cloudinary answered ${response.status}`);
  return (await response.json()) as CloudinaryImage;
}

/** Deletes an image from Cloudinary (best effort: failures are only logged by the caller). */
export async function destroyImage(publicId: string): Promise<void> {
  const { cloudName, apiKey, apiSecret } = config();
  const params: Params = {
    public_id: publicId,
    timestamp: Math.floor(Date.now() / 1000),
    invalidate: "true",
  };
  const body = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    api_key: apiKey,
    signature: signParams(params, apiSecret),
  });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Cloudinary answered ${response.status}`);
}

/** The address of an image, optimized automatically for each browser (f_auto, q_auto). */
export function imageUrl(image: Pick<CloudinaryImage, "public_id" | "version" | "format">) {
  const { cloudName } = config();
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto/v${image.version}/${image.public_id}.${image.format}`;
}
