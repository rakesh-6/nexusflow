import { MAX_MEETING_NOTES_CHARS, type MeetingNotesOutput } from "@nexusflow/shared";
import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import type { WorkspaceContext } from "../../hooks/useWorkspace";
import { useProjects } from "../projects/hooks";
import { useCreateTask } from "../tasks/hooks";
import { AiButton, AiError, AiGate, AiPreview } from "./AiParts";
import { useAiAvailable, useMeetingNotes } from "./hooks";

// "Summarize meeting notes" from the ⌘K palette (PRD §11.16.2): paste notes,
// get a summary, decisions and action items; each item can become a task.

export const MEETING_NOTES_PARAM = "aiNotes";

export function MeetingNotesDialog({ context }: { context: WorkspaceContext }) {
  const [params, setParams] = useSearchParams();
  const open = params.get(MEETING_NOTES_PARAM) === "1";
  const available = useAiAvailable(context.organization.slug);
  if (!available) return null;
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete(MEETING_NOTES_PARAM);
    setParams(next, { replace: true });
  };
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent
        title="Summarize meeting notes"
        description="Paste your notes; get a summary, decisions and action items you can turn into tasks."
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
      >
        {open && <NotesForm context={context} />}
      </DialogContent>
    </Dialog>
  );
}

function NotesForm({ context }: { context: WorkspaceContext }) {
  const orgSlug = context.organization.slug;
  const summarize = useMeetingNotes(orgSlug);
  const { data: projects = [] } = useProjects(orgSlug, context.workspace.slug);
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState("");

  return (
    <div className="space-y-3">
      <textarea
        aria-label="Meeting notes"
        className="min-h-40 w-full rounded-control border bg-card px-3 py-2 text-sm"
        maxLength={MAX_MEETING_NOTES_CHARS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the notes here…"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Project for new tasks"
          className="h-9 rounded-control border bg-card px-2 text-sm"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">No project (summary only)</option>
          {projects
            .filter((project) => project.access.canContribute && project.status !== "ARCHIVED")
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.key} · {project.name}
              </option>
            ))}
        </select>
        <AiGate>
          <AiButton
            busy={summarize.isPending}
            disabled={text.trim().length < 20}
            onClick={() => summarize.mutate({ text, ...(projectId ? { projectId } : {}) })}
          >
            Summarize
          </AiButton>
        </AiGate>
        <span className="ml-auto text-xs text-muted-foreground">
          {text.length.toLocaleString()} / {MAX_MEETING_NOTES_CHARS.toLocaleString()}
        </span>
      </div>
      <AiError error={summarize.error} />
      {summarize.data && (
        <NotesResult
          orgSlug={orgSlug}
          projectId={projectId}
          result={summarize.data}
          onDiscard={() => summarize.reset()}
        />
      )}
    </div>
  );
}

function NotesResult({
  orgSlug,
  projectId,
  result,
  onDiscard,
}: {
  orgSlug: string;
  projectId: string;
  result: MeetingNotesOutput;
  onDiscard: () => void;
}) {
  return (
    <AiPreview title="Meeting summary" onDiscard={onDiscard}>
      <p className="whitespace-pre-line">{result.summary}</p>
      {result.decisions.length > 0 && (
        <>
          <p className="mt-2 font-medium">Decisions</p>
          <ul className="list-disc pl-5">
            {result.decisions.map((decision) => (
              <li key={decision}>{decision}</li>
            ))}
          </ul>
        </>
      )}
      {result.actionItems.length > 0 && (
        <>
          <p className="mt-2 font-medium">Action items</p>
          <ul className="space-y-1">
            {result.actionItems.map((item) => (
              <ActionItem key={item.title} orgSlug={orgSlug} projectId={projectId} item={item} />
            ))}
          </ul>
          {!projectId && (
            <p className="text-xs text-muted-foreground">Choose a project above to create tasks.</p>
          )}
        </>
      )}
    </AiPreview>
  );
}

function ActionItem({
  orgSlug,
  projectId,
  item,
}: {
  orgSlug: string;
  projectId: string;
  item: MeetingNotesOutput["actionItems"][number];
}) {
  const create = useCreateTask(orgSlug, projectId);
  const hints = [item.assigneeHint, item.dueHint].filter(Boolean).join(", ");
  return (
    <li className="flex items-center justify-between gap-2">
      <span>
        {item.title}
        {hints && <span className="text-muted-foreground"> ({hints})</span>}
      </span>
      {projectId && (
        <Button
          size="sm"
          variant="outline"
          disabled={create.isPending || create.isSuccess}
          onClick={() => create.mutate({ title: item.title })}
        >
          {create.isSuccess ? <Check aria-hidden /> : <Plus aria-hidden />}
          {create.isSuccess ? "Created" : "Create task"}
        </Button>
      )}
    </li>
  );
}
