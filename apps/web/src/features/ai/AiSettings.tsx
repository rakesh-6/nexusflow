import type { AiFeature } from "@nexusflow/shared";
import { Link } from "react-router";
import { SettingsPage, SettingsSection } from "../../components/common/SettingsSection";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import type { WorkspaceContext } from "../../hooks/useWorkspace";
import { errorMessage } from "../../lib/api";
import { useAiSettings, useAiStatus, useAiUsage } from "./hooks";

// Settings › AI features (PRD §11.16.1, US-AI-06): the owner's switch, the
// monthly allowance, and this month's use per feature.

const FEATURE_LABELS: Record<AiFeature, string> = {
  TASK_DESCRIPTION: "Task descriptions",
  TASK_BREAKDOWN: "Subtask suggestions",
  PROJECT_PLAN: "Project plans",
  PROJECT_SUMMARY: "Project summaries",
  MEETING_NOTES: "Meeting notes",
  INSIGHTS: "Insights",
  DEADLINE_SUGGESTION: "Due date suggestions",
  WEEKLY_REPORT: "Weekly reports",
};

export function AiSettings({ context }: { context: WorkspaceContext }) {
  const orgSlug = context.organization.slug;
  const { data: status, isPending, isError } = useAiStatus(orgSlug);
  const toggle = useAiSettings(orgSlug);
  const usage = useAiUsage(orgSlug, !!status && context.can("usage:read"));

  return (
    <SettingsPage
      title="AI features"
      description="Suggestions from Google Gemini's free tier. People review every suggestion before it is saved."
    >
      {isError && <Alert variant="error">AI settings could not be loaded.</Alert>}
      {isPending ? (
        <Skeleton className="h-32" />
      ) : !status ? (
        <Alert variant="info">
          AI is not set up on this server. Add a free Gemini key as <code>AI_API_KEY</code> in the
          server settings (see .env.example) to turn it on.
        </Alert>
      ) : (
        <>
          {!status.planAllows && (
            <Alert variant="info">
              AI features are part of the Pro plan.{" "}
              {context.can("billing:manage") && (
                <Link
                  to={context.settingsPath("org/billing")}
                  className="font-medium text-primary hover:underline"
                >
                  Upgrade
                </Link>
              )}
            </Alert>
          )}
          <SettingsSection
            title="For this organization"
            description="When off, nobody here sees AI buttons and nothing is sent to the AI service."
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                AI features are <strong>{status.enabled ? "on" : "off"}</strong>
                {status.monthlyLimit !== null && status.planAllows && (
                  <>
                    {" "}
                    · {status.usedThisMonth} of {status.monthlyLimit} requests used this month
                  </>
                )}
              </p>
              {status.canManage ? (
                <Button
                  variant="outline"
                  role="switch"
                  aria-checked={status.enabled}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(!status.enabled)}
                >
                  {status.enabled ? "Turn off" : "Turn on"}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Only the owner can change this.
                </span>
              )}
            </div>
            {toggle.isError && <Alert variant="error">{errorMessage(toggle.error)}</Alert>}
          </SettingsSection>

          {context.can("usage:read") && (
            <SettingsSection
              title="This month"
              description="Requests per feature, failures included."
            >
              {usage.isPending ? (
                <Skeleton className="h-20" />
              ) : !usage.data?.length ? (
                <p className="text-sm text-muted-foreground">No AI requests yet this month.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 font-medium">Feature</th>
                      <th className="py-1 text-right font-medium">Requests</th>
                      <th className="py-1 text-right font-medium">Failed</th>
                      <th className="py-1 text-right font-medium">Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.data.map((row) => (
                      <tr key={row.feature} className="border-t">
                        <td className="py-2">{FEATURE_LABELS[row.feature]}</td>
                        <td className="py-2 text-right tabular-nums">{row.requests}</td>
                        <td className="py-2 text-right tabular-nums">{row.failed}</td>
                        <td className="py-2 text-right tabular-nums">
                          {(row.promptTokens + row.completionTokens).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SettingsSection>
          )}
        </>
      )}
    </SettingsPage>
  );
}
