import { createHash, randomBytes } from "node:crypto";

/** A random secret that is safe to put in a cookie or a link (43 characters). */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The SHA-256 fingerprint of a token, as 64 hex characters. Only fingerprints
 * are stored, so someone who reads the database cannot use the tokens.
 */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
