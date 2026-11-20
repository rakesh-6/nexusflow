import { zodResolver } from "@hookform/resolvers/zod";
import {
  billingProfileSchema,
  PLAN_PRICES,
  type BillingInterval,
  type BillingOverview,
  type OverLimit,
  type PaidTier,
  type PlanTier,
} from "@nexusflow/shared";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormField, showServerErrors } from "../../components/common/FormField";
import { SettingsPage, SettingsSection } from "../../components/common/SettingsSection";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import type { WorkspaceContext } from "../../hooks/useWorkspace";
import { ApiError, errorMessage } from "../../lib/api";
import { cn } from "../../lib/utils";
import { formatBytes, formatDate } from "../organizations/labels";
import {
  openCheckout,
  useBilling,
  useCancelPlan,
  useChangePlan,
  useRefreshBilling,
  useSaveBillingProfile,
  useStartCheckout,
  useVerifyCheckout,
} from "./hooks";

// Settings › Billing (PRD §11.14, §23.2): plan, checkout in Razorpay test mode,
// invoices, payments and the billing address. Only the owner sees it.

const TIERS: { tier: PlanTier; blurb: string }[] = [
  { tier: "FREE", blurb: "1 workspace, 5 members, 7 days of analytics" },
  { tier: "PRO", blurb: "5 workspaces, 25 members, file uploads up to 25 MB" },
  { tier: "BUSINESS", blurb: "20 workspaces, 100 members, full history" },
];

const LIMIT_LABELS: Record<string, string> = {
  maxWorkspaces: "Workspaces",
  maxMembers: "Members",
  maxGuests: "Guests",
  maxActiveProjectsPerWorkspace: "Active projects in one workspace",
  maxStorageBytes: "File storage",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INCOMPLETE: "Waiting for payment",
  AUTHENTICATED: "Payment authorised",
  PAST_DUE: "Payment overdue",
  UNPAID: "On hold",
  PAUSED: "Paused",
  CANCELED: "Cancelled",
};

const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

function priceLabel(tier: PlanTier, interval: BillingInterval) {
  const monthly = PLAN_PRICES[tier] ?? 0;
  if (monthly === 0) return "Free";
  return interval === "YEARLY"
    ? `${rupees(monthly * 1000)} / year`
    : `${rupees(monthly * 100)} / month`;
}

export function BillingSettings({ context }: { context: WorkspaceContext }) {
  const orgSlug = context.organization.slug;
  const { data: billing, isPending, isError } = useBilling(orgSlug);

  return (
    <SettingsPage
      title="Billing"
      description="Your plan, payments and invoices. Payments run in Razorpay test mode: no real money moves."
    >
      {isError && <Alert variant="error">Billing could not be loaded.</Alert>}
      {isPending || !billing ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <>
          {!billing.configured && (
            <Alert variant="info">
              Payments are not set up on this server yet. Add the free Razorpay test-mode keys to
              the server settings to try upgrading.
            </Alert>
          )}
          <PlanSection orgSlug={orgSlug} billing={billing} />
          <HistorySection billing={billing} />
          <ProfileSection orgSlug={orgSlug} billing={billing} />
        </>
      )}
    </SettingsPage>
  );
}

// --- The plan ----------------------------------------------------------------------

