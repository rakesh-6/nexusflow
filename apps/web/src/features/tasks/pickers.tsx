import type { LabelSummary, PersonSummary } from "@nexusflow/shared";
import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { UserAvatar } from "../../components/common/UserAvatar";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { cn } from "../../lib/utils";

// Pick several people or labels from a searchable list. Changes are kept
// while the list is open and saved once when it closes, so ticking three
// boxes sends one request, not three.

interface Option {
  id: string;
  name: string;
  icon: ReactNode;
}

function ChecklistPicker({
  label,
  options,
  selected,
  onChange,
  disabled,
  trigger,
  emptyText,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  trigger: ReactNode;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const [search, setSearch] = useState("");
  const shown = options.filter((option) =>
    option.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const changeOpen = (next: boolean) => {
    if (next) {
      setDraft(selected);
      setSearch("");
    } else if ([...draft].sort().join() !== [...selected].sort().join()) {
      onChange(draft);
    }
    setOpen(next);
  };
  const toggle = (id: string) =>
    setDraft((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={label}
        className="flex min-h-8 w-full items-center rounded-control px-1.5 text-left text-sm hover:bg-surface disabled:pointer-events-none"
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent>
        <Input
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="mb-2 h-8"
        />
        <ul className="max-h-60 overflow-y-auto" aria-label={label}>
          {shown.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</li>
          )}
          {shown.map((option) => {
            const checked = draft.includes(option.id);
            return (
              <li key={option.id}>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  onClick={() => toggle(option.id)}
                  className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-sm hover:bg-surface"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                      checked && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {checked && <Check className="size-3" />}
                  </span>
                  {option.icon}
                  <span className="truncate">{option.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function PeoplePicker({
  people,
  selected,
  onChange,
  disabled,
  label = "Assignees",
  trigger,
}: {
  people: PersonSummary[];
  selected: PersonSummary[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  label?: string;
  trigger?: ReactNode;
}) {
  // People already assigned stay listed even if they can no longer be picked.
  const all = [...people, ...selected.filter((s) => !people.some((p) => p.id === s.id))];
  return (
    <ChecklistPicker
      label={label}
      disabled={disabled}
      selected={selected.map((person) => person.id)}
      onChange={onChange}
      emptyText="Nobody found"
      options={all.map((person) => ({
        id: person.id,
        name: person.name,
        icon: <UserAvatar name={person.name} avatarUrl={person.avatarUrl} className="size-5" />,
      }))}
      trigger={
        trigger ??
        (selected.length ? (
          <span className="flex flex-wrap gap-1.5">
            {selected.map((person) => (
              <span key={person.id} className="flex items-center gap-1.5">
                <UserAvatar name={person.name} avatarUrl={person.avatarUrl} className="size-5" />
                {person.name}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">Nobody</span>
        ))
      }
    />
  );
}

export function LabelPicker({
  labels,
  selected,
  onChange,
  disabled,
  trigger,
}: {
  labels: LabelSummary[];
  selected: LabelSummary[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  trigger?: ReactNode;
}) {
  return (
    <ChecklistPicker
      label="Labels"
      disabled={disabled}
      selected={selected.map((label) => label.id)}
      onChange={onChange}
      emptyText="No labels. Workspace admins add them in Workspace settings."
      options={labels.map((label) => ({
        id: label.id,
        name: label.name,
        icon: (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: label.color }}
            aria-hidden="true"
          />
        ),
      }))}
      trigger={
        trigger ??
        (selected.length ? (
          <span className="flex flex-wrap gap-1">
            {selected.map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center gap-1 rounded-full border bg-surface px-1.5 py-0.5 text-xs"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: label.color }}
                  aria-hidden="true"
                />
                {label.name}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">None</span>
        ))
      }
    />
  );
}
