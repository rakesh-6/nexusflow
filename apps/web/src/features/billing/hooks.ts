import type {
  BillingInterval,
  BillingOverview,
  BillingProfileInput,
  CheckoutStart,
  PaidTier,
  PlanTier,
} from "@nexusflow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost, apiPut } from "../../lib/api";

// Billing in Razorpay test mode (PRD §11.14). Cached under ["org", slug, "billing"];
// the "billing:updated" live event refreshes it when Razorpay's webhook arrives.

const billingPath = (orgSlug: string) => `/api/v1/orgs/${encodeURIComponent(orgSlug)}/billing`;
export const billingKey = (orgSlug: string) => ["org", orgSlug, "billing"] as const;

export function useBilling(orgSlug: string) {
  return useQuery({
    queryKey: billingKey(orgSlug),
    queryFn: () => apiGet<BillingOverview>(billingPath(orgSlug)),
  });
}

/** A plan change also changes the limits in the workspace context, so refresh all of it. */
function useRefreshOrg(orgSlug: string) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ["org", orgSlug] });
}

export function useStartCheckout(orgSlug: string) {
  return useMutation({
    mutationFn: (input: { planTier: PaidTier; interval: BillingInterval }) =>
      apiPost<CheckoutStart>(`${billingPath(orgSlug)}/checkout`, input),
  });
}

export function useVerifyCheckout(orgSlug: string) {
  const refresh = useRefreshOrg(orgSlug);
  return useMutation({
    mutationFn: (input: RazorpayResult) =>
      apiPost<{ verified: boolean }>(`${billingPath(orgSlug)}/checkout/verify`, input),
    onSettled: refresh,
  });
}

export function useChangePlan(orgSlug: string) {
  const refresh = useRefreshOrg(orgSlug);
  return useMutation({
    mutationFn: (input: { planTier: PlanTier; interval?: BillingInterval }) =>
      apiPatch<BillingOverview>(`${billingPath(orgSlug)}/subscription`, input),
    onSuccess: refresh,
  });
}

export function useCancelPlan(orgSlug: string) {
  const refresh = useRefreshOrg(orgSlug);
  return useMutation({
    mutationFn: () => apiPost<BillingOverview>(`${billingPath(orgSlug)}/subscription/cancel`),
    onSuccess: refresh,
  });
}

/** Asks the server to check with Razorpay (localhost never gets Razorpay's webhooks). */
export function useRefreshBilling(orgSlug: string) {
  const refresh = useRefreshOrg(orgSlug);
  return useMutation({
    mutationFn: () => apiPost<BillingOverview>(`${billingPath(orgSlug)}/subscription/refresh`),
    onSuccess: refresh,
  });
}

export function useSaveBillingProfile(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BillingProfileInput) =>
      apiPut<BillingOverview>(`${billingPath(orgSlug)}/profile`, input),
    onSuccess: (overview) => queryClient.setQueryData(billingKey(orgSlug), overview),
  });
}

// --- Razorpay Checkout --------------------------------------------------------------

/** What Checkout hands back after a successful payment. */
export interface RazorpayResult {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckout {
  open(): void;
  on(
    event: "payment.failed",
    handler: (response: { error?: { description?: string } }) => void,
  ): void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayCheckout;

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
let scriptLoading: Promise<RazorpayConstructor> | null = null;

/** Loads Razorpay's Checkout script the first time someone pays (no npm library). */
function loadCheckout(): Promise<RazorpayConstructor> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  scriptLoading ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => {
      const loaded = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
      if (loaded) resolve(loaded);
      else reject(new Error("Razorpay Checkout did not load"));
    };
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error("Razorpay Checkout could not be loaded. Check your connection."));
    };
    document.head.append(script);
  });
  return scriptLoading;
}

/**
 * Opens Razorpay's payment window. Resolves with its signed result, or null
 * when the person closes the window without paying.
 */
export async function openCheckout(start: CheckoutStart): Promise<RazorpayResult | null> {
  const Razorpay = await loadCheckout();
  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({
      key: start.keyId,
      subscription_id: start.subscriptionId,
      name: "NexusFlow",
      description: `${start.planTier} plan, ${start.interval.toLowerCase()} (test mode)`,
      prefill: { email: start.email },
      notes: { organization: start.organizationName },
      handler: (result: RazorpayResult) => resolve(result),
      modal: { ondismiss: () => resolve(null) },
    });
    checkout.on("payment.failed", (response) =>
      reject(new Error(response.error?.description ?? "The payment failed")),
    );
    checkout.open();
  });
}
