import { PLAN_LIMITS, type PlanLimits } from "@nexusflow/shared";
import type { Subscription } from "../generated/prisma/client.ts";
import { AppError } from "../utils/errors.ts";

// Plan limits are checked on the server before anything is created (PRD §23.2).
// Going over answers 402 PLAN_LIMIT_REACHED with the exact numbers, so the web
// app can explain what to upgrade.

export function limitsFor(subscription: Pick<Subscription, "planTier">): PlanLimits {
  return PLAN_LIMITS[subscription.planTier];
}

/**
 * Throws 402 when `current + adding` would pass the plan's `limit`.
 * `current` is how many already exist (and count against the limit).
 */
export function assertWithinPlan(
  subscription: Pick<Subscription, "planTier">,
  limit: keyof PlanLimits,
  current: number,
  adding = 1,
) {
  const max = limitsFor(subscription)[limit];
  if (max !== null && current + adding > max) {
    throw new AppError(
      402,
      "PLAN_LIMIT_REACHED",
      `Your ${subscription.planTier} plan allows ${max} here. Upgrade your plan to add more.`,
      { limit, current, max, planTier: subscription.planTier },
    );
  }
}
