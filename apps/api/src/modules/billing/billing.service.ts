import {
  isDowngrade,
  overLimits,
  priceInPaise,
  type BillingInterval,
  type BillingOverview,
  type CheckoutStart,
  type PaidTier,
  type PlanUsage,
  type billingProfileSchema,
} from "@nexusflow/shared";
import type { Request } from "express";
import type { z } from "zod";
import { Prisma, type Subscription, type User } from "../../generated/prisma/client.ts";
import { logActivity } from "../../lib/activity.ts";
import { emitEvent } from "../../lib/events.ts";
import { logger } from "../../lib/logger.ts";
import { payments } from "../../lib/payments/razorpay.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { notify } from "../notifications/notifications.service.ts";
import { countUsage } from "../organizations/organizations.service.ts";

// Subscriptions in Razorpay test mode (PRD §11.14). The plan changes only when
// Razorpay's signed webhook says so; the browser's word is never enough
// (AC-BILL-03). Every change is written to the BILLING audit log.

function assertConfigured() {
  if (!payments.configured) {
    throw new AppError(
      503,
      "BILLING_NOT_CONFIGURED",
      "Payments are not set up on this server yet (Razorpay test keys are missing)",
    );
  }
}

async function audit(
  organizationId: string,
  actorId: string | null,
  action: string,
  metadata: Prisma.InputJsonValue,
  req?: Request,
) {
  await logActivity({
    organizationId,
    actorId,
    category: "BILLING",
    action,
    entityType: "subscription",
    entityId: organizationId,
    metadata,
    ...(req ? { req } : {}),
  });
}

/** Tells the owner and the open tabs that the plan changed. */
async function announce(organizationId: string, title: string) {
  emitEvent({ name: "billing:updated", orgId: organizationId, actorId: "system", data: {} });
  const owner = await prisma.organizationMember.findFirst({
    where: { organizationId, role: "OWNER" },
    select: { userId: true },
  });
  if (owner) {
    notify({
      type: "BILLING_EVENT",
      orgId: organizationId,
      actorId: null,
      recipientIds: [owner.userId],
      data: { title },
    });
  }
}

export async function planUsage(organizationId: string): Promise<PlanUsage> {
  const [usage, perWorkspace] = await Promise.all([
    countUsage(organizationId),
    prisma.project.groupBy({
      by: ["workspaceId"],
      where: { organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
      _count: { _all: true },
    }),
  ]);
  return {
    workspaces: usage.workspaces,
    members: usage.members,
    guests: usage.guests,
    activeProjectsPerWorkspace: Math.max(0, ...perWorkspace.map((row) => row._count._all)),
    storageBytes: usage.storageBytes,
  };
}

// ---------------------------------------------------------------------------
// The billing page
// ---------------------------------------------------------------------------

export async function billingOverview(tenant: Tenant): Promise<BillingOverview> {
  const organizationId = tenant.organization.id;
  const [subscription, usage, invoices, paid, profile] = await Promise.all([
    prisma.subscription.findUniqueOrThrow({ where: { organizationId } }),
    planUsage(organizationId),
    prisma.invoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
    prisma.payment.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
    prisma.billingProfile.findUnique({ where: { organizationId } }),
  ]);
  return {
    configured: payments.configured,
    plan: {
      tier: subscription.planTier,
      status: subscription.status,
      interval: subscription.interval,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      scheduledPlanTier: subscription.scheduledPlanTier,
    },
    usage,
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      amountDue: invoice.amountDue,
      amountPaid: invoice.amountPaid,
      currency: invoice.currency,
      status: invoice.status,
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      url: invoice.pdfUrl ?? invoice.hostedUrl,
    })),
    payments: paid.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      failureReason: payment.failureReason,
      paidAt: payment.paidAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
    })),
    profile: profile && {
      legalName: profile.legalName,
      email: profile.email,
      addressLine1: profile.addressLine1,
      ...(profile.addressLine2 ? { addressLine2: profile.addressLine2 } : {}),
      city: profile.city,
      state: profile.state,
      postalCode: profile.postalCode,
      country: profile.country,
      gstin: profile.gstin,
    },
  };
}