function PlanSection({ orgSlug, billing }: { orgSlug: string; billing: BillingOverview }) {
  const { plan } = billing;
  const [interval, setBillingInterval] = useState<BillingInterval>(plan.interval ?? "MONTHLY");
  const [message, setMessage] = useState<{
    kind: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [blocked, setBlocked] = useState<OverLimit[]>([]);
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const start = useStartCheckout(orgSlug);
  const verify = useVerifyCheckout(orgSlug);
  const change = useChangePlan(orgSlug);
  const cancel = useCancelPlan(orgSlug);
  const check = useRefreshBilling(orgSlug);
  // A checkout was started but Razorpay has not confirmed it (yet).
  const waiting = plan.status === "INCOMPLETE" || plan.status === "AUTHENTICATED";
  const onPaidPlan = plan.tier !== "FREE" && plan.status !== "CANCELED";

  async function subscribe(tier: PaidTier) {
    const started = await start.mutateAsync({ planTier: tier, interval });
    const result = await openCheckout(started);
    if (!result) {
      setMessage({ kind: "info", text: "Checkout closed. Nothing was charged." });
      return;
    }
    await verify.mutateAsync(result);
    // The plan switches when Razorpay confirms it: by webhook, or by asking it now.
    const after = await check.mutateAsync().catch(() => null);
    setMessage(
      after?.plan.tier === tier && after.plan.status === "ACTIVE"
        ? { kind: "success", text: `Payment received. You are on ${tier} now.` }
        : {
            kind: "success",
            text: "Payment received. Click “Check payment status” in a few seconds.",
          },
    );
  }

  async function checkStatus() {
    setMessage(null);
    try {
      const after = await check.mutateAsync();
      setMessage({
        kind: "info",
        text: `Razorpay says: ${STATUS_LABELS[after.plan.status] ?? after.plan.status} (${after.plan.tier}).`,
      });
    } catch (error) {
      setMessage({ kind: "error", text: errorMessage(error) });
    }
  }

  async function choose(tier: PlanTier) {
    setMessage(null);
    setBlocked([]);
    setBusyTier(tier);
    try {
      if (onPaidPlan) {
        await change.mutateAsync(
          tier === "FREE" ? { planTier: tier } : { planTier: tier, interval },
        );
        setMessage({
          kind: "success",
          text:
            tier === "FREE"
              ? "Your plan ends at the end of this billing period."
              : "Plan change saved.",
        });
      } else if (tier !== "FREE") {
        await subscribe(tier as PaidTier);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "DOWNGRADE_BLOCKED") {
        setBlocked(error.details as unknown as OverLimit[]);
      } else {
        setMessage({
          kind: "error",
          text:
            error instanceof Error && !(error instanceof ApiError)
              ? error.message
              : errorMessage(error),
        });
      }
    } finally {
      setBusyTier(null);
    }
  }

  async function cancelPlan() {
    if (
      !window.confirm(
        "Cancel your paid plan? It stays active until the end of this billing period.",
      )
    )
      return;
    setMessage(null);
    try {
      await cancel.mutateAsync();
      setMessage({ kind: "success", text: "Cancelled. You return to Free when this period ends." });
    } catch (error) {
      setMessage({ kind: "error", text: errorMessage(error) });
    }
  }

  return (
    <SettingsSection
      title="Plan"
      description="Upgrades start now; downgrades wait until the period ends."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-lg font-semibold">{plan.tier}</span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium">
            {STATUS_LABELS[plan.status] ?? plan.status}
          </span>
          {plan.currentPeriodEnd && (
            <span className="text-muted-foreground">
              {plan.cancelAtPeriodEnd ? "Ends" : "Renews"} on {formatDate(plan.currentPeriodEnd)}
            </span>
          )}
          {plan.scheduledPlanTier && plan.scheduledPlanTier !== plan.tier && (
            <span className="text-muted-foreground">
              Changes to {plan.scheduledPlanTier} after that
            </span>
          )}
        </div>

        {message && <Alert variant={message.kind}>{message.text}</Alert>}
        {blocked.length > 0 && (
          <Alert variant="error">
            <p className="font-medium">Remove these first to fit the smaller plan:</p>
            <ul className="mt-1 list-disc pl-5">
              {blocked.map((item) => (
                <li key={item.limit}>
                  {LIMIT_LABELS[item.limit] ?? item.limit}:{" "}
                  {item.limit === "maxStorageBytes"
                    ? `${formatBytes(item.current)} used, ${formatBytes(item.max)} allowed`
                    : `${item.current} used, ${item.max} allowed`}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        <div
          role="radiogroup"
          aria-label="Billing period"
          className="inline-flex rounded-control border p-0.5"
        >
          {(["MONTHLY", "YEARLY"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={interval === value}
              onClick={() => setBillingInterval(value)}
              className={cn(
                "rounded-control px-3 py-1 text-sm",
                interval === value ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {value === "MONTHLY" ? "Monthly" : "Yearly (2 months free)"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {TIERS.map(({ tier, blurb }) => {
            const current = tier === plan.tier && (tier === "FREE" || plan.interval === interval);
            return (
              <div
                key={tier}
                className={cn("flex flex-col rounded-card border p-4", current && "border-primary")}
              >
                <p className="font-semibold">{tier}</p>
                <p className="mt-0.5 text-sm tabular-nums">{priceLabel(tier, interval)}</p>
                <p className="mt-2 flex-1 text-xs text-muted-foreground">{blurb}</p>
                <Button
                  className="mt-3"
                  size="sm"
                  variant={current ? "outline" : "primary"}
                  disabled={
                    current ||
                    busyTier !== null ||
                    !billing.configured ||
                    (tier === "FREE" && !onPaidPlan)
                  }
                  onClick={() => void choose(tier)}
                >
                  {busyTier === tier ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : current ? (
                    <Check aria-hidden />
                  ) : (
                    <CreditCard aria-hidden />
                  )}
                  {current
                    ? "Current plan"
                    : tier === "FREE"
                      ? "Downgrade"
                      : onPaidPlan
                        ? "Switch"
                        : "Upgrade"}
                </Button>
              </div>
            );
          })}
        </div>

        {(waiting || plan.status === "PAST_DUE") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void checkStatus()}
            disabled={check.isPending}
          >
            {check.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Check payment status
          </Button>
        )}
        {onPaidPlan && !plan.cancelAtPeriodEnd && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void cancelPlan()}
            disabled={cancel.isPending}
          >
            Cancel plan
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Test card: 4111 1111 1111 1111, any future date, any CVV. Test UPI: success@razorpay.
        </p>
      </div>
    </SettingsSection>
  );
}

// --- Invoices and payments -----------------------------------------------------------

function HistorySection({ billing }: { billing: BillingOverview }) {
  return (
    <SettingsSection title="Invoices and payments" description="The last 24 of each, newest first.">
      {billing.invoices.length === 0 && billing.payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Invoices appear after your first payment.
        </p>
      ) : (
        <div className="space-y-5">
          {billing.invoices.length > 0 && (
            <table className="w-full text-sm">
              <caption className="mb-2 text-left font-medium">Invoices</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Date</th>
                  <th className="py-1 font-medium">Amount</th>
                  <th className="py-1 font-medium">Status</th>
                  <th className="py-1 font-medium">
                    <span className="sr-only">Link</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {billing.invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t">
                    <td className="py-2">{formatDate(invoice.paidAt ?? invoice.issuedAt ?? "")}</td>
                    <td className="py-2 tabular-nums">
                      {rupees(invoice.amountPaid || invoice.amountDue)}
                    </td>
                    <td className="py-2">{invoice.status.toLowerCase()}</td>
                    <td className="py-2 text-right">
                      {invoice.url && (
                        <a
                          href={invoice.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          View
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {billing.payments.length > 0 && (
            <table className="w-full text-sm">
              <caption className="mb-2 text-left font-medium">Payments</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Date</th>
                  <th className="py-1 font-medium">Amount</th>
                  <th className="py-1 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {billing.payments.map((payment) => (
                  <tr key={payment.id} className="border-t">
                    <td className="py-2">{formatDate(payment.paidAt ?? payment.createdAt)}</td>
                    <td className="py-2 tabular-nums">{rupees(payment.amount)}</td>
                    <td className={cn("py-2", payment.status === "FAILED" && "text-destructive")}>
                      {payment.status === "FAILED"
                        ? `Failed: ${payment.failureReason ?? ""}`
                        : "Paid"}
                      {payment.method ? ` (${payment.method})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </SettingsSection>
  );
}

// --- Billing address -----------------------------------------------------------------

const PROFILE_FIELDS = [
  "legalName",
  "email",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
  "gstin",
] as const;

function ProfileSection({ orgSlug, billing }: { orgSlug: string; billing: BillingOverview }) {
  const save = useSaveBillingProfile(orgSlug);
  const [formError, setFormError] = useState<string | null>(null);
  const profile = billing.profile;
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(billingProfileSchema),
    defaultValues: {
      legalName: profile?.legalName ?? "",
      email: profile?.email ?? "",
      addressLine1: profile?.addressLine1 ?? "",
      addressLine2: profile?.addressLine2 ?? "",
      city: profile?.city ?? "",
      state: profile?.state ?? "",
      postalCode: profile?.postalCode ?? "",
      country: profile?.country ?? "IN",
      gstin: profile?.gstin ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync(values);
      reset(values);
    } catch (error) {
      setFormError(showServerErrors(error, setError, PROFILE_FIELDS));
    }
  });

  return (
    <SettingsSection title="Billing address" description="Shown on invoices. GSTIN is optional.">
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        {save.isSuccess && !isDirty && (
          <Alert variant="success" className="sm:col-span-2">
            Saved.
          </Alert>
        )}
        {formError && (
          <Alert variant="error" className="sm:col-span-2">
            {formError}
          </Alert>
        )}
        <FormField
          name="legalName"
          label="Legal name"
          register={register}
          error={errors.legalName?.message}
        />
        <FormField
          name="email"
          label="Billing email"
          type="email"
          register={register}
          error={errors.email?.message}
        />
        <FormField
          name="addressLine1"
          label="Address"
          register={register}
          error={errors.addressLine1?.message}
        />
        <FormField
          name="addressLine2"
          label="Address line 2 (optional)"
          register={register}
          error={errors.addressLine2?.message}
        />
        <FormField name="city" label="City" register={register} error={errors.city?.message} />
        <FormField name="state" label="State" register={register} error={errors.state?.message} />
        <FormField
          name="postalCode"
          label="PIN code"
          register={register}
          error={errors.postalCode?.message}
        />
        <FormField
          name="country"
          label="Country code"
          hint="Two letters, e.g. IN"
          register={register}
          error={errors.country?.message}
        />
        <FormField
          name="gstin"
          label="GSTIN (optional)"
          register={register}
          error={errors.gstin?.message}
        />
        <div className="flex items-end sm:col-span-2">
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            Save address
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
