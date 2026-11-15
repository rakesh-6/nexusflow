// The response shape every API endpoint uses (PRD §18.2).
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; requestId?: string } };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Calls the API and returns `data`, or throws an ApiError with the server's
 * message. Paths start with "/api/v1"; in development Vite forwards them to
 * the Express server, and in production they are on the same address.
 * Phase 2 extends this with cookies, 401 redirects and plan-limit dialogs.
 */
export async function apiGet<T>(path: string, timeoutMs = 20_000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Is the API running?");
  }

  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!body)
    throw new ApiError(response.status, "BAD_RESPONSE", "The server sent an unreadable reply");
  if (!body.success) throw new ApiError(response.status, body.error.code, body.error.message);
  return body.data;
}
