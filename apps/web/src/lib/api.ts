// The response shape every API endpoint uses (PRD §18.2).
export interface ApiIssue {
  /** Where the problem is, e.g. "body.email". */
  path: string;
  message: string;
}

export type ApiResponse<T> =
  | { success: true; data: T }
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

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Calls the API and returns `data`, or throws an ApiError with the server's
 * message. Paths start with "/api/v1"; in development Vite forwards them to
 * the Express server, and in production they are on the same address, so the
 * login cookie is sent automatically.
 */
export async function api<T>(method: Method, path: string, body?: unknown, timeoutMs = 20_000) {
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
  return parsed.data;
}

export const apiGet = <T>(path: string, timeoutMs?: number) =>
  api<T>("GET", path, undefined, timeoutMs);
export const apiPost = <T>(path: string, body?: unknown) => api<T>("POST", path, body ?? {});
export const apiPatch = <T>(path: string, body: unknown) => api<T>("PATCH", path, body);
export const apiDelete = <T>(path: string) => api<T>("DELETE", path);
