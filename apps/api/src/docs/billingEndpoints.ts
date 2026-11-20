import {
  BILLING_INTERVALS,
  billingProfileSchema,
  changePlanSchema,
  checkoutSchema,
  PAID_TIERS,
  PLAN_TIERS,
  verifyCheckoutSchema,
} from "@nexusflow/shared";
import { z } from "zod";
import { ok, type Endpoint } from "./helpers.ts";

// API documentation for Phase 9: billing in Razorpay test mode.

const Overview = z.object({
  configured: z.boolean(),
  plan: z.object({
    tier: z.enum(PLAN_TIERS),
    status: z.string(),
    interval: z.enum(BILLING_INTERVALS).nullable(),
    currentPeriodEnd: z.iso.datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    scheduledPlanTier: z.enum(PLAN_TIERS).nullable(),
  }),
  usage: z.object({
    workspaces: z.number().int(),
    members: z.number().int(),
    guests: z.number().int(),
    activeProjectsPerWorkspace: z.number().int(),
    storageBytes: z.number().int(),
  }),
  invoices: z.array(
    z.object({
      id: z.uuid(),
      number: z.string().nullable(),
      amountDue: z.number().int(),
      amountPaid: z.number().int(),
      currency: z.string(),
      status: z.string(),
      issuedAt: z.iso.datetime().nullable(),
      paidAt: z.iso.datetime().nullable(),
      url: z.url().nullable(),
    }),
  ),
  payments: z.array(
    z.object({
      id: z.uuid(),
      amount: z.number().int(),
      currency: z.string(),
      status: z.string(),
      method: z.string().nullable(),
      failureReason: z.string().nullable(),
      paidAt: z.iso.datetime().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
  profile: billingProfileSchema.extend({ gstin: z.string().nullable() }).nullable(),
});

const O = "/orgs/{orgSlug}/billing";
const OWNER_ONLY = "Only the owner manages billing (FORBIDDEN)";
const NOT_SET_UP =
  "Razorpay test keys or plan ids are missing on this server (BILLING_NOT_CONFIGURED, PLAN_NOT_CONFIGURED)";

const endpoint = (
  method: Endpoint["method"],
  path: string,
  summary: string,
  responses: Endpoint["responses"],
  extra: Partial<Endpoint> = {},
): Endpoint => ({ method, path, tag: "Billing", summary, auth: true, responses, ...extra });

export const BILLING_ENDPOINTS: Endpoint[] = [
  endpoint("get", O, "Plan, usage, invoices, payments and billing address (owner)", {
    "200": ["The billing overview", ok(Overview)],
    "403": [OWNER_ONLY],
  }),
  endpoint(
    "post",
    `${O}/checkout`,
    "Starts a Razorpay subscription; the browser then opens Checkout with it",
    {
      "201": [
        "What Razorpay Checkout needs",
        ok(
          z.object({
            subscriptionId: z.string(),
            keyId: z.string(),
            planTier: z.enum(PAID_TIERS),
            interval: z.enum(BILLING_INTERVALS),
            amount: z.number().int(),
            organizationName: z.string(),
            email: z.email(),
          }),
        ),
      ],
      "403": [OWNER_ONLY],
      "409": ["Already on a paid plan: change it instead (ALREADY_SUBSCRIBED)"],
      "503": [NOT_SET_UP],
    },
    { body: checkoutSchema },
  ),
  endpoint(
    "post",
    `${O}/checkout/verify`,
    "Checks Checkout's signature. The plan changes only when the webhook arrives",
    {
      "200": [
        "Payment received, processing",
        ok(
          z.object({ verified: z.literal(true), status: z.string(), planTier: z.enum(PLAN_TIERS) }),
        ),
      ],
      "400": ["The signature does not match (INVALID_SIGNATURE)"],
      "403": [OWNER_ONLY],
      "503": [NOT_SET_UP],
    },
    { body: verifyCheckoutSchema },
  ),
  endpoint(
    "patch",
    `${O}/subscription`,
    "Upgrades now, or schedules a downgrade for the end of the period",
    {
      "200": ["The billing overview after the change", ok(Overview)],
      "403": [OWNER_ONLY],
      "409": [
        "Over the smaller plan's limits (DOWNGRADE_BLOCKED; details list each limit), or on Free (NO_PAID_PLAN)",
      ],
      "503": [NOT_SET_UP],
    },
    { body: changePlanSchema },
  ),
  endpoint(
    "post",
    `${O}/subscription/cancel`,
    "Cancels at the end of the paid period; then the organization is on Free",
    {
      "200": ["The billing overview", ok(Overview)],
      "403": [OWNER_ONLY],
      "409": ["Already on Free (NO_PAID_PLAN)"],
      "503": [NOT_SET_UP],
    },
    { optionalBody: true },
  ),
  endpoint(
    "post",
    `${O}/subscription/refresh`,
    "Check payment status: asks Razorpay for the subscription and applies it, like its webhook would",
    {
      "200": ["The billing overview", ok(Overview)],
      "403": [OWNER_ONLY],
      "409": ["No Razorpay subscription yet (NO_SUBSCRIPTION)"],
      "503": [NOT_SET_UP],
    },
    { optionalBody: true },
  ),
  endpoint(
    "put",
    `${O}/profile`,
    "Saves the billing address shown on invoices (GSTIN optional)",
    {
      "200": ["The billing overview", ok(Overview)],
      "400": ["Invalid address or GSTIN"],
      "403": [OWNER_ONLY],
    },
    { body: billingProfileSchema },
  ),
  {
    method: "post",
    path: "/billing/webhooks/razorpay",
    tag: "Billing",
    summary:
      "Razorpay's webhook (server to server). Needs X-Razorpay-Signature and X-Razorpay-Event-Id; a repeated event id is answered once",
    auth: false,
    responses: {
      "200": ["Received", ok(z.object({ received: z.literal(true), duplicate: z.boolean() }))],
      "400": ["Missing or wrong signature (INVALID_SIGNATURE)"],
    },
  },
];
