import { PLAN_LIMITS, PLAN_PRICES, PLAN_TIERS, type PlanTier } from "@nexusflow/shared";
import { Check } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../components/ui/button";
import { formatBytes } from "../features/organizations/labels";
import { cn } from "../lib/utils";

// /pricing (PRD §11.14.2): the four plans, from the same settings the server
// enforces. Prices are demo values: payments run in Razorpay test mode.

const NAMES: Record<PlanTier, string> = {
  FREE: "Free",
  PRO: "Pro",
  BUSINESS: "Business",
  ENTERPRISE: "Enterprise",
};
const PITCH: Record<PlanTier, string> = {
  FREE: "For trying NexusFlow with a small team.",
  PRO: "For growing teams with several workspaces.",
  BUSINESS: "For companies with many teams and clients.",
  ENTERPRISE: "For organizations that need no limits.",
};

const count = (value: number | null, unit: string) =>
  value === null ? `Unlimited ${unit}` : `${value.toLocaleString()} ${unit}`;

export default function PricingPage() {
  const [yearly, setYearly] = useState(false);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Plans and prices</h1>
        <p className="mt-2 text-muted-foreground">
          One price per organization, not per person. Prices are examples: payments run in test
          mode.
        </p>
        <div
          role="group"
          aria-label="Billing period"
          className="mt-5 inline-flex rounded-full border bg-card p-1"
        >
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={yearly === value}
              onClick={() => setYearly(value)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm",
                yearly === value ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {value ? "Yearly (2 months free)" : "Monthly"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLAN_TIERS.map((tier) => {
          const limits = PLAN_LIMITS[tier];
          const price = PLAN_PRICES[tier];
          const features = [
            count(limits.maxWorkspaces, limits.maxWorkspaces === 1 ? "workspace" : "workspaces"),
            count(limits.maxMembers, "members"),
            count(limits.maxGuests, "guests"),
            limits.maxActiveProjectsPerWorkspace === null
              ? "Unlimited projects"
              : `${limits.maxActiveProjectsPerWorkspace} active projects per workspace`,
            limits.maxStorageBytes === null
              ? "Unlimited storage"
              : `${formatBytes(limits.maxStorageBytes)} of files`,
            `Files up to ${formatBytes(limits.maxFileBytes)}`,
            limits.analyticsHistoryDays === null
              ? "All analytics history"
              : `${limits.analyticsHistoryDays} days of analytics`,
          ];
          return (
            <section
              key={tier}
              aria-labelledby={`plan-${tier}`}
              className={cn(
                "flex flex-col rounded-card border bg-card p-6 shadow-sm",
                tier === "PRO" && "border-primary ring-1 ring-primary",
              )}
            >
              <h2 id={`plan-${tier}`} className="text-lg font-semibold">
                {NAMES[tier]}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{PITCH[tier]}</p>
              <p className="mt-4 text-3xl font-semibold">
                {price === null
                  ? "Let's talk"
                  : price === 0
                    ? "₹0"
                    : `₹${(yearly ? price * 10 : price).toLocaleString("en-IN")}`}
                {price ? (
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / {yearly ? "year" : "month"}
                  </span>
                ) : null}
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button asChild variant={tier === "PRO" ? "primary" : "outline"} className="mt-6">
                {tier === "ENTERPRISE" ? (
                  <a href="mailto:sales@nexusflow.example">Contact sales</a>
                ) : (
                  <Link to="/register">
                    {tier === "FREE" ? "Start for free" : `Choose ${NAMES[tier]}`}
                  </Link>
                )}
              </Button>
            </section>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        The owner upgrades in Settings › Billing (Razorpay test mode: no real money). Every limit
        above is checked by the server.
      </p>
    </div>
  );
}
