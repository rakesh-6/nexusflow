import { zodResolver } from "@hookform/resolvers/zod";
import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  profileFormSchema,
  type CurrentUser,
} from "@nexusflow/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { FormField, showServerErrors } from "../../components/common/FormField";
import { PageHeader } from "../../components/common/PageHeader";
import { SettingsSection as Section } from "../../components/common/SettingsSection";
import { UserAvatar } from "../../components/common/UserAvatar";
import { ThemeSwitcher } from "../../components/ThemeSwitcher";
import { TokenPreview } from "../../components/TokenPreview";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { useRemoveAvatar, useUpdateProfile, useUploadAvatar } from "../../features/account/hooks";
import { useCurrentUser } from "../../features/auth/hooks";
import { ApiError, apiGet } from "../../lib/api";

function AvatarEditor({ user }: { user: CurrentUser }) {
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const input = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const { data: providers } = useQuery({
    queryKey: ["auth-providers"],
    queryFn: () => apiGet<{ google: boolean; photoUpload?: boolean }>("/api/v1/auth/providers"),
    staleTime: Infinity,
  });

  function onFileChosen(file: File | undefined) {
    setLocalError(null);
    if (!file) return;
    // Check here first for a quick answer; the server checks again.
    if (!(AVATAR_TYPES as readonly string[]).includes(file.type))
      return setLocalError("Use a JPEG, PNG or WebP image.");
    if (file.size > AVATAR_MAX_BYTES) return setLocalError("Use an image of 5 MB or less.");
    upload.mutate(file);
  }

  const error =
    localError ??
    (upload.error instanceof ApiError
      ? upload.error.message
      : upload.error
        ? "Upload failed."
        : null);
  const busy = upload.isPending || remove.isPending;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <UserAvatar name={user.name} avatarUrl={user.avatarUrl} className="size-16 text-lg" />
      {providers?.photoUpload === false ? (
        <p className="text-sm text-muted-foreground">
          Photo upload is not set up on this server yet.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              ref={input}
              type="file"
              accept={AVATAR_TYPES.join(",")}
              className="sr-only"
              aria-label="Choose a profile photo"
              onChange={(event) => {
                onFileChosen(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              {upload.isPending ? "Uploading…" : user.avatarUrl ? "Change photo" : "Upload photo"}
            </Button>
            {user.avatarUrl && (
              <Button variant="ghost" size="sm" onClick={() => remove.mutate()} disabled={busy}>
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG or WebP, up to 5 MB. Cropped to a square.
          </p>
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

const BROWSER_TIME_ZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
})();

/**
 * The browser's time-zone list, plus the person's saved zone. Browsers list
 * some zones under older names (for example "Asia/Calcutta" for "Asia/Kolkata");
 * without this, the saved zone would be missing from the dropdown and saving
 * the form would silently change it.
 */
function timeZoneOptions(current: string): string[] {
  return BROWSER_TIME_ZONES.includes(current)
    ? BROWSER_TIME_ZONES
    : [...BROWSER_TIME_ZONES, current].sort();
}

function ProfileForm({ user }: { user: CurrentUser }) {
  const update = useUpdateProfile();
  const timezoneId = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { name: user.name, timezone: user.timezone },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await update.mutateAsync(values);
      reset({ name: saved.name, timezone: saved.timezone });
    } catch (error) {
      setFormError(showServerErrors(error, setError, ["name", "timezone"]));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-4">
      {update.isSuccess && !isDirty && <Alert variant="success">Profile saved.</Alert>}
      {formError && <Alert variant="error">{formError}</Alert>}
      <FormField
        name="name"
        label="Name"
        autoComplete="name"
        register={register}
        error={errors.name?.message}
      />
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">Email</label>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={timezoneId} className="block text-sm font-medium">
          Time zone
        </label>
        <select
          id={timezoneId}
          className="h-10 w-full rounded-control border bg-card px-3 text-sm"
          {...register("timezone")}
        >
          {timeZoneOptions(user.timezone).map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Due dates and reminders follow this time zone.
        </p>
      </div>
      <Button type="submit" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

// Settings › Profile (PRD §11.1.6): photo, name, time zone, and appearance.
export default function ProfileSettingsPage() {
  const { data: user } = useCurrentUser();
  if (!user) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader title="Profile" description="How you appear to your teammates." />
      <Section title="Photo" description="Shown next to your name on tasks and comments.">
        <AvatarEditor user={user} />
      </Section>
      <Section title="Details" description="Your name and the time zone used for dates.">
        <ProfileForm user={user} />
      </Section>
      <Section title="Appearance" description="Choose how NexusFlow looks on this device.">
        <div className="space-y-4">
          <ThemeSwitcher />
          <TokenPreview />
        </div>
      </Section>
    </div>
  );
}
