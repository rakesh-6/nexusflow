# Replay a Razorpay webhook

The plan changes only when Razorpay's signed webhook arrives (PRD §11.14.4).

1. **Quickest**: the owner opens Settings → Billing → **Check payment status**.
   The server asks Razorpay directly and applies its answer.
2. Otherwise, in the Razorpay dashboard (Test Mode) → Account & Settings →
   Webhooks → the NexusFlow webhook → find the event → **Resend**.
   The URL must be `https://<app>/api/v1/billing/webhooks/razorpay` and the
   secret must equal `RAZORPAY_WEBHOOK_SECRET` on Render.
3. A resent event with the same id is answered `duplicate: true` and applied
   only once, so resending is always safe.
4. Still wrong? Render logs: search `Webhook processing failed`; the stored
   event (Neon: table `WebhookEvent`) has the error in its `error` column.