export async function saveBillingProfile(
  tenant: Tenant,
  user: User,
  input: z.output<typeof billingProfileSchema>,
  req: Request,
) {
  const data = { ...input, addressLine2: input.addressLine2 ?? null, gstin: input.gstin ?? null };
  await prisma.billingProfile.upsert({
    where: { organizationId: tenant.organization.id },
    create: { organizationId: tenant.organization.id, ...data },
    update: data,
  });
  await audit(
    tenant.organization.id,
    user.id,
    "billing.profile_updated",
    { gstin: !!input.gstin },
    req,
  );
  return billingOverview(tenant);
}

// ---------------------------------------------------------------------------
// Checkout (PRD §11.14.3)
// ---------------------------------------------------------------------------

export async function startCheckout(
  tenant: Tenant,
  user: User,
  input: { planTier: PaidTier; interval: BillingInterval },
  req: Request,
): Promise<CheckoutStart> {
  assertConfigured();
  const organizationId = tenant.organization.id;
  const current = await prisma.subscription.findUniqueOrThrow({ where: { organizationId } });
  if (current.planTier !== "FREE" && current.status === "ACTIVE") {
    throw new AppError(
      409,
      "ALREADY_SUBSCRIBED",
      "This organization already has a paid plan; change it instead",
    );
  }
  const planId = payments.planIdFor(input.planTier, input.interval);
  if (!planId) {
    throw new AppError(503, "PLAN_NOT_CONFIGURED", "This plan is not set up in Razorpay yet");
  }
  const customerId =
    current.providerCustomerId ??
    (await payments.createCustomer({ name: tenant.organization.name, email: user.email }));
  const subscription = await payments.createSubscription({
    planId,
    customerId,
    // Razorpay needs an end: 10 years of renewals.
    totalCount: input.interval === "MONTHLY" ? 120 : 10,
    notes: { orgId: organizationId },
  });
  // The plan itself stays as it is until Razorpay confirms the payment.
  await prisma.subscription.update({
    where: { organizationId },
    data: {
      provider: payments.name,
      providerCustomerId: customerId,
      providerSubscriptionId: subscription.id,
      providerPlanId: planId,
      ...(current.planTier === "FREE" ? { status: "INCOMPLETE" } : {}),
    },
  });
  await audit(
    organizationId,
    user.id,
    "billing.checkout_started",
    { ...input, subscriptionId: subscription.id },
    req,
  );
  return {
    subscriptionId: subscription.id,
    keyId: payments.keyId ?? "",
    planTier: input.planTier,
    interval: input.interval,
    amount: priceInPaise(input.planTier, input.interval),
    organizationName: tenant.organization.name,
    email: user.email,
  };
}

/**
 * Checks Checkout's signature. A valid one only says "payment received,
 * processing"; the plan changes when the webhook arrives (AC-BILL-03).
 */
export async function verifyCheckout(
  tenant: Tenant,
  input: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  },
) {
  assertConfigured();
  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { organizationId: tenant.organization.id },
  });
  const valid =
    subscription.providerSubscriptionId === input.razorpay_subscription_id &&
    payments.verifyPayment({
      paymentId: input.razorpay_payment_id,
      subscriptionId: input.razorpay_subscription_id,
      signature: input.razorpay_signature,
    });
  if (!valid) throw new AppError(400, "INVALID_SIGNATURE", "The payment could not be verified");
  return { verified: true, status: subscription.status, planTier: subscription.planTier };
}

// ---------------------------------------------------------------------------
// Changing and cancelling (PRD §11.14.5)
// ---------------------------------------------------------------------------

async function paidSubscription(organizationId: string) {
  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { organizationId } });
  if (subscription.planTier === "FREE" || !subscription.providerSubscriptionId) {
    throw new AppError(409, "NO_PAID_PLAN", "This organization is on the Free plan");
  }
  return subscription as Subscription & { providerSubscriptionId: string };
}

