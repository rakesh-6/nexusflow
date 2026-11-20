import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { testPayments } from "../src/lib/payments/razorpay.ts";
import { prisma } from "../src/lib/prisma.ts";
import { reconcileSubscriptions } from "../src/modules/billing/billing.service.ts";
import { createTestClient } from "./helpers/http.ts";
import { orgHelpers } from "./helpers/orgs.ts";

// Billing with the in-memory Razorpay stand-in (PRD §11.14, AC-BILL-01…05).
const client = createTestClient("billing-test.example");
const { app, post, patch } = client;
const { verifiedUser, createOrg, joinedMember } = orgHelpers(client);

const SLOW = { timeout: 300_000 };
const run = Date.now().toString(36);
let eventCounter = 0;
const eventIds: string[] = [];

afterAll(async () => {
  await prisma.webhookEvent.deleteMany({ where: { providerEventId: { in: eventIds } } });
  await client.cleanup();
  await prisma.$disconnect();
});

/** Sends a webhook signed the way Razorpay signs it. */
function webhook(
  event: string,
  payload: object,
  options: { id?: string; badSignature?: boolean } = {},
) {
  const id = options.id ?? `evt_${run}_${++eventCounter}`;
  eventIds.push(id);
  const body = JSON.stringify({ event, payload });
  return request(app)
    .post("/api/v1/billing/webhooks/razorpay")
    .set("content-type", "application/json")
    .set("x-razorpay-event-id", id)
    .set(
      "x-razorpay-signature",
      options.badSignature ? "0".repeat(64) : testPayments.signWebhook(body),
    )
    .send(body);
}

const subscriptionEntity = (id: string, planId: string, endInDays = 30) => {
  const now = Math.floor(Date.now() / 1000);
  return {
    subscription: {
      entity: {
        id,
        plan_id: planId,
        status: "active",
        current_start: now,
        current_end: now + endInDays * 86_400,
      },
    },
  };
};

async function setup() {
  const owner = await verifiedUser();
  const slug = await createOrg(owner.agent);
  const api = `/orgs/${slug}`;
  const subscription = () =>
    prisma.subscription.findFirstOrThrow({ where: { organization: { slug } } });
  return { owner, slug, api, subscription };
}

/** Starts checkout and activates the plan through the webhook, like a real payment. */
async function subscribe(context: Awaited<ReturnType<typeof setup>>, planTier = "PRO") {
  const start = await post(context.owner.agent, `${context.api}/billing/checkout`, {
    planTier,
    interval: "MONTHLY",
  }).expect(201);
  const subscriptionId = start.body.data.subscriptionId as string;
  const planId = planTier === "PRO" ? "plan_pro_m" : "plan_biz_m";
  await webhook("subscription.activated", subscriptionEntity(subscriptionId, planId)).expect(200);
  return subscriptionId;
}

describe("checkout (AC-BILL-01, 03)", SLOW, () => {
  it("upgrades only after the signed webhook, not after the browser's word", async () => {
    const context = await setup();
    const { owner, api, subscription } = context;

    const start = await post(owner.agent, `${api}/billing/checkout`, {
      planTier: "PRO",
      interval: "MONTHLY",
    }).expect(201);
    expect(start.body.data).toMatchObject({
      keyId: "rzp_test_memory",
      amount: 99_900,
      planTier: "PRO",
    });
    const subscriptionId = start.body.data.subscriptionId as string;
    expect((await subscription()).status).toBe("INCOMPLETE");

    // A wrong signature from the browser is refused.
    await post(owner.agent, `${api}/billing/checkout/verify`, {
      razorpay_payment_id: "pay_1",
      razorpay_subscription_id: subscriptionId,
      razorpay_signature: "a".repeat(64),
    }).expect(400);

    // A right one says "processing" but does not change the plan (AC-BILL-03).
    const verified = await post(owner.agent, `${api}/billing/checkout/verify`, {
      razorpay_payment_id: "pay_1",
      razorpay_subscription_id: subscriptionId,
      razorpay_signature: testPayments.signPayment("pay_1", subscriptionId),
    }).expect(200);
    expect(verified.body.data).toMatchObject({ verified: true, planTier: "FREE" });
    expect((await subscription()).planTier).toBe("FREE");

    // The webhook makes it real (AC-BILL-01).
    await webhook(
      "subscription.activated",
      subscriptionEntity(subscriptionId, "plan_pro_m"),
    ).expect(200);
    const after = await subscription();
    expect(after).toMatchObject({ planTier: "PRO", status: "ACTIVE", interval: "MONTHLY" });
    expect(after.currentPeriodEnd).not.toBeNull();

    const overview = await owner.agent.get(`/api/v1${api}/billing`).expect(200);
    expect(overview.body.data.plan).toMatchObject({ tier: "PRO", status: "ACTIVE" });

    const audit = await prisma.activityLog.count({
      where: { organizationId: after.organizationId, category: "BILLING" },
    });
    expect(audit).toBeGreaterThan(0);
  });

  it("lets only the owner see or change billing", async () => {
    const { owner, slug, api } = await setup();
    const member = await joinedMember(owner.agent, slug, "ADMIN");
    await member.agent.get(`/api/v1${api}/billing`).expect(403);
    await post(member.agent, `${api}/billing/checkout`, {
      planTier: "PRO",
      interval: "MONTHLY",
    }).expect(403);
  });
});

