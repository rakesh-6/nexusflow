import { docToText, type RichTextDoc, type TaskDetail } from "@nexusflow/shared";
import { useState } from "react";
import { Input } from "../../components/ui/input";
import { useCreateTask } from "../tasks/hooks";
import { AiButton, AiError, AiGate, AiPreview } from "./AiParts";
import {
  useAiAvailable,
  useDraftDescription,
  useSuggestDeadline,
  useSuggestSubtasks,
} from "./hooks";

// The task panel's AI tools (PRD §11.16.2): draft a description, suggest
// subtasks, suggest a due date. Each shows a preview; nothing changes until
// the person accepts it.

interface Props {
  orgSlug: string;
  task: TaskDetail;
  /** Saves a change to the task (with its version), as the panel's own fields do. */
  onSave: (change: { description?: RichTextDoc; dueDate?: string }) => void;
}

export function AiTaskTools({ orgSlug, task, onSave }: Props) {
  const available = useAiAvailable(orgSlug);
  const draft = useDraftDescription(orgSlug);
  const subtasks = useSuggestSubtasks(orgSlug);
  const deadline = useSuggestDeadline(orgSlug);
  if (!available || !task.canEdit) return null;

  return (
    <div className="space-y-3">
      <AiGate>
        <div className="flex flex-wrap gap-2">
          <AiButton
            busy={draft.isPending}
            onClick={() =>
              draft.mutate({ projectId: task.projectId, title: task.title, taskId: task.id })
            }
          >
            Draft description
          </AiButton>
          {!task.parentTaskId && (
            <AiButton
              busy={subtasks.isPending}
              onClick={() => subtasks.mutate({ taskId: task.id })}
            >
              Suggest subtasks
            </AiButton>
          )}
          <AiButton busy={deadline.isPending} onClick={() => deadline.mutate({ taskId: task.id })}>
            Suggest due date
          </AiButton>
        </div>
      </AiGate>
      <AiError error={draft.error ?? subtasks.error ?? deadline.error} />

      {draft.data && (
        <AiPreview
          title="Suggested description"
          acceptLabel={task.description ? "Replace the description" : "Use this description"}
          onAccept={() => {
            onSave({ description: draft.data.description });
            draft.reset();
          }}
          onDiscard={() => draft.reset()}
        >
          <p className="whitespace-pre-line">{docToText(draft.data.description)}</p>
        </AiPreview>
      )}

      {subtasks.data && (
        <SubtaskPreview
          orgSlug={orgSlug}
          task={task}
          suggestions={subtasks.data.subtasks}
          onDone={() => subtasks.reset()}
        />
      )}

      {deadline.data && (
        <AiPreview
          title={`Suggested due date: ${deadline.data.suggestedDueDate}`}
          acceptLabel="Use this date"
          onAccept={() => {
            onSave({ dueDate: deadline.data.suggestedDueDate });
            deadline.reset();
          }}
          onDiscard={() => deadline.reset()}
        >
          <p>{deadline.data.rationale}</p>
        </AiPreview>
      )}
    </div>
  );
}

type Suggestion = { title: string; estimatedHours?: number | null; priority?: string | null };

/** Suggested subtasks with checkboxes and editable titles (PRD §13.12). */
function SubtaskPreview({
  orgSlug,
  task,
  suggestions,
  onDone,
}: {
  orgSlug: string;
  task: TaskDetail;
  suggestions: Suggestion[];
  onDone: () => void;
}) {
  const create = useCreateTask(orgSlug, task.projectId);
  const [rows, setRows] = useState(() => suggestions.map((s) => ({ ...s, chosen: true })));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const chosen = rows.filter((row) => row.chosen && row.title.trim());

  async function accept() {
    setCreating(true);
    setError(null);
    try {
      // One at a time, in order, so they keep the suggested order on the board.
      for (const row of chosen) {
        await create.mutateAsync({
          title: row.title.trim(),
          parentTaskId: task.id,
          ...(row.estimatedHours ? { estimatedHours: row.estimatedHours } : {}),
          ...(row.priority ? { priority: row.priority as never } : {}),
        });
      }
      onDone();
    } catch (failure) {
      setError(failure);
    } finally {
      setCreating(false);
    }
  }

  return (
    <AiPreview
      title="Suggested subtasks"
      acceptLabel={`Create ${chosen.length} subtask${chosen.length === 1 ? "" : "s"}`}
      onAccept={chosen.length ? () => void accept() : undefined}
      accepting={creating}
      onDiscard={onDone}
    >
      <ul className="space-y-1.5">
        {rows.map((row, index) => (
          <li key={index} className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label={`Keep “${row.title}”`}
              checked={row.chosen}
              onChange={(e) =>
                setRows(rows.map((r, i) => (i === index ? { ...r, chosen: e.target.checked } : r)))
              }
            />
            <Input
              aria-label="Subtask title"
              className="h-8"
              value={row.title}
              onChange={(e) =>
                setRows(rows.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)))
              }
            />
            {row.estimatedHours ? (
              <span className="shrink-0 text-xs text-muted-foreground">{row.estimatedHours} h</span>
            ) : null}
          </li>
        ))}
      </ul>
      <AiError error={error} />
    </AiPreview>
  );
}
