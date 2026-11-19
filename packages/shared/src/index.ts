// Code shared by the web app and the API: validation schemas, plan limits,
// permission rules and constants (see PRD.md §15.2).
// Imports use ".ts" because Node runs the API's TypeScript files directly.

export * from "./auth.ts";
export * from "./organizations.ts";
export * from "./permissions.ts";
export * from "./plans.ts";
export * from "./projects.ts";
export * from "./taskStatuses.ts";

export const APP_NAME = "NexusFlow";