describe("check payment status (PRD R-05)", SLOW, () => {
  it("asks Razorpay and switches the plan without a webhook", async () => {
    const { owner, api, subscription } = await setup();
    const start = await post(owner.agent, `${api}/billing/checkout`, {
      planTier: "BUSINESS",
      interval: "YEARLY",
    }).expect(201);
    const id = start.body.data.subscriptionId as string;

    // Razorpay has not charged yet: nothing changes.
    await post(owner.agent, `${api}/billing/subscription/refresh`).expect(200);
    expect(await subscription()).toMatchObject({ planTier: "FREE", status: "INCOMPLETE" });

    const now = Math.floor(Date.now() / 1000);
    testPayments.setSubscription({
      id,
      status: "active",
      plan_id: "plan_biz_y",
      current_start: now,
      current_end: now + 365 * 86_400,
    });
    const after = await post(owner.agent, `${api}/billing/subscription/refresh`).expect(200);
    expect(after.body.data.plan).toMatchObject({
      tier: "BUSINESS",
      status: "ACTIVE",
      interval: "YEARLY",
    });
  });
});

describe("webhooks (AC-BILL-02)", SLOW, () => {
  it("refuses a bad signature, stores nothing, and handles a replay once", async () => {
    const context = await setup();
    const subscriptionId = await subscribe(context);

    const badId = `evt_${run}_bad`;
    await webhook("payment.failed", {}, { id: badId, badSignature: true }).expect(400);
    expect(await prisma.webhookEvent.count({ where: { providerEventId: badId } })).toBe(0);

    const id = `evt_${run}_charged`;
    const charged = {
      ...subscriptionEntity(subscriptionId, "plan_pro_m"),
      payment: { entity: { id: `pay_${run}`, amount: 99_900, currency: "INR", method: "card" } },
    };
    const first = await webhook("subscription.charged", charged, { id }).expect(200);
    expect(first.body.data.duplicate).toBe(false);
    const again = await webhook("subscription.charged", charged, { id }).expect(200);
    expect(again.body.data.duplicate).toBe(true);

    const organizationId = (await context.subscription()).organizationId;
    expect(await prisma.payment.count({ where: { organizationId } })).toBe(1);
  });
});

describe("changing plans (AC-BILL-04, 05)", SLOW, () => {
  it("blocks a downgrade that would be over the smaller plan's limits", async () => {
    const context = await setup();
    const { owner, api } = context;
    await subscribe(context);
    // Free allows 1 workspace; a second one makes the downgrade impossible.
    await post(owner.agent, `${api}/workspaces`, { name: "Second", slug: "second" }).expect(201);

    const blocked = await patch(owner.agent, `${api}/billing/subscription`, {
      planTier: "FREE",
    }).expect(409);
    expect(blocked.body.error.code).toBe("DOWNGRADE_BLOCKED");
    expect(blocked.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ limit: "maxWorkspaces", current: 2, max: 1 }),
      ]),
    );
    expect((await context.subscription()).planTier).toBe("PRO");
  });

  it("cancels at the period end and returns to Free when the period is over", async () => {
    const context = await setup();
    const { owner, api } = context;
    const subscriptionId = await subscribe(context);

    await post(owner.agent, `${api}/billing/subscription/cancel`).expect(200);
    expect(testPayments.calls).toContainEqual({ action: "cancel", args: [subscriptionId, true] });
    // Still paid until the period ends.
    expect(await context.subscription()).toMatchObject({
      planTier: "PRO",
      cancelAtPeriodEnd: true,
    });

    const end = (await context.subscription()).currentPeriodEnd as Date;
    await reconcileSubscriptions(new Date(end.getTime() + 1000));
    expect(await context.subscription()).toMatchObject({
      planTier: "FREE",
      cancelAtPeriodEnd: false,
      providerSubscriptionId: null,
    });
  });
});
