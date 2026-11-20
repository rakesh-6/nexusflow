import {
  ChartColumn,
  FolderKanban,
  FolderPlus,
  History,
  House,
  Inbox,
  ListTodo,
  MessageSquare,
  Search,
  Settings,
  SquareCheckBig,
  SquarePen,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Dialog as Primitive } from "radix-ui";
import { useDeferredValue, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useSearch } from "../features/insights/hooks";
import { useProjects } from "../features/projects/hooks";
import type { WorkspaceContext } from "../hooks/useWorkspace";
import { cn } from "../lib/utils";

// The command palette (PRD §11.13, §14.6): Ctrl+K / ⌘K anywhere. Type to jump
// to a page, run an action or search; arrow keys choose, Enter opens. Built on
// the app's dialog, so it needs no extra library.

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  path: string;
  group: string;
}

const RECENT_KEY = "nf-palette-recent";

function readRecent(): Command[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Command[]).slice(0, 5);
  } catch {
    return [];
  }
}

function remember(command: Command) {
  try {
    const recent = [command, ...readRecent().filter((item) => item.path !== command.path)].slice(
      0,
      5,
    );
    // Icons are functions and cannot be stored; the recent list uses one icon.
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(recent.map((item) => ({ ...item, icon: undefined }))),
    );
  } catch {
    // Storage can be blocked; the palette works without a recent list.
  }
}

const SEARCH_ICONS: Record<string, LucideIcon> = {
  task: SquareCheckBig,
  project: FolderKanban,
  team: Users,
  user: User,
  comment: MessageSquare,
};

export function CommandPalette({
  context,
  open,
  onOpenChange,
}: {
  context: WorkspaceContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { projectKey } = useParams();
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const q = useDeferredValue(text.trim());
  const search = useSearch(context.organization.slug, q.length >= 2 ? q : "", context.workspace.id);
  const { data: projects = [] } = useProjects(context.organization.slug, context.workspace.slug);

  useEffect(() => {
    if (open) {
      setText("");
      setActive(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const pages: Command[] = [
      { id: "home", label: "Home", icon: House, path: context.path("home"), group: "Go to" },
      {
        id: "my",
        label: "My tasks",
        icon: ListTodo,
        path: context.path("my-tasks"),
        group: "Go to",
      },
      { id: "inbox", label: "Inbox", icon: Inbox, path: context.path("inbox"), group: "Go to" },
      {
        id: "projects",
        label: "Projects",
        icon: FolderKanban,
        path: context.path("projects"),
        group: "Go to",
      },
      { id: "teams", label: "Teams", icon: Users, path: context.path("teams"), group: "Go to" },
      {
        id: "insights",
        label: "Insights",
        icon: ChartColumn,
        path: context.path("insights"),
        group: "Go to",
      },
      {
        id: "settings",
        label: "Settings",
        icon: Settings,
        path: context.settingsPath("profile"),
        group: "Go to",
      },
      ...(projectKey
        ? [
            {
              id: "new-task",
              label: "New task",
              hint: "C",
              icon: SquarePen,
              path: `${context.path(`projects/${projectKey}/board`)}?newTask=1`,
              group: "Actions",
            },
          ]
        : []),
      {
        id: "new-project",
        label: "New project",
        icon: FolderPlus,
        path: context.path("projects?new=1"),
        group: "Actions",
      },
      ...projects.slice(0, 20).map((project) => ({
        id: `project-${project.id}`,
        label: project.name,
        hint: project.key,
        icon: FolderKanban,
        path: context.path(`projects/${project.key}/board`),
        group: "Projects",
      })),
    ];
    const needle = q.toLowerCase();
    const matching = needle
      ? pages.filter((command) =>
          `${command.label} ${command.hint ?? ""}`.toLowerCase().includes(needle),
        )
      : pages.filter((command) => command.group !== "Projects");
    const recent = needle
      ? []
      : readRecent().map((command) => ({ ...command, icon: History, group: "Recent" }));
    const found = search.data
      ? (["task", "project", "team", "user", "comment"] as const).flatMap((type) =>
          search.data[type].items.map((item) => ({
            id: `${type}-${item.id}`,
            label: item.title,
            hint: item.subtitle ?? undefined,
            icon: SEARCH_ICONS[type] ?? Search,
            path: item.path,
            group: "Search results",
          })),
        )
      : [];
    const all = [...recent, ...matching, ...found];
    if (needle) {
      all.push({
        id: "search-all",
        label: `See all results for “${q}”`,
        icon: Search,
        path: `${context.path("search")}?q=${encodeURIComponent(q)}`,
        group: "Search",
      });
    }
    return all;
  }, [context, projectKey, projects, q, search.data]);

  const choose = (command: Command | undefined) => {
    if (!command) return;
    if (command.group === "Search results" || command.group === "Projects") remember(command);
    onOpenChange(false);
    navigate(command.path);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + commands.length) % Math.max(commands.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(commands[active]);
    }
  };

  let lastGroup = "";
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Primitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-dialog border bg-card shadow-2xl focus:outline-none"
        >
          <Primitive.Title className="sr-only">Command palette</Primitive.Title>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-list"
              aria-activedescendant={
                commands[active] ? `palette-${commands[active].id}` : undefined
              }
              aria-label="Type a command or search"
              placeholder="Type a command or search…"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border bg-surface px-1.5 text-[11px] text-muted-foreground">
              Esc
            </kbd>
          </div>
          <ul
            id="palette-list"
            role="listbox"
            aria-label="Commands"
            className="max-h-[50vh] overflow-y-auto p-1"
          >
            {commands.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {search.isFetching ? "Searching…" : "Nothing found"}
              </li>
            )}
            {commands.map((command, index) => {
              const header = command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              return (
                <li key={command.id} role="presentation">
                  {header && (
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">
                      {header}
                    </p>
                  )}
                  <button
                    type="button"
                    id={`palette-${command.id}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(command)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[6px] px-3 py-2 text-left text-sm",
                      index === active && "bg-surface",
                    )}
                  >
                    <command.icon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.hint && (
                      <span className="max-w-40 truncate text-xs text-muted-foreground">
                        {command.hint}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
