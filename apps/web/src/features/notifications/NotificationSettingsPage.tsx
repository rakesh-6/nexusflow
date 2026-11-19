import {
  NOTIFICATION_GROUPS,
  NOTIFICATION_LABELS,
  type NotificationPreferenceSummary,
  type NotificationType,
} from "@nexusflow/shared";
import { useEffect, useState } from "react";
import { SettingsPage, SettingsSection } from "../../components/common/SettingsSection";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { errorMessage } from "../../lib/api";
import { useNotificationPreferences, useSaveNotificationPreferences } from "./hooks";

// /:org/settings/notifications (PRD §11.10.4): which notifications you get in
// the app and by email, per type.

type Choices = Record<NotificationType, { inApp: boolean; email: boolean }>;

export default function NotificationSettingsPage() {
  const preferences = useNotificationPreferences();
  const save = useSaveNotificationPreferences();
  const [choices, setChoices] = useState<Choices | null>(null);

  useEffect(() => {
    if (preferences.data) {
      setChoices(
        Object.fromEntries(
          preferences.data.map((row) => [row.type, { inApp: row.inApp, email: row.email }]),
        ) as Choices,
      );
    }
  }, [preferences.data]);

  const toggle = (type: NotificationType, channel: "inApp" | "email") =>
    setChoices((current) =>
      current
        ? { ...current, [type]: { ...current[type], [channel]: !current[type][channel] } }
        : current,
    );
  const changed =
    choices &&
    preferences.data?.some(
      (row) => row.inApp !== choices[row.type].inApp || row.email !== choices[row.type].email,
    );
  const submit = () => {
    if (!choices) return;
    const list: NotificationPreferenceSummary[] = Object.entries(choices).map(([type, value]) => ({
      type: type as NotificationType,
      ...value,
    }));
    save.mutate(list);
  };

  return (
    <SettingsPage
      title="Notifications"
      description="Choose what you hear about in the app and by email. You never get notifications about your own actions."
      actions={
        <Button onClick={submit} disabled={!changed || save.isPending}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      }
    >
      {save.isError && <Alert variant="error">{errorMessage(save.error)}</Alert>}
      {save.isSuccess && !changed && <Alert variant="success">Your choices are saved.</Alert>}
      {preferences.isError && <Alert variant="error">Your settings could not be loaded.</Alert>}
      {!choices ? (
        <Skeleton className="h-64" />
      ) : (
        NOTIFICATION_GROUPS.map((group) => (
          <SettingsSection
            key={group.title}
            title={group.title}
            description="In the app shows it in your Inbox; Email also sends it to your inbox."
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Tell me when…</th>
                  <th className="w-20 pb-2 text-center font-medium">In the app</th>
                  <th className="w-20 pb-2 text-center font-medium">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {group.types.map((type) => (
                  <tr key={type}>
                    <td className="py-2.5">{NOTIFICATION_LABELS[type]}</td>
                    {(["inApp", "email"] as const).map((channel) => (
                      <td key={channel} className="py-2.5 text-center">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          aria-label={`${NOTIFICATION_LABELS[type]}: ${channel === "inApp" ? "in the app" : "email"}`}
                          checked={choices[type][channel]}
                          onChange={() => toggle(type, channel)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </SettingsSection>
        ))
      )}
    </SettingsPage>
  );
}
