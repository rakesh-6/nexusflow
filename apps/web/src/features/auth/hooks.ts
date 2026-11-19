import type {
  ChangePasswordInput,
  CurrentUser,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@nexusflow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiDelete, apiGet, apiPost } from "../../lib/api";
import { closeRealtime } from "../../lib/realtime";

// Everything the web app does with accounts, as React hooks. Each hook talks
// to one API endpoint (see apps/api/openapi.json) and keeps the cached
// "who am I" answer up to date.

export const CURRENT_USER_KEY = ["current-user"] as const;
const SESSIONS_KEY = ["sessions"] as const;

/** The signed-in person, or null when nobody is signed in. */
export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: async () => {
      try {
        return await apiGet<CurrentUser>("/api/v1/users/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => apiPost<{ user: CurrentUser }>("/api/v1/auth/login", input),
    onSuccess: ({ user }) => queryClient.setQueryData(CURRENT_USER_KEY, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      apiPost<{ user: CurrentUser | null; message?: string }>("/api/v1/auth/register", input),
    onSuccess: ({ user }) => {
      if (user) queryClient.setQueryData(CURRENT_USER_KEY, user);
    },
  });
}

export function useLogout(everywhere = false) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(everywhere ? "/api/v1/auth/logout-all" : "/api/v1/auth/logout"),
    // Forget every cached answer: the next person on this browser starts clean.
    onSettled: () => {
      closeRealtime();
      queryClient.clear();
      queryClient.setQueryData(CURRENT_USER_KEY, null);
    },
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiPost<{ user: CurrentUser }>("/api/v1/auth/verify-email", { token }),
    // The link may be opened in a browser where nobody is signed in, so ask again
    // instead of assuming.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY }),
  });
}

export function useResendVerification() {
  return useMutation({ mutationFn: () => apiPost("/api/v1/auth/resend-verification") });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      apiPost<{ message: string }>("/api/v1/auth/forgot-password", { email }),
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResetPasswordInput) => apiPost("/api/v1/auth/reset-password", input),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(CURRENT_USER_KEY, null);
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => apiPost("/api/v1/auth/change-password", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export function useSessions() {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => apiGet<SessionInfo[]>("/api/v1/auth/sessions"),
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiDelete(`/api/v1/auth/sessions/${sessionId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

/** Only allows returning to addresses inside this app ("/acme/..."), never to other websites. */
export function safeReturnTo(value: string | null): string {
  // "//evil.example" and "/\evil.example" are read by browsers as other websites.
  return value && value.startsWith("/") && !/^\/[/\\]/.test(value) ? value : "/";
}
