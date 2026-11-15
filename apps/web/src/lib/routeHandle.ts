import type { Params } from "react-router";

// Extra information a route carries for the layout. Today: its breadcrumb
// label, e.g. "Projects" or the project key "NEX".
export interface RouteHandle {
  crumb: (params: Params) => string;
}

/** crumb("Projects") or crumb((params) => params.projectKey ?? "") */
export function crumb(label: string | ((params: Params) => string)): RouteHandle {
  return { crumb: typeof label === "string" ? () => label : label };
}

export function isRouteHandle(value: unknown): value is RouteHandle {
  return typeof value === "object" && value !== null && "crumb" in value;
}
