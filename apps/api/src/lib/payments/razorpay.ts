import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingInterval, PaidTier } from "@nexusflow/shared";
import { env } from "../../config/env.ts";

// Payments through Razorpay in test mode (PRD §11.14, §22). No Razorpay
// library: its REST API is plain HTTPS with the key id and secret, and its
// signatures are HMAC-SHA256. Tests use the in-memory provider below.

export interface ProviderSubscription {
  id: string;
  /** created, authenticated, active, pending, halted, paused, cancelled, completed */
  status: string;
  plan_id?: string;
  current_start?: number | null;
  current_end?: number | null;
}

export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  readonly keyId: string | null;
  /** The Razorpay plan id for a tier and interval, or null when it is not set up. */
  planIdFor(tier: PaidTier, interval: BillingInterval): string | null;
  /** The tier and interval of a Razorpay plan id. */
  tierFor(planId: string): { tier: PaidTier; interval: BillingInterval } | null;
  createCustomer(input: { name: string; email: string }): Promise<string>;
  createSubscription(input: {
    planId: string;
    customerId: string;
    totalCount: number;
    notes: Record<string, string>;
  }): Promise<ProviderSubscription>;
  changePlan(subscriptionId: string, planId: string, when: "now" | "cycle_end"): Promise<void>;
  cancel(subscriptionId: string, atCycleEnd: boolean): Promise<void>;
  /** The subscription as Razorpay sees it now (for "Check payment status"). */
  fetchSubscription(subscriptionId: string): Promise<ProviderSubscription>;
  /** Checkout's signature: HMAC-SHA256("payment_id|subscription_id", key secret). */
  verifyPayment(input: { paymentId: string; subscriptionId: string; signature: string }): boolean;
  /** A webhook's X-Razorpay-Signature: HMAC-SHA256(raw body, webhook secret). */
  verifyWebhook(rawBody: Buffer, signature: string): boolean;
}

const hmac = (secret: string, data: string | Buffer) =>
  createHmac("sha256", secret).update(data).digest("hex");

