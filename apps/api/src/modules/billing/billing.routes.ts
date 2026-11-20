import {
  billingProfileSchema,
  changePlanSchema,
  checkoutSchema,
  verifyCheckoutSchema,
} from "@nexusflow/shared";
import express, { Router } from "express";
import { requireOrgPermission } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { actorAndTenant } from "../organizations/requestContext.ts";
import {
  billingOverview,
  cancelPlan,
  changePlan,
  handleWebhook,
  refreshSubscription,
  saveBillingProfile,
  startCheckout,
  verifyCheckout,
} from "./billing.service.ts";

// Billing for the organization owner (PRD §18.7). Mounted under /orgs/:orgSlug.
export const billingRouter = Router({ mergeParams: true });
billingRouter.use("/billing", requireOrgPermission("billing:manage"));

billingRouter.get("/billing", async (req, res) => {
  sendSuccess(res, await billingOverview(actorAndTenant(req).tenant));
});

billingRouter.put("/billing/profile", async (req, res) => {
  const { body } = validateRequest(req, { body: billingProfileSchema });
  const { user, tenant } = actorAndTenant(req);
  sendSuccess(res, await saveBillingProfile(tenant, user, body, req));
});

billingRouter.post("/billing/checkout", async (req, res) => {
  const { body } = validateRequest(req, { body: checkoutSchema });
  const { user, tenant } = actorAndTenant(req);
  sendSuccess(res, await startCheckout(tenant, user, body, req), 201);
});

billingRouter.post("/billing/checkout/verify", async (req, res) => {
  const { body } = validateRequest(req, { body: verifyCheckoutSchema });
  sendSuccess(res, await verifyCheckout(actorAndTenant(req).tenant, body));
});

billingRouter.patch("/billing/subscription", async (req, res) => {
  const { body } = validateRequest(req, { body: changePlanSchema });
  const { user, tenant } = actorAndTenant(req);
  sendSuccess(res, await changePlan(tenant, user, body, req));
});

billingRouter.post("/billing/subscription/cancel", async (req, res) => {
  const { user, tenant } = actorAndTenant(req);
  sendSuccess(res, await cancelPlan(tenant, user, req));
});

billingRouter.post("/billing/subscription/refresh", async (req, res) => {
  const { user, tenant } = actorAndTenant(req);
  sendSuccess(res, await refreshSubscription(tenant, user, req));
});

/**
 * POST /api/v1/billing/webhooks/razorpay — called by Razorpay, not by a
 * browser. It needs the body exactly as sent to check the signature, so it is
 * mounted before the JSON reader and the browser-only CSRF check (PRD §11.14.4).
 */
export const billingWebhookRouter = Router();
billingWebhookRouter.post(
  "/razorpay",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res) => {
    const signature = req.get("x-razorpay-signature");
    const eventId = req.get("x-razorpay-event-id");
    if (!signature || !eventId || !Buffer.isBuffer(req.body)) {
      throw new AppError(400, "INVALID_SIGNATURE", "Missing webhook signature or event id");
    }
    const result = await handleWebhook(req.body, signature, eventId.slice(0, 128));
    sendSuccess(res, { received: true, duplicate: result.duplicate });
  },
);
