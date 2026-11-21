// Code shared by the web app and the API: validation schemas, plan limits,
// permission rules and constants (see PRD.md §15.2).
// Imports use ".ts" because Node runs the API's TypeScript files directly.

export * from "./ai.ts";
export * from "./analytics.ts";
export * from "./attachments.ts";
export * from "./auth.ts";
export * from "./automations.ts";
export * from "./billing.ts";
export * from "./comments.ts";
export * from "./dates.ts";
export * from "./notifications.ts";
export * from "./organizations.ts";
export * from "./permissions.ts";
export * from "./plans.ts";
export * from "./projects.ts";
export * from "./richText.ts";
export * from "./tasks.ts";
export * from "./taskStatuses.ts";

export const APP_NAME = "NexusFlow";
