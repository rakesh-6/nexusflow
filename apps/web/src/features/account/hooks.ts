import type { CurrentUser, UpdateProfileInput } from "@nexusflow/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiDelete, apiPatch, apiPost } from "../../lib/api";
import { CURRENT_USER_KEY } from "../auth/hooks";

// Changes to the signed-in person's own account: profile, photo, deletion.

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => apiPatch<CurrentUser>("/api/v1/users/me", input),
    onSuccess: (user) => queryClient.setQueryData(CURRENT_USER_KEY, user),
  });
}

interface SignedUpload {
  url: string;
  fields: Record<string, string>;
}

/**
 * Uploads a new profile photo in three steps (PRD §11.11):
 *   1. ask our API for a one-time signed upload,
 *   2. send the file straight to Cloudinary (it never passes through our server),
 *   3. ask our API to check what arrived and save it as the photo.
 */
export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const signed = await apiPost<SignedUpload>("/api/v1/users/me/avatar/sign", {
        mimeType: file.type,
        sizeBytes: file.size,
      });

      const form = new FormData();
      for (const [name, value] of Object.entries(signed.fields)) form.append(name, value);
      form.append("file", file);
      const upload = await fetch(signed.url, { method: "POST", body: form });
      const uploaded = (await upload.json().catch(() => null)) as { public_id?: string } | null;
      if (!upload.ok || !uploaded?.public_id) {
        throw new ApiError(
          upload.status,
          "UPLOAD_FAILED",
          "The photo could not be uploaded. Try another image.",
        );
      }

      return apiPost<CurrentUser>("/api/v1/users/me/avatar/confirm", {
        publicId: uploaded.public_id,
      });
    },
    onSuccess: (user) => queryClient.setQueryData(CURRENT_USER_KEY, user),
  });
}

export function useRemoveAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<CurrentUser>("/api/v1/users/me/avatar"),
    onSuccess: (user) => queryClient.setQueryData(CURRENT_USER_KEY, user),
  });
}

/** Confirms the password, then deletes the account (the API requires both, PRD §11.1.7). */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (password: string) => {
      await apiPost("/api/v1/auth/reauthenticate", { password });
      await apiDelete("/api/v1/users/me");
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(CURRENT_USER_KEY, null);
    },
  });
}
