import { z } from "zod";
import { PLAN_LIMITS, PLAN_PRICES, type PlanLimits, type PlanTier } from "./plans.ts";

// Subscriptions and billing in Razorpay test mode (PRD §11.14), shared by the
// API and the web app.

export const PAID_TIERS = ["PRO", "BUSINESS"] as const;
export type PaidTier = (typeof PAID_TIERS)[number];
export const BILLING_INTERVALS = ["MONTHLY", "YEARLY"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

const TIER_RANK: Record<PlanTier, number> = { FREE: 0, PRO: 1, BUSINESS: 2, ENTERPRISE: 3 };
export const isDowngrade = (from: PlanTier, to: PlanTier) => TIER_RANK[to] < TIER_RANK[from];

/** The price in paise (Razorpay counts the smallest unit): a year costs 10 months (PRD A-1). */
export function priceInPaise(tier: PaidTier, interval: BillingInterval) {
  const monthly = PLAN_PRICES[tier] ?? 0;
  return (interval === "YEARLY" ? monthly * 10 : monthly) * 100;
}

export const checkoutSchema = z.object({
  planTier: z.enum(PAID_TIERS),
  interval: z.enum(BILLING_INTERVALS),
});

/** What Razorpay Checkout hands the browser after a payment (PRD §11.14.3 step 3). */
export const verifyCheckoutSchema = z.object({
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_subscription_id: z.string().min(1).max(64),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/, "Invalid signature"),
});

export const changePlanSchema = z
  .object({
    planTier: z.enum(["FREE", ...PAID_TIERS]),
    interval: z.enum(BILLING_INTERVALS).optional(),
  })
  .refine((value) => value.planTier === "FREE" || !!value.interval, {
    message: "Choose monthly or yearly",
    path: ["interval"],
  });

/** GSTIN: 2 digits (state), PAN (5 letters, 4 digits, 1 letter), entity number, "Z", check character. */
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const billingProfileSchema = z.object({
  legalName: z.string().trim().min(2).max(120),
  email: z.email(),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(12),
  country: z.string().trim().length(2).toUpperCase().default("IN"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(GSTIN, "Use a 15-character GSTIN like 27AAPFU0939F1ZV")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type BillingProfileInput = z.input<typeof billingProfileSchema>;

/** What an organization uses now, compared with plan limits before a downgrade. */
export interface PlanUsage {
  workspaces: number;
  members: number;
  guests: number;
  /** The most active projects in any one workspace. */
  activeProjectsPerWorkspace: number;
  storageBytes: number;
}

export interface OverLimit {
  limit: keyof PlanLimits;
  current: number;
  max: number;
}

/** Everything that would be over the target plan's limits (PRD §11.14.5, AC-BILL-04). */
export function overLimits(usage: PlanUsage, tier: PlanTier): OverLimit[] {
  const limits = PLAN_LIMITS[tier];
  const checks: [keyof PlanLimits, number][] = [
    ["maxWorkspaces", usage.workspaces],
    ["maxMembers", usage.members],
    ["maxGuests", usage.guests],
    ["maxActiveProjectsPerWorkspace", usage.activeProjectsPerWorkspace],
    ["maxStorageBytes", usage.storageBytes],
  ];
  return checks.flatMap(([limit, current]) => {
    const max = limits[limit];
    return max !== null && current > max ? [{ limit, current, max }] : [];
  });
}

// ---------------------------------------------------------------------------
// What the API answers
// ---------------------------------------------------------------------------

export interface InvoiceSummary {
  id: string;
  number: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  issuedAt: string | null;
  paidAt: string | null;
  url: string | null;
}

export interface PaymentSummary {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface BillingOverview {
  /** False until the Razorpay test keys are set on the server. */
  configured: boolean;
  plan: {
    tier: PlanTier;
    status: string;
    interval: BillingInterval | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    scheduledPlanTier: PlanTier | null;
  };
  usage: PlanUsage;
  invoices: InvoiceSummary[];
  payments: PaymentSummary[];
  profile: (Omit<BillingProfileInput, "gstin"> & { gstin: string | null }) | null;
}

/** What the browser needs to open Razorpay Checkout. */
export interface CheckoutStart {
  subscriptionId: string;
  keyId: string;
  planTier: PaidTier;
  interval: BillingInterval;
  amount: number;
  organizationName: string;
  email: string;
}
