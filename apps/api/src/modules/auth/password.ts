import * as argon2 from "argon2";

// Argon2id with 64 MB of memory and 3 passes (PRD §19.2): about 100 ms per
// hash on a normal server, which makes guessing passwords very expensive.
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, HASH_OPTIONS);
}

// A hash of a password nobody uses, checked when an account does not exist.
let dummyHash: Promise<string> | undefined;

/**
 * True when `password` matches `hash`. When there is no hash (unknown email or
 * a Google-only account) it still does the same slow work and returns false,
 * so response times never reveal which emails have accounts.
 */
export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  dummyHash ??= hashPassword("this-is-not-anybodys-password-1");
  const matches = await argon2.verify(hash ?? (await dummyHash), password);
  return hash !== null && matches;
}

/** True when a stored hash uses older settings and should be re-hashed at login. */
export function hashNeedsUpgrade(hash: string): boolean {
  return argon2.needsRehash(hash, HASH_OPTIONS);
}
