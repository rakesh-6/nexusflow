import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { apiGet } from "../../lib/api";
import { safeReturnTo } from "./hooks";

/** Which sign-in methods the server has switched on (Google needs setup, PRD §22). */
export function useAuthProviders() {
  return useQuery({
    queryKey: ["auth-providers"],
    queryFn: () =>
      apiGet<{ google: boolean; photoUpload?: boolean; demo?: boolean }>("/api/v1/auth/providers"),
    staleTime: Infinity,
  });
}

// "Continue with Google", followed by an "or" divider. Shows nothing until
// Google sign-in is configured on the server.
export function GoogleButton() {
  const { data } = useAuthProviders();
  const [params] = useSearchParams();
  if (!data?.google) return null;

  const returnTo = encodeURIComponent(safeReturnTo(params.get("returnTo")));
  return (
    <div className="mb-5 space-y-5">
      {/* A full page visit: the server sends the browser on to Google and back. */}
      <a
        href={`/api/v1/auth/google?returnTo=${returnTo}`}
        className="flex h-10 w-full items-center justify-center gap-2.5 rounded-control border bg-card text-sm font-medium transition-colors duration-150 hover:bg-surface"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"
          />
          <path
            fill="#34A853"
            d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8z"
          />
          <path
            fill="#EA4335"
            d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"
          />
        </svg>
        Continue with Google
      </a>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