export async function changePlan(
  tenant: Tenant,
  user: User,
  input: { planTier: "FREE" | PaidTier; interval?: BillingInterval | undefined },
  req: Request,
) {
  assertConfigured();
  const organizationId = tenant.organization.id;
  const current = await paidSubscription(organizationId);
  const target = input.planTier;

  // Going down: everything in use must fit the smaller plan (AC-BILL-04).
  if (isDowngrade(current.planTier, target)) {
    const over = overLimits(await planUsage(organizationId), target);
    if (over.length > 0) {
      throw new AppError(
        409,
        "DOWNGRADE_BLOCKED",
        "Remove what is over the smaller plan's limits first",
        over,
      );
    }
  }

  if (target === "FREE") {
    await payments.cancel(current.providerSubscriptionId, true);
    await prisma.subscription.update({
      where: { organizationId },
      data: { cancelAtPeriodEnd: true, scheduledPlanTier: "FREE", scheduledInterval: null },
    });
  } else {
    const interval = input.interval ?? current.interval ?? "MONTHLY";
    const planId = payments.planIdFor(target, interval);
    if (!planId)
      throw new AppError(503, "PLAN_NOT_CONFIGURED", "This plan is not set up in Razorpay yet");
    const downgrade =
      isDowngrade(current.planTier, target) ||
      (current.interval === "YEARLY" && interval === "MONTHLY");
    await payments.changePlan(
      current.providerSubscriptionId,
      planId,
      downgrade ? "cycle_end" : "now",
    );
    await prisma.subscription.update({
      where: { organizationId },
      data: downgrade
        ? { scheduledPlanTier: target, scheduledInterval: interval }
        : {
            planTier: target,
            interval,
            providerPlanId: planId,
            scheduledPlanTier: null,
            scheduledInterval: null,
            cancelAtPeriodEnd: false,
          },
    });
  }
  await audit(
    organizationId,
    user.id,
    "billing.plan_changed",
    { from: current.planTier, to: target },
    req,
  );
  emitEvent({ name: "billing:updated", orgId: organizationId, actorId: user.id, data: {} });
  return billingOverview(tenant);
}

// Razorpay's subscription status -> the webhook event that announces it.
const STATUS_EVENTS: Record<string, string> = {
  authenticated: "subscription.authenticated",
  active: "subscription.activated",
  pending: "subscription.pending",
  halted: "subscription.halted",
  paused: "subscription.paused",
  cancelled: "subscription.cancelled",
  completed: "subscription.completed",
};
const LOCAL_STATUS: Record<string, string> = {
  authenticated: "AUTHENTICATED",
  active: "ACTIVE",
  pending: "PAST_DUE",
  halted: "UNPAID",
  paused: "PAUSED",
};

/**
 * "Check payment status": asks Razorpay itself (with the secret key) and
 * applies what it says, as its webhook would. Needed on localhost, which
 * Razorpay's webhooks cannot reach, and when a webhook is late (PRD R-05).
 */
export async function refreshSubscription(tenant: Tenant, user: User, req: Request) {
  assertConfigured();
  const organizationId = tenant.organization.id;
  const current = await prisma.subscription.findUniqueOrThrow({ where: { organizationId } });
  if (!current.providerSubscriptionId) {
    throw new AppError(409, "NO_SUBSCRIPTION", "There is no Razorpay subscription to check");
  }
  const remote = await payments.fetchSubscription(current.providerSubscriptionId);
  const plan = remote.plan_id ? payments.tierFor(remote.plan_id) : null;
  const ended = remote.status === "cancelled" || remote.status === "completed";
  const unchanged = ended
    ? current.cancelAtPeriodEnd
    : LOCAL_STATUS[remote.status] === current.status && (!plan || plan.tier === current.planTier);
  const eventName = STATUS_EVENTS[remote.status];
  if (eventName && !unchanged) {
    await applyEvent({ event: eventName, payload: { subscription: { entity: remote } } });
    await audit(
      organizationId,
      user.id,
      "billing.status_refreshed",
      { status: remote.status },
      req,
    );
  }
  return billingOverview(tenant);
}

/** Cancels at the end of the paid period; the organization then returns to Free. */
export async function cancelPlan(tenant: Tenant, user: User, req: Request) {
  assertConfigured();
  const organizationId = tenant.organization.id;
  const current = await paidSubscription(organizationId);
  await payments.cancel(current.providerSubscriptionId, true);
  await prisma.subscription.update({
    where: { organizationId },
    data: { cancelAtPeriodEnd: true, scheduledPlanTier: "FREE" },
  });
  await audit(organizationId, user.id, "billing.cancel_requested", { tier: current.planTier }, req);
  emitEvent({ name: "billing:updated", orgId: organizationId, actorId: user.id, data: {} });
  return billingOverview(tenant);
}

