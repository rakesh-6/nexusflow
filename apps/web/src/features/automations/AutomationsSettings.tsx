import type { AutomationSummary } from "@nexusflow/shared";
import { Plus, Workflow } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { EmptyState } from "../../components/common/EmptyState";
import { SettingsPage, SettingsSection } from "../../components/common/SettingsSection";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import type { WorkspaceContext } from "../../hooks/useWorkspace";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/utils";
import { formatDateTime } from "../organizations/labels";
import {
  useAutomations,
  useDeleteAutomation,
  useDryRun,
  useExecutions,
  useToggleAutomation,
} from "./hooks";
import { RuleBuilder } from "./RuleBuilder";

// Settings › Automations (PRD §11.15): this workspace's rules, the builder,
// and each rule's run log with a dry run.

export function AutomationsSettings({ context }: { context: WorkspaceContext }) {
  const orgSlug = context.organization.slug;
  const workspaceSlug = context.workspace.slug;
  const { data: rules, isPending, isError } = useAutomations(orgSlug, workspaceSlug);
  const [building, setBuilding] = useState(false);
  const [logFor, setLogFor] = useState<AutomationSummary | null>(null);
  const onFree = context.plan.tier === "FREE";

  return (
    <SettingsPage
      title="Automations"
      description={`Rules that run by themselves in ${context.workspace.name}: when something happens, if it matches, then act.`}
      actions={
        !onFree && (
          <Button onClick={() => setBuilding(true)}>
            <Plus aria-hidden /> New rule
          </Button>
        )
      }
    >
      {onFree && (
        <Alert variant="info">
          Automations are part of the Pro plan.{" "}
          {context.can("billing:manage") ? (
            <Link
              to={context.settingsPath("org/billing")}
              className="font-medium text-primary hover:underline"
            >
              Upgrade
            </Link>
          ) : (
            "Ask the owner to upgrade."
          )}
        </Alert>
      )}
      {isError && <Alert variant="error">Automations could not be loaded.</Alert>}
      <SettingsSection
        title="Rules"
        description="Project managers manage their projects' rules; workspace admins also manage workspace-wide ones."
      >
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : !rules?.length ? (
          <EmptyState
            icon={Workflow}
            title="No rules yet"
            description="Start from a recipe like “tell project managers when a task is done”."
          />
        ) : (
          <ul className="divide-y">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                orgSlug={orgSlug}
                rule={rule}
                onShowLog={() => setLogFor(rule)}
              />
            ))}
          </ul>
        )}
      </SettingsSection>

      <Dialog open={building} onOpenChange={setBuilding}>
        <DialogContent title="New rule" className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {building && (
            <RuleBuilder
              orgSlug={orgSlug}
              workspaceSlug={workspaceSlug}
              canManageWorkspace={context.workspace.role === "WORKSPACE_ADMIN"}
              onDone={() => setBuilding(false)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!logFor} onOpenChange={(open) => !open && setLogFor(null)}>
        <DialogContent
          title={logFor ? `Runs of “${logFor.name}”` : "Runs"}
          className="max-h-[90vh] max-w-xl overflow-y-auto"
        >
          {logFor && <RunLog orgSlug={orgSlug} workspaceSlug={workspaceSlug} rule={logFor} />}
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}

function RuleRow({
  orgSlug,
  rule,
  onShowLog,
}: {
  orgSlug: string;
  rule: AutomationSummary;
  onShowLog: () => void;
}) {
  const toggle = useToggleAutomation(orgSlug);
  const remove = useDeleteAutomation(orgSlug);
  const [error, setError] = useState<string | null>(null);
  const run = (work: () => Promise<unknown>) => {
    setError(null);
    work().catch((failure: unknown) => setError(errorMessage(failure)));
  };
  return (
    <li className="space-y-1.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{rule.name}</p>
        {!rule.projectId && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs">Whole workspace</span>
        )}
        {!rule.isEnabled && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs">Off</span>
        )}
        {rule.consecutiveFailures > 0 && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
            {rule.consecutiveFailures} failed in a row
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{rule.summary}</p>
      <p className="text-xs text-muted-foreground">
        Ran {rule.runCount} {rule.runCount === 1 ? "time" : "times"}
        {rule.lastRunAt ? `, last on ${formatDateTime(rule.lastRunAt)}` : ""}
      </p>
      {error && <Alert variant="error">{error}</Alert>}
      {rule.canManage && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            role="switch"
            aria-checked={rule.isEnabled}
            disabled={toggle.isPending}
            onClick={() => run(() => toggle.mutateAsync(rule.id))}
          >
            {rule.isEnabled ? "Turn off" : "Turn on"}
          </Button>
          <Button size="sm" variant="outline" onClick={onShowLog}>
            Runs and dry run
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() =>
              window.confirm(`Delete “${rule.name}”?`) && run(() => remove.mutateAsync(rule.id))
            }
          >
            Delete
          </Button>
        </div>
      )}
    </li>
  );
}

const STATUS_STYLES = {
  SUCCESS: "text-success",
  FAILED: "text-destructive",
  SKIPPED: "text-muted-foreground",
} as const;

function RunLog({
  orgSlug,
  workspaceSlug,
  rule,
}: {
  orgSlug: string;
  workspaceSlug: string;
  rule: AutomationSummary;
}) {
  const { data: runs, isPending } = useExecutions(orgSlug, rule.id);
  const dry = useDryRun(orgSlug, workspaceSlug);
  const [taskKey, setTaskKey] = useState("");

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{rule.summary}</p>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (taskKey.trim()) dry.mutate({ automationId: rule.id, taskKey });
        }}
      >
        <p className="text-sm font-medium">Dry run: what would it do to a task?</p>
        <div className="flex gap-2">
          <Input
            aria-label="Task key"
            placeholder="NEX-12"
            value={taskKey}
            onChange={(e) => setTaskKey(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={dry.isPending}>
            Try
          </Button>
        </div>
        {dry.isError && <Alert variant="error">{errorMessage(dry.error)}</Alert>}
        {dry.data && (
          <Alert variant={dry.data.matches ? "success" : "info"}>
            <p className="font-medium">
              {dry.data.matches ? "It would run:" : "Its conditions do not match this task."}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {dry.data.conditions.map((condition) => (
                <li key={condition.text}>
                  {condition.passes ? "✓" : "✗"} {condition.text}
                </li>
              ))}
              {dry.data.matches && dry.data.actions.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </Alert>
        )}
      </form>

      <div>
        <p className="text-sm font-medium">Recent runs</p>
        {isPending ? (
          <Skeleton className="mt-2 h-20" />
        ) : !runs?.length ? (
          <p className="mt-1 text-sm text-muted-foreground">It has not run yet.</p>
        ) : (
          <ul className="mt-2 divide-y text-sm">
            {runs.map((entry) => (
              <li key={entry.id} className="py-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className={cn("font-medium", STATUS_STYLES[entry.status])}>
                    {entry.status.charAt(0) + entry.status.slice(1).toLowerCase()}
                    {entry.trigger.taskKey ? ` · ${entry.trigger.taskKey}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.startedAt)}
                  </span>
                </div>
                {entry.result.length > 0 && (
                  <p className="text-muted-foreground">{entry.result.join(" · ")}</p>
                )}
                {entry.error && <p className="text-destructive">{entry.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
