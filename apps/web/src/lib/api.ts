// The response shape every API endpoint uses (PRD §18.2).
export interface ApiIssue {
  /** Where the problem is, e.g. "body.email". */
  path: string;
  message: string;
}

export type ApiResponse<T> =
  | { success: true; data: T; meta?: Record<string, unknown> }
  | {
      success: false;
      error: { code: string; message: string; details?: ApiIssue[]; requestId?: string };
    };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiIssue[];

  constructor(status: number, code: string, message: string, details: ApiIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Calls the API and returns `data` plus `meta` (paging details), or throws an
 * ApiError with the server's message. Paths start with "/api/v1"; in
 * development Vite forwards them to the Express server, and in production they
 * are on the same address, so the login cookie is sent automatically.
 */
async function request<T>(method: Method, path: string, body?: unknown, timeoutMs = 20_000) {
  const headers: Record<string, string> = { Accept: "application/json" };
  // Requests that change something carry the anti-forgery header (PRD §19.3).
  if (method !== "GET") headers["X-Requested-With"] = "NexusFlow";
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection.");
  }

  const parsed = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!parsed) {
    throw new ApiError(response.status, "BAD_RESPONSE", "The server sent an unreadable reply");
  }
  if (!parsed.success) {
    const { code, message, details } = parsed.error;
    throw new ApiError(response.status, code, message, details);
  }
  return { data: parsed.data, meta: parsed.meta ?? {} };
}

/** Calls the API and returns only `data`. */
export async function api<T>(method: Method, path: string, body?: unknown, timeoutMs?: number) {
  return (await request<T>(method, path, body, timeoutMs)).data;
}

export const apiGet = <T>(path: string, timeoutMs?: number) =>
  api<T>("GET", path, undefined, timeoutMs);
/** A list endpoint: the items and the paging details (e.g. meta.nextCursor). */
export const apiGetPage = <T, M>(path: string) =>
  request<T>("GET", path) as Promise<{ data: T; meta: Partial<M> }>;
export const apiPost = <T>(path: string, body?: unknown) => api<T>("POST", path, body ?? {});
/** A POST whose answer also carries details in "meta". */
export const apiPostPage = <T, M>(path: string, body?: unknown) =>
  request<T>("POST", path, body ?? {}) as Promise<{ data: T; meta: Partial<M> }>;
export const apiPut = <T>(path: string, body: unknown) => api<T>("PUT", path, body);
export const apiPatch = <T>(path: string, body: unknown) => api<T>("PATCH", path, body);
export const apiDelete = <T>(path: string, body?: unknown) => api<T>("DELETE", path, body);

/** True when the API said "you are over your plan's limit" (HTTP 402). */
export const isPlanLimit = (error: unknown) =>
  error instanceof ApiError && error.code === "PLAN_LIMIT_REACHED";

/** The server's message for an error, or a general one for anything else. */
export const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
