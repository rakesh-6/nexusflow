// Code shared by the web app and the API. Validation schemas, plan limits and
// permission rules will be added here in later steps (see PRD.md §15.2).
// Imports use ".ts" because Node runs the API's TypeScript files directly.

export * from "./auth.ts";
export * from "./taskStatuses.ts";

export const APP_NAME = "NexusFlow";

// Subscription plans from PRD.md §17.2.
export const PLAN_TIERS = ["FREE", "PRO", "BUSINESS", "ENTERPRISE"] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];
