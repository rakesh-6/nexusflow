import {
  createAutomationSchema,
  describeAutomation,
  PRIORITIES,
  RECIPIENT_ROLES,
  SETTABLE_PROJECT_STATUSES,
  STATUS_CATEGORIES,
  type Action,
  type ActionType,
  type Condition,
  type ConditionField,
  type ConditionOp,
  type CreateAutomationInput,
  type Recipe,
  type RecipientRole,
  type Trigger,
  type TriggerType,
} from "@nexusflow/shared";
import { Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { errorMessage } from "../../lib/api";
import { useLabels, useProjects } from "../projects/hooks";
import { useAssignable } from "../tasks/hooks";
import { useCreateAutomation, useRecipes } from "./hooks";

// The three-step rule builder (PRD §11.15.4): when → if → then, with the
// sentence the rule reads as underneath.

const selectClass = "h-9 w-full rounded-control border bg-card px-2 text-sm";
const words = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");

const TRIGGER_LABELS: Record<TriggerType, string> = {
  TASK_CREATED: "A task is created",
  TASK_STATUS_CHANGED: "A task's status changes",
  TASK_ASSIGNED: "Someone is assigned",
  TASK_PRIORITY_CHANGED: "A task's priority changes",
  TASK_DUE_SOON: "A task is due soon",
  TASK_COMPLETED: "A task is completed",
  ALL_PROJECT_TASKS_COMPLETED: "Every task in the project is done",
  COMMENT_ADDED: "Someone comments",
};

const ACTION_LABELS: Record<ActionType, string> = {
  NOTIFY: "Notify",
  SEND_EMAIL: "Send an email",
  SET_STATUS: "Move to a status",
  SET_PRIORITY: "Set priority",
  SET_ASSIGNEES: "Assign people",
  ADD_LABEL: "Add a label",
  SET_DUE_DATE: "Set the due date",
  ADD_COMMENT: "Add a comment",
  UPDATE_PROJECT_STATUS: "Set the project status",
};

/** The fields the builder offers, and which comparisons make sense for each. */
const CONDITION_CHOICES: { field: ConditionField; label: string; ops: ConditionOp[] }[] = [
  { field: "status.category", label: "Status category", ops: ["eq", "neq"] },
  { field: "priority", label: "Priority", ops: ["eq", "neq", "gte", "lte"] },
  { field: "dueDate", label: "Due date", ops: ["isEmpty", "isNotEmpty", "lte", "gte"] },
  { field: "estimatedHours", label: "Estimate (hours)", ops: ["gte", "lte", "isEmpty"] },
  { field: "assigneeIds", label: "Assignees", ops: ["isEmpty", "isNotEmpty"] },
  { field: "labelIds", label: "Labels", ops: ["isEmpty", "isNotEmpty"] },
];
const OP_LABELS: Record<ConditionOp, string> = {
  eq: "is",
  neq: "is not",
  in: "is one of",
  notIn: "is none of",
  contains: "includes",
  gte: "is at least",
  lte: "is at most",
  isEmpty: "is empty",
  isNotEmpty: "is set",
};
const ROLE_LABELS: Record<RecipientRole, string> = {
  PROJECT_MANAGER: "Project managers",
  ORG_ADMINS: "Organization admins",
  ASSIGNEES: "Assignees",
  REPORTER: "Reporter",
};

function newAction(type: ActionType): Action {
  const recipients = { roles: ["ASSIGNEES" as RecipientRole], userIds: [] };
  switch (type) {
    case "NOTIFY":
      return { type, recipients, message: "Heads up about this task" };
    case "SEND_EMAIL":
      return { type, recipients, subject: "About your task", message: "Please take a look." };
    case "SET_STATUS":
      return { type, category: "DONE" };
    case "SET_PRIORITY":
      return { type, priority: "HIGH" };
    case "SET_ASSIGNEES":
      return { type, userIds: [], mode: "add" };
    case "ADD_LABEL":
      return { type, labelId: "" };
    case "SET_DUE_DATE":
      return { type, relativeDays: 3 };
    case "ADD_COMMENT":
      return { type, body: "" };
    case "UPDATE_PROJECT_STATUS":
      return { type, status: "COMPLETED" };
  }
}

function newTrigger(type: TriggerType): Trigger {
  if (type === "TASK_DUE_SOON") return { type, hours: 24 };
  return { type } as Trigger;
}

interface Draft {
  name: string;
  projectId: string | null;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
}

const emptyDraft = (projectId: string | null): Draft => ({
  name: "",
  projectId,
  trigger: { type: "TASK_COMPLETED" },
  conditions: [],
  actions: [newAction("NOTIFY")],
});

export function RuleBuilder({
  orgSlug,
  workspaceSlug,
  canManageWorkspace,
  onDone,
}: {
  orgSlug: string;
  workspaceSlug: string;
  /** Workspace admins may also make rules for every project at once. */
  canManageWorkspace: boolean;
  onDone: () => void;
}) {
  const { data: projects = [] } = useProjects(orgSlug, workspaceSlug);
  const { data: recipes = [] } = useRecipes(orgSlug);
  const create = useCreateAutomation(orgSlug, workspaceSlug);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(null));
  const [error, setError] = useState<string | null>(null);
  const projectId = draft.projectId ?? projects[0]?.id ?? null;
  const effective: Draft = {
    ...draft,
    projectId: draft.projectId ?? (canManageWorkspace ? null : projectId),
  };

  const parsed = createAutomationSchema.safeParse({
    ...effective,
    name: effective.name || "Untitled",
  });
  const summary = parsed.success ? describeAutomation(parsed.data) : null;
  const firstIssue = parsed.success ? null : parsed.error.issues[0]?.message;

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const applyRecipe = (recipe: Recipe) =>
    set({
      name: recipe.name,
      trigger: recipe.rule.trigger as Trigger,
      conditions: (recipe.rule.conditions ?? []) as Condition[],
      actions: recipe.rule.actions as Action[],
    });

  async function save() {
    setError(null);
    try {
      await create.mutateAsync({
        ...effective,
        name: effective.name.trim(),
      } as CreateAutomationInput);
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return (
    <div className="space-y-5">
      {recipes.length > 0 && (
        <div>
          <p className="text-sm font-medium">Start from a recipe</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recipes.map((recipe) => (
              <Button
                key={recipe.id}
                size="sm"
                variant="outline"
                onClick={() => applyRecipe(recipe)}
              >
                {recipe.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Name</span>
          <Input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Tell PMs when done"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Applies to</span>
          <select
            className={selectClass}
            value={effective.projectId ?? ""}
            onChange={(e) => set({ projectId: e.target.value || null })}
          >
            {canManageWorkspace && <option value="">Every project in this workspace</option>}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.key} · {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Step number={1} title="When">
        <TriggerEditor trigger={draft.trigger} onChange={(trigger) => set({ trigger })} />
      </Step>

      <Step number={2} title="If (optional, all must be true)">
        <div className="space-y-2">
          {draft.conditions.map((condition, index) => (
            <ConditionRow
              key={index}
              condition={condition}
              onChange={(next) =>
                set({ conditions: draft.conditions.map((c, i) => (i === index ? next : c)) })
              }
              onRemove={() => set({ conditions: draft.conditions.filter((_, i) => i !== index) })}
            />
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              set({
                conditions: [...draft.conditions, { field: "priority", op: "eq", value: "URGENT" }],
              })
            }
          >
            <Plus aria-hidden /> Add condition
          </Button>
        </div>
      </Step>

      <Step number={3} title="Then">
        <div className="space-y-3">
          {draft.actions.map((action, index) => (
            <ActionRow
              key={index}
              orgSlug={orgSlug}
              workspaceSlug={workspaceSlug}
              projectId={effective.projectId}
              action={action}
              onChange={(next) =>
                set({ actions: draft.actions.map((a, i) => (i === index ? next : a)) })
              }
              onRemove={
                draft.actions.length > 1
                  ? () => set({ actions: draft.actions.filter((_, i) => i !== index) })
                  : undefined
              }
            />
          ))}
          {draft.actions.length < 5 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => set({ actions: [...draft.actions, newAction("NOTIFY")] })}
            >
              <Plus aria-hidden /> Add action
            </Button>
          )}
        </div>
      </Step>

      <div className="rounded-control bg-surface px-3 py-2 text-sm" aria-live="polite">
        {summary ?? (
          <span className="text-muted-foreground">
            {firstIssue ?? "Finish the rule to see it as a sentence."}
          </span>
        )}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={() => void save()}
          disabled={!summary || !draft.name.trim() || create.isPending}
        >
          Save rule
        </Button>
      </div>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-card border p-3">
      <legend className="px-1 text-sm font-semibold">
        {number}. {title}
      </legend>
      {children}
    </fieldset>
  );
}

function TriggerEditor({
  trigger,
  onChange,
}: {
  trigger: Trigger;
  onChange: (trigger: Trigger) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <select
        aria-label="Trigger"
        className={selectClass}
        value={trigger.type}
        onChange={(e) => onChange(newTrigger(e.target.value as TriggerType))}
      >
        {Object.entries(TRIGGER_LABELS).map(([type, label]) => (
          <option key={type} value={type}>
            {label}
          </option>
        ))}
      </select>
      {trigger.type === "TASK_STATUS_CHANGED" && (
        <select
          aria-label="To status category"
          className={selectClass}
          value={trigger.toCategory ?? ""}
          onChange={(e) =>
            onChange({
              type: "TASK_STATUS_CHANGED",
              ...(e.target.value ? { toCategory: e.target.value as never } : {}),
            })
          }
        >
          <option value="">to any status</option>
          {STATUS_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              to {words(category)}
            </option>
          ))}
        </select>
      )}
      {trigger.type === "TASK_PRIORITY_CHANGED" && (
        <select
          aria-label="To priority"
          className={selectClass}
          value={trigger.to ?? ""}
          onChange={(e) =>
            onChange({
              type: "TASK_PRIORITY_CHANGED",
              ...(e.target.value ? { to: e.target.value as never } : {}),
            })
          }
        >
          <option value="">to any priority</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              to {words(priority)}
            </option>
          ))}
        </select>
      )}
      {trigger.type === "TASK_DUE_SOON" && (
        <label className="flex items-center gap-2 text-sm">
          within
          <Input
            type="number"
            min={1}
            max={168}
            className="w-20"
            value={trigger.hours}
            onChange={(e) =>
              onChange({ type: "TASK_DUE_SOON", hours: Number(e.target.value) || 24 })
            }
          />
          hours
        </label>
      )}
    </div>
  );
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: Condition;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
}) {
  const choice =
    CONDITION_CHOICES.find((c) => c.field === condition.field) ?? CONDITION_CHOICES[0]!;
  const needsValue = condition.op !== "isEmpty" && condition.op !== "isNotEmpty";
  const valueOptions =
    condition.field === "priority"
      ? PRIORITIES
      : condition.field === "status.category"
        ? STATUS_CATEGORIES
        : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Field"
        className={`${selectClass} w-auto`}
        value={condition.field}
        onChange={(e) => {
          const next = CONDITION_CHOICES.find((c) => c.field === e.target.value)!;
          const op = next.ops[0]!;
          onChange({
            field: next.field,
            op,
            ...(op === "isEmpty" || op === "isNotEmpty"
              ? {}
              : {
                  value:
                    next.field === "priority"
                      ? "HIGH"
                      : next.field === "status.category"
                        ? "DONE"
                        : "",
                }),
          });
        }}
      >
        {CONDITION_CHOICES.map((c) => (
          <option key={c.field} value={c.field}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Comparison"
        className={`${selectClass} w-auto`}
        value={condition.op}
        onChange={(e) => {
          const op = e.target.value as ConditionOp;
          const { value, ...rest } = condition;
          onChange(
            op === "isEmpty" || op === "isNotEmpty"
              ? { ...rest, op }
              : { ...rest, op, value: value ?? "" },
          );
        }}
      >
        {choice.ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>
      {needsValue &&
        (valueOptions ? (
          <select
            aria-label="Value"
            className={`${selectClass} w-auto`}
            value={String(condition.value ?? "")}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
          >
            {valueOptions.map((option) => (
              <option key={option} value={option}>
                {words(option)}
              </option>
            ))}
          </select>
        ) : (
          <Input
            aria-label="Value"
            className="w-40"
            type={condition.field === "dueDate" ? "date" : "number"}
            value={String(condition.value ?? "")}
            onChange={(e) =>
              onChange({
                ...condition,
                value: condition.field === "dueDate" ? e.target.value : Number(e.target.value),
              })
            }
          />
        ))}
      <Button size="icon-sm" variant="ghost" aria-label="Remove condition" onClick={onRemove}>
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}

function ActionRow({
  orgSlug,
  workspaceSlug,
  projectId,
  action,
  onChange,
  onRemove,
}: {
  orgSlug: string;
  workspaceSlug: string;
  projectId: string | null;
  action: Action;
  onChange: (action: Action) => void;
  onRemove: (() => void) | undefined;
}) {
  return (
    <div className="space-y-2 rounded-control border p-2">
      <div className="flex items-center gap-2">
        <select
          aria-label="Action"
          className={selectClass}
          value={action.type}
          onChange={(e) => onChange(newAction(e.target.value as ActionType))}
        >
          {Object.entries(ACTION_LABELS).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
        {onRemove && (
          <Button size="icon-sm" variant="ghost" aria-label="Remove action" onClick={onRemove}>
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
      <ActionFields
        orgSlug={orgSlug}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        action={action}
        onChange={onChange}
      />
    </div>
  );
}

function ActionFields({
  orgSlug,
  workspaceSlug,
  projectId,
  action,
  onChange,
}: {
  orgSlug: string;
  workspaceSlug: string;
  projectId: string | null;
  action: Action;
  onChange: (action: Action) => void;
}) {
  const labels = useLabels(orgSlug, workspaceSlug).data?.labels ?? [];
  switch (action.type) {
    case "NOTIFY":
    case "SEND_EMAIL":
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3 text-sm">
            {RECIPIENT_ROLES.map((role) => (
              <label key={role} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={action.recipients.roles.includes(role)}
                  onChange={(e) =>
                    onChange({
                      ...action,
                      recipients: {
                        ...action.recipients,
                        roles: e.target.checked
                          ? [...action.recipients.roles, role]
                          : action.recipients.roles.filter((r) => r !== role),
                      },
                    })
                  }
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
          {action.type === "SEND_EMAIL" && (
            <Input
              aria-label="Email subject"
              value={action.subject}
              onChange={(e) => onChange({ ...action, subject: e.target.value })}
            />
          )}
          <Input
            aria-label="Message"
            value={action.message}
            onChange={(e) => onChange({ ...action, message: e.target.value })}
          />
        </div>
      );
    case "SET_STATUS":
      return (
        <select
          aria-label="Status category"
          className={selectClass}
          value={action.category ?? "DONE"}
          onChange={(e) => onChange({ type: "SET_STATUS", category: e.target.value as never })}
        >
          {STATUS_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              First {words(category)} column
            </option>
          ))}
        </select>
      );
    case "SET_PRIORITY":
      return (
        <select
          aria-label="Priority"
          className={selectClass}
          value={action.priority}
          onChange={(e) => onChange({ ...action, priority: e.target.value as never })}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {words(priority)}
            </option>
          ))}
        </select>
      );
    case "SET_ASSIGNEES":
      return projectId ? (
        <AssigneePicker
          orgSlug={orgSlug}
          projectId={projectId}
          action={action}
          onChange={onChange}
        />
      ) : (
        <p className="text-xs text-muted-foreground">Pick one project to choose people.</p>
      );
    case "ADD_LABEL":
      return (
        <select
          aria-label="Label"
          className={selectClass}
          value={action.labelId}
          onChange={(e) => onChange({ ...action, labelId: e.target.value })}
        >
          <option value="">Choose a label</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>
      );
    case "SET_DUE_DATE":
      return (
        <label className="flex items-center gap-2 text-sm">
          <Input
            type="number"
            min={0}
            max={365}
            className="w-20"
            value={action.relativeDays ?? 0}
            onChange={(e) =>
              onChange({ type: "SET_DUE_DATE", relativeDays: Number(e.target.value) || 0 })
            }
          />
          days after the rule runs
        </label>
      );
    case "ADD_COMMENT":
      return (
        <textarea
          aria-label="Comment"
          className="min-h-16 w-full rounded-control border bg-card px-2 py-1.5 text-sm"
          value={action.body}
          onChange={(e) => onChange({ ...action, body: e.target.value })}
        />
      );
    case "UPDATE_PROJECT_STATUS":
      return (
        <select
          aria-label="Project status"
          className={selectClass}
          value={action.status}
          onChange={(e) => onChange({ ...action, status: e.target.value as never })}
        >
          {SETTABLE_PROJECT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {words(status)}
            </option>
          ))}
        </select>
      );
  }
}

function AssigneePicker({
  orgSlug,
  projectId,
  action,
  onChange,
}: {
  orgSlug: string;
  projectId: string;
  action: Extract<Action, { type: "SET_ASSIGNEES" }>;
  onChange: (action: Action) => void;
}) {
  const { data: people = [] } = useAssignable(orgSlug, projectId);
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {people.map((person) => (
        <label key={person.id} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={action.userIds.includes(person.id)}
            onChange={(e) =>
              onChange({
                ...action,
                userIds: e.target.checked
                  ? [...action.userIds, person.id]
                  : action.userIds.filter((id) => id !== person.id),
              })
            }
          />
          {person.name}
        </label>
      ))}
    </div>
  );
}
