import {
  AI_REQUESTS_PER_HOUR,
  PLAN_LIMITS,
  type AiFeature,
  type AiStatus,
  type AiUsageRow,
} from "@nexusflow/shared";
import type { z } from "zod";
import type { User } from "../../generated/prisma/client.ts";
import { AiProviderError, type AiProvider } from "../../lib/ai/provider.ts";
import { logger } from "../../lib/logger.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";

// Who may use AI and how much (PRD §11.16.1, §24.1 "bounded cost"), and the
// one place that calls the provider, checks its answer and records usage.

const startOfMonth = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Organization.settings.aiEnabled: on unless the owner turned it off. */
export function aiEnabledFor(tenant: Tenant) {
  const settings = (tenant.organization.settings ?? {}) as { aiEnabled?: unknown };
  return settings.aiEnabled !== false;
}

const monthlyUsage = (organizationId: string) =>
  prisma.aiUsage.count({ where: { organizationId, createdAt: { gte: startOfMonth() } } });

export async function aiStatus(tenant: Tenant, provider: AiProvider): Promise<AiStatus> {
  const limit = PLAN_LIMITS[tenant.subscription.planTier].aiRequestsPerMonth;
  return {
    enabled: aiEnabledFor(tenant),
    planAllows: limit !== 0,
    usedThisMonth: await monthlyUsage(tenant.organization.id),
    monthlyLimit: limit,
    provider: provider.name,
    canManage: tenant.membership.role === "OWNER",
  };
}

/** Plan, organization switch, monthly quota, then the per-person hourly limit. */
async function assertAllowed(tenant: Tenant, user: User) {
  const limit = PLAN_LIMITS[tenant.subscription.planTier].aiRequestsPerMonth;
  if (limit === 0) {
    throw new AppError(402, "PLAN_FEATURE_REQUIRED", "AI features are part of the Pro plan.", {
      feature: "ai",
      planTier: tenant.subscription.planTier,
    });
  }
  if (!aiEnabledFor(tenant)) {
    throw new AppError(403, "AI_DISABLED", "AI features are turned off for this organization");
  }
  const used = await monthlyUsage(tenant.organization.id);
  if (limit !== null && used >= limit) {
    throw new AppError(
      402,
      "PLAN_LIMIT_REACHED",
      `Your ${tenant.subscription.planTier} plan allows ${limit} AI requests a month.`,
      {
        limit: "aiRequestsPerMonth",
        current: used,
        max: limit,
        planTier: tenant.subscription.planTier,
      },
    );
  }
  const lastHour = await prisma.aiUsage.count({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
  });
  if (lastHour >= AI_REQUESTS_PER_HOUR) {
    throw new AppError(
      429,
      "RATE_LIMITED",
      `You can make ${AI_REQUESTS_PER_HOUR} AI requests an hour. Please try again later.`,
    );
  }
}

// A simple circuit breaker: after 5 provider failures in a row, wait a minute
// before trying again, so a broken provider is not hammered.
let failuresInARow = 0;
let openUntil = 0;

/** "```json { … } ```" or plain JSON → the parsed value, or undefined. */
function parseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return undefined;
  }
}

interface AiCall<S extends z.ZodType> {
  feature: AiFeature;
  system: string;
  prompt: string;
  schema: S;
  maxTokens: number;
}

/**
 * Checks the guards, asks the provider, checks the answer against `schema`
 * and writes one AiUsage row whatever happens (PRD §25, Phase 11 criteria).
 */
export async function askAi<S extends z.ZodType>(
  tenant: Tenant,
  user: User,
  provider: AiProvider,
  call: AiCall<S>,
): Promise<z.output<S>> {
  await assertAllowed(tenant, user);
  if (Date.now() < openUntil) {
    throw new AppError(
      503,
      "AI_UNAVAILABLE",
      "The AI service is having problems. Try again in a minute.",
    );
  }
  const started = Date.now();
  const record = (
    status: string,
    tokens: { promptTokens: number; completionTokens: number },
    error?: string,
  ) =>
    prisma.aiUsage
      .create({
        data: {
          organizationId: tenant.organization.id,
          userId: user.id,
          feature: call.feature,
          provider: provider.name,
          model: provider.model,
          promptTokens: tokens.promptTokens,
          completionTokens: tokens.completionTokens,
          latencyMs: Date.now() - started,
          status,
          ...(error ? { error: error.slice(0, 500) } : {}),
        },
      })
      .catch((failure: unknown) => logger.error({ err: failure }, "Could not record AI usage"));

  let answer;
  try {
    answer = await provider.complete({
      system: call.system,
      prompt: call.prompt,
      maxTokens: call.maxTokens,
    });
    failuresInARow = 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed";
    await record("ERROR", { promptTokens: 0, completionTokens: 0 }, message);
    if (++failuresInARow >= 5) openUntil = Date.now() + 60_000;
    if (error instanceof AiProviderError && error.rateLimited) {
      throw new AppError(
        503,
        "AI_BUSY",
        "The free AI service is busy. Please try again in a minute.",
      );
    }
    throw new AppError(
      502,
      "AI_PROVIDER_ERROR",
      "The AI service did not answer. Please try again.",
    );
  }

  const parsed = call.schema.safeParse(parseJson(answer.text));
  if (!parsed.success) {
    await record("INVALID_OUTPUT", answer, parsed.error.issues[0]?.message ?? "Invalid output");
    throw new AppError(
      502,
      "AI_INVALID_OUTPUT",
      "The AI answered something unusable. Please try again.",
    );
  }
  await record("SUCCESS", answer);
  return parsed.data;
}

/** This month's usage by feature, for the owner's Settings › AI page. */
export async function usageThisMonth(tenant: Tenant): Promise<AiUsageRow[]> {
  const rows = await prisma.aiUsage.groupBy({
    by: ["feature", "status"],
    where: { organizationId: tenant.organization.id, createdAt: { gte: startOfMonth() } },
    _count: { _all: true },
    _sum: { promptTokens: true, completionTokens: true },
  });
  const byFeature = new Map<AiFeature, AiUsageRow>();
  for (const row of rows) {
    const entry = byFeature.get(row.feature) ?? {
      feature: row.feature,
      requests: 0,
      failed: 0,
      promptTokens: 0,
      completionTokens: 0,
    };
    entry.requests += row._count._all;
    if (row.status !== "SUCCESS") entry.failed += row._count._all;
    entry.promptTokens += row._sum.promptTokens ?? 0;
    entry.completionTokens += row._sum.completionTokens ?? 0;
    byFeature.set(row.feature, entry);
  }
  return [...byFeature.values()].sort((a, b) => b.requests - a.requests);
}

/** Lets tests start without a tripped breaker. */
export function resetAiBreaker() {
  failuresInARow = 0;
  openUntil = 0;
}