/** Compares two signatures in constant time, so timing cannot reveal the right one. */
function sameSignature(expected: string, given: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

function planTable(): Record<string, { tier: PaidTier; interval: BillingInterval }> {
  const table: Record<string, { tier: PaidTier; interval: BillingInterval }> = {};
  const add = (id: string | undefined, tier: PaidTier, interval: BillingInterval) => {
    if (id) table[id] = { tier, interval };
  };
  add(env.RAZORPAY_PLAN_PRO_MONTHLY, "PRO", "MONTHLY");
  add(env.RAZORPAY_PLAN_PRO_YEARLY, "PRO", "YEARLY");
  add(env.RAZORPAY_PLAN_BUSINESS_MONTHLY, "BUSINESS", "MONTHLY");
  add(env.RAZORPAY_PLAN_BUSINESS_YEARLY, "BUSINESS", "YEARLY");
  return table;
}

function razorpay(): PaymentProvider {
  const keyId = env.RAZORPAY_KEY_ID ?? "";
  const keySecret = env.RAZORPAY_KEY_SECRET ?? "";
  const plans = planTable();
  const call = async <T>(method: string, path: string, body?: object): Promise<T> => {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as {
        error?: { description?: string };
      } | null;
      throw new Error(
        `Razorpay answered ${response.status}: ${detail?.error?.description ?? "error"}`,
      );
    }
    return (await response.json()) as T;
  };

  return {
    name: "razorpay",
    configured: Boolean(keyId && keySecret && env.RAZORPAY_WEBHOOK_SECRET),
    keyId: keyId || null,
    planIdFor: (tier, interval) =>
      Object.entries(plans).find(
        ([, plan]) => plan.tier === tier && plan.interval === interval,
      )?.[0] ?? null,
    tierFor: (planId) => plans[planId] ?? null,
    async createCustomer({ name, email }) {
      // fail_existing "0": reuse the customer if this email already has one.
      const customer = await call<{ id: string }>("POST", "/customers", {
        name,
        email,
        fail_existing: "0",
      });
      return customer.id;
    },
    async createSubscription({ planId, customerId, totalCount, notes }) {
      return call<ProviderSubscription>("POST", "/subscriptions", {
        plan_id: planId,
        customer_id: customerId,
        total_count: totalCount,
        quantity: 1,
        customer_notify: 1,
        notes,
      });
    },
    async changePlan(subscriptionId, planId, when) {
      await call("PATCH", `/subscriptions/${subscriptionId}`, {
        plan_id: planId,
        schedule_change_at: when,
        customer_notify: 1,
      });
    },
    async cancel(subscriptionId, atCycleEnd) {
      await call("POST", `/subscriptions/${subscriptionId}/cancel`, {
        cancel_at_cycle_end: atCycleEnd ? 1 : 0,
      });
    },
    fetchSubscription: (subscriptionId) =>
      call<ProviderSubscription>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`),
    verifyPayment: ({ paymentId, subscriptionId, signature }) =>
      sameSignature(hmac(keySecret, `${paymentId}|${subscriptionId}`), signature),
    verifyWebhook: (rawBody, signature) =>
      sameSignature(hmac(env.RAZORPAY_WEBHOOK_SECRET ?? "", rawBody), signature),
  };
}

/** For tests: fixed secrets, made-up ids, and a record of every call. */
export function memoryPayments() {
  const keySecret = "test_key_secret";
  const webhookSecret = "test_webhook_secret";
  const plans: Record<string, { tier: PaidTier; interval: BillingInterval }> = {
    plan_pro_m: { tier: "PRO", interval: "MONTHLY" },
    plan_pro_y: { tier: "PRO", interval: "YEARLY" },
    plan_biz_m: { tier: "BUSINESS", interval: "MONTHLY" },
    plan_biz_y: { tier: "BUSINESS", interval: "YEARLY" },
  };
  const calls: { action: string; args: unknown[] }[] = [];
  const subscriptions = new Map<string, ProviderSubscription>();
  let counter = 0;
  const provider: PaymentProvider & {
    calls: typeof calls;
    /** Pretends Razorpay changed a subscription (what fetchSubscription then returns). */
    setSubscription(subscription: ProviderSubscription): void;
    signPayment(paymentId: string, subscriptionId: string): string;
    signWebhook(body: string): string;
  } = {
    name: "memory",
    configured: true,
    keyId: "rzp_test_memory",
    calls,
    planIdFor: (tier, interval) =>
      Object.entries(plans).find(
        ([, plan]) => plan.tier === tier && plan.interval === interval,
      )?.[0] ?? null,
    tierFor: (planId) => plans[planId] ?? null,
    async createCustomer(input) {
      calls.push({ action: "createCustomer", args: [input] });
      return `cust_test_${++counter}`;
    },
    async createSubscription(input) {
      calls.push({ action: "createSubscription", args: [input] });
      const subscription = {
        id: `sub_test_${Date.now().toString(36)}_${++counter}`,
        status: "created",
        plan_id: input.planId,
      };
      subscriptions.set(subscription.id, subscription);
      return subscription;
    },
    async fetchSubscription(subscriptionId) {
      const subscription = subscriptions.get(subscriptionId);
      if (!subscription) throw new Error("Razorpay answered 400: no such subscription");
      return subscription;
    },
    setSubscription: (subscription) => void subscriptions.set(subscription.id, subscription),
    async changePlan(...args) {
      calls.push({ action: "changePlan", args });
    },
    async cancel(...args) {
      calls.push({ action: "cancel", args });
    },
    verifyPayment: ({ paymentId, subscriptionId, signature }) =>
      sameSignature(hmac(keySecret, `${paymentId}|${subscriptionId}`), signature),
    verifyWebhook: (rawBody, signature) => sameSignature(hmac(webhookSecret, rawBody), signature),
    signPayment: (paymentId, subscriptionId) => hmac(keySecret, `${paymentId}|${subscriptionId}`),
    signWebhook: (body) => hmac(webhookSecret, body),
  };
  return provider;
}

export const testPayments = memoryPayments();

/** The payment provider the app uses: the in-memory one in tests, Razorpay otherwise. */
export const payments: PaymentProvider = env.NODE_ENV === "test" ? testPayments : razorpay();