// ---------------------------------------------------------------------------
// Webhooks (PRD §11.14.4)
// ---------------------------------------------------------------------------

interface RazorpayEntity {
  id?: string;
  status?: string;
  plan_id?: string;
  current_start?: number | null;
  current_end?: number | null;
  notes?: Record<string, string> | unknown[];
  amount?: number;
  amount_due?: number;
  amount_paid?: number;
  currency?: string;
  method?: string;
  error_description?: string;
  invoice_id?: string;
  subscription_id?: string;
  short_url?: string;
  paid_at?: number | null;
  issued_at?: number | null;
}
interface RazorpayEvent {
  event: string;
  payload: Record<string, { entity: RazorpayEntity } | undefined>;
}

const fromUnix = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000) : null;

/**
 * Checks the signature, stores the event once (a replay answers "already
 * done", AC-BILL-02), then applies it to the subscription.
 */
export async function handleWebhook(rawBody: Buffer, signature: string, eventId: string) {
  if (!payments.verifyWebhook(rawBody, signature)) {
    throw new AppError(400, "INVALID_SIGNATURE", "Invalid webhook signature");
  }
  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8")) as RazorpayEvent;
  } catch {
    throw new AppError(400, "VALIDATION_ERROR", "The webhook body is not JSON");
  }
  let stored;
  try {
    stored = await prisma.webhookEvent.create({
      data: {
        provider: payments.name,
        providerEventId: eventId,
        type: String(event.event).slice(0, 64),
        payload: event as unknown as Prisma.InputJsonValue,
        attempts: 1,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { duplicate: true };
    throw error;
  }
  try {
    await applyEvent(event);
    await prisma.webhookEvent.update({
      where: { id: stored.id },
      data: { processedAt: new Date() },
    });
    return { duplicate: false };
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: stored.id },
      data: { error: error instanceof Error ? error.message.slice(0, 500) : "Failed" },
    });
    logger.error({ err: error, type: event.event }, "Webhook processing failed");
    throw error;
  }
}

async function applyEvent(event: RazorpayEvent) {
  const sub = event.payload["subscription"]?.entity;
  const payment = event.payload["payment"]?.entity;
  const invoice = event.payload["invoice"]?.entity;
  const subscriptionId = sub?.id ?? payment?.subscription_id ?? invoice?.subscription_id;
  if (!subscriptionId) return;
  const current = await prisma.subscription.findUnique({
    where: { providerSubscriptionId: subscriptionId },
  });
  if (!current) {
    logger.warn({ type: event.event }, "Webhook for an unknown subscription");
    return;
  }
  const organizationId = current.organizationId;
  const plan = sub?.plan_id ? payments.tierFor(sub.plan_id) : null;
  const period = {
    ...(sub?.current_start ? { currentPeriodStart: fromUnix(sub.current_start) } : {}),
    ...(sub?.current_end ? { currentPeriodEnd: fromUnix(sub.current_end) } : {}),
  };
  const update = (data: Prisma.SubscriptionUpdateInput) =>
    prisma.subscription.update({ where: { id: current.id }, data });

  switch (event.event) {
    case "subscription.authenticated":
      await update({ status: "AUTHENTICATED" });
      break;
    case "subscription.activated":
    case "subscription.resumed":
      await update({
        status: "ACTIVE",
        ...(plan
          ? { planTier: plan.tier, interval: plan.interval, providerPlanId: sub?.plan_id ?? null }
          : {}),
        ...period,
      });
      await announce(
        organizationId,
        plan ? `Your ${plan.tier} plan is active` : "Your plan is active again",
      );
      break;
    case "subscription.charged":
      await update({
        status: "ACTIVE",
        ...(plan
          ? { planTier: plan.tier, interval: plan.interval, providerPlanId: sub?.plan_id ?? null }
          : {}),
        // A scheduled change takes effect with the first charge of the new plan.
        ...(plan && current.scheduledPlanTier === plan.tier
          ? { scheduledPlanTier: null, scheduledInterval: null }
          : {}),
        ...period,
      });
      if (payment?.id) await recordPayment(organizationId, current.id, payment, "SUCCEEDED");
      break;
    case "subscription.pending":
      await update({ status: "PAST_DUE" });
      await announce(organizationId, "A payment for your plan did not go through");
      break;
    case "subscription.halted":
      await update({ status: "UNPAID" });
      await announce(organizationId, "Your plan is on hold because payments failed");
      break;
    case "subscription.paused":
      await update({ status: "PAUSED" });
      break;
    case "subscription.cancelled":
    case "subscription.completed": {
      const end = fromUnix(sub?.current_end) ?? current.currentPeriodEnd;
      if (end && end > new Date()) {
        // Paid until the end of the period; the daily job switches to Free then.
        await update({
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
          scheduledPlanTier: "FREE",
        });
      } else {
        await update(freePlan());
      }
      await announce(organizationId, "Your paid plan was cancelled");
      break;
    }
    case "payment.failed":
      if (payment?.id) await recordPayment(organizationId, current.id, payment, "FAILED");
      await announce(organizationId, "A payment failed");
      break;
    case "invoice.paid":
      if (invoice?.id) {
        const data = {
          number: invoice.id,
          amountDue: invoice.amount_due ?? invoice.amount ?? 0,
          amountPaid: invoice.amount_paid ?? invoice.amount ?? 0,
          currency: invoice.currency ?? "INR",
          status: "PAID" as const,
          issuedAt: fromUnix(invoice.issued_at),
          paidAt: fromUnix(invoice.paid_at) ?? new Date(),
          hostedUrl: invoice.short_url ?? null,
          pdfUrl: invoice.short_url ?? null,
        };
        await prisma.invoice.upsert({
          where: { providerInvoiceId: invoice.id },
          create: {
            organizationId,
            subscriptionId: current.id,
            provider: payments.name,
            providerInvoiceId: invoice.id,
            ...data,
          },
          update: data,
        });
      }
      break;
    default:
      break;
  }
  emitEvent({ name: "billing:updated", orgId: organizationId, actorId: "system", data: {} });
}

