import {
  PRIORITIES,
  type Priority,
  type ProjectSummary,
  type TaskStatusSummary,
  type TaskSummary,
} from "@nexusflow/shared";
import { useState, type FormEvent } from "react";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { errorMessage } from "../../lib/api";
import { PRIORITY_LABELS } from "../projects/labels";
import { useAssignable, useCreateTask } from "./hooks";
import { selectClass } from "./taskBits";

export interface NewTaskDefaults {
  statusId?: string;
  dueDate?: string;
}

// "New task" (shortcut: C). Only the title is required (PRD §11.6.1).
export function NewTaskDialog({
  orgSlug,
  project,
  statuses,
  open,
  onOpenChange,
  defaults = {},
  onCreated,
}: {
  orgSlug: string;
  project: ProjectSummary;
  statuses: TaskStatusSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: NewTaskDefaults;
  onCreated?: (task: TaskSummary) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`New task in ${project.name}`} className="max-w-lg">
        {/* Remounted on every open, so the form starts empty with the new defaults. */}
        {open && (
          <NewTaskForm
            orgSlug={orgSlug}
            project={project}
            statuses={statuses}
            defaults={defaults}
            onDone={(task) => {
              onOpenChange(false);
              if (task) onCreated?.(task);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewTaskForm({
  orgSlug,
  project,
  statuses,
  defaults,
  onDone,
}: {
  orgSlug: string;
  project: ProjectSummary;
  statuses: TaskStatusSummary[];
  defaults: NewTaskDefaults;
  onDone: (task?: TaskSummary) => void;
}) {
  const create = useCreateTask(orgSlug, project.id);
  const { data: people = [] } = useAssignable(orgSlug, project.id);
  const fallbackStatus = statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? "";
  const [title, setTitle] = useState("");
  const [statusId, setStatusId] = useState(defaults.statusId ?? fallbackStatus);
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [dueDate, setDueDate] = useState(defaults.dueDate ?? "");
  const [assigneeId, setAssigneeId] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      {
        title: title.trim(),
        priority,
        ...(statusId ? { statusId } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(assigneeId ? { assigneeIds: [assigneeId] } : {}),
      },
      { onSuccess: (task) => onDone(task) },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Title</span>
        <Input
          autoFocus
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs doing?"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="block text-sm font-medium">Column</span>
          <select
            className={`${selectClass} h-9 w-full`}
            value={statusId}
            onChange={(event) => setStatusId(event.target.value)}
          >
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium">Priority</span>
          <select
            className={`${selectClass} h-9 w-full`}
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium">Assignee</span>
          <select
            className={`${selectClass} h-9 w-full`}
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            <option value="">Nobody</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium">Due date</span>
          <Input
            type="date"
            className="h-9"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
      </div>
      {create.isError && <Alert variant="error">{errorMessage(create.error)}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending || !title.trim()}>
          {create.isPending ? "Creating…" : "Create task"}
        </Button>
      </div>
    </form>
  );
}
