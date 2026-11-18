import type { VerificationType } from "../../generated/prisma/client.ts";
import { randomToken, sha256 } from "../../lib/crypto.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/errors.ts";

// Single-use links sent by email (PRD §19.5). The link contains a random
// token; the database keeps only its fingerprint, its purpose and its expiry.

const LIFETIME_MS: Record<VerificationType, number> = {
  EMAIL_VERIFY: 24 * 60 * 60_000, // 24 hours
  PASSWORD_RESET: 60 * 60_000, // 1 hour
};

/** Creates a new link token. Older unused links of the same kind stop working. */
export async function createVerificationToken(userId: string, type: VerificationType) {
  await prisma.verificationToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = randomToken();
  await prisma.verificationToken.create({
    data: {
      userId,
      type,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + LIFETIME_MS[type]),
    },
  });
  return token;
}

/** Checks a link token and marks it used, so it can never work twice. Returns its owner. */
export async function consumeVerificationToken(token: string, type: VerificationType) {
  const record = await prisma.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  const invalid = new AppError(
    400,
    "TOKEN_INVALID",
    "This link is not valid. It may have been used already, or a newer one was sent.",
  );
  if (!record || record.type !== type || record.usedAt) throw invalid;
  if (record.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, "TOKEN_EXPIRED", "This link has expired. Please ask for a new one.");
  }

  // "Only if still unused": if two clicks arrive at once, only one of them wins.
  const { count } = await prisma.verificationToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count === 0) throw invalid;
  return { userId: record.userId };
}

/** How many links of this kind were created for the user recently (for resend limits). */
export function countRecentTokens(userId: string, type: VerificationType, withinMs: number) {
  return prisma.verificationToken.count({
    where: { userId, type, createdAt: { gte: new Date(Date.now() - withinMs) } },
  });
}