/** What a subscription becomes when it ends: the Free plan (PRD §11.14.5). */
const freePlan = (): Prisma.SubscriptionUpdateInput => ({
  planTier: "FREE",
  status: "CANCELED",
  interval: null,
  cancelAtPeriodEnd: false,
  scheduledPlanTier: null,
  scheduledInterval: null,
  providerSubscriptionId: null,
  providerPlanId: null,
});

async function recordPayment(
  organizationId: string,
  subscriptionId: string,
  payment: RazorpayEntity,
  status: "SUCCEEDED" | "FAILED",
) {
  const data = {
    amount: payment.amount ?? 0,
    currency: payment.currency ?? "INR",
    status,
    method: payment.method ?? null,
    failureReason: status === "FAILED" ? (payment.error_description ?? "Payment failed") : null,
    paidAt: status === "SUCCEEDED" ? new Date() : null,
    rawPayload: payment as unknown as Prisma.InputJsonValue,
  };
  await prisma.payment.upsert({
    where: { providerPaymentId: payment.id as string },
    create: {
      organizationId,
      subscriptionId,
      provider: payments.name,
      providerPaymentId: payment.id as string,
      ...data,
    },
    update: data,
  });
}

/**
 * Daily: subscriptions cancelled at period end become Free once the period is
 * over, and scheduled downgrades take effect (AC-BILL-05).
 */
export async function reconcileSubscriptions(now = new Date()) {
  const due = await prisma.subscription.findMany({
    where: {
      currentPeriodEnd: { lt: now },
      OR: [{ cancelAtPeriodEnd: true }, { scheduledPlanTier: { not: null } }],
    },
  });
  for (const subscription of due) {
    if (subscription.cancelAtPeriodEnd || subscription.scheduledPlanTier === "FREE") {
      await prisma.subscription.update({ where: { id: subscription.id }, data: freePlan() });
    } else if (subscription.scheduledPlanTier) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          planTier: subscription.scheduledPlanTier,
          interval: subscription.scheduledInterval,
          scheduledPlanTier: null,
          scheduledInterval: null,
        },
      });
    }
    await audit(subscription.organizationId, null, "billing.period_ended", {
      to: subscription.cancelAtPeriodEnd ? "FREE" : subscription.scheduledPlanTier,
    });
    emitEvent({
      name: "billing:updated",
      orgId: subscription.organizationId,
      actorId: "system",
      data: {},
    });
  }
  return due.length;
}
