// Subscription plans and their limits (PRD §23.1). Limits are configuration,
// not code logic: the API checks them with its plan guard, and the web app
// shows them on the usage page. `null` means unlimited.

export const PLAN_TIERS = ["FREE", "PRO", "BUSINESS", "ENTERPRISE"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export interface PlanLimits {
  maxWorkspaces: number | null;
  /** Owners, admins and members (guests are counted separately). */
  maxMembers: number | null;
  maxGuests: number | null;
  maxActiveProjectsPerWorkspace: number | null;
  maxStorageBytes: number | null;
  maxFileBytes: number;
  analyticsHistoryDays: number | null;
  /** Automation rules per workspace (0: the plan has no automations). */
  maxAutomationsPerWorkspace: number | null;
  /** Automation runs per organization per calendar month. */
  maxAutomationRunsPerMonth: number | null;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: {
    maxWorkspaces: 1,
    maxMembers: 5,
    maxGuests: 2,
    maxActiveProjectsPerWorkspace: 3,
    maxStorageBytes: 500 * MB,
    maxFileBytes: 10 * MB,
    analyticsHistoryDays: 30,
    maxAutomationsPerWorkspace: 0,
    maxAutomationRunsPerMonth: 0,
  },
  PRO: {
    maxWorkspaces: 5,
    maxMembers: 25,
    maxGuests: 10,
    maxActiveProjectsPerWorkspace: null,
    maxStorageBytes: 10 * GB,
    maxFileBytes: 25 * MB,
    analyticsHistoryDays: 365,
    maxAutomationsPerWorkspace: 20,
    maxAutomationRunsPerMonth: 5_000,
  },
  BUSINESS: {
    maxWorkspaces: 20,
    maxMembers: 100,
    maxGuests: 50,
    maxActiveProjectsPerWorkspace: null,
    maxStorageBytes: 100 * GB,
    maxFileBytes: 100 * MB,
    analyticsHistoryDays: null,
    maxAutomationsPerWorkspace: null,
    maxAutomationRunsPerMonth: 50_000,
  },
  ENTERPRISE: {
    maxWorkspaces: null,
    maxMembers: null,
    maxGuests: null,
    maxActiveProjectsPerWorkspace: null,
    maxStorageBytes: null,
    maxFileBytes: 100 * MB,
    analyticsHistoryDays: null,
    maxAutomationsPerWorkspace: null,
    maxAutomationRunsPerMonth: null,
  },
};

/**
 * Demo prices per organization per month in rupees (PRD A-1, D-1): Razorpay
 * test mode only. A year costs 10 months. null: "talk to us".
 */
export const PLAN_PRICES: Record<PlanTier, number | null> = {
  FREE: 0,
  PRO: 999,
  BUSINESS: 2999,
  ENTERPRISE: null,
};

/** How many free organizations one person may own (abuse guard, PRD A-7). */
export const MAX_OWNED_ORGANIZATIONS = 5;
