import type { SearchType } from "@nexusflow/shared";
import {
  FolderKanban,
  MessageSquare,
  Search,
  SquareCheckBig,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { EmptyState } from "../../components/common/EmptyState";
import { PageHeader } from "../../components/common/PageHeader";
import { Alert } from "../../components/ui/alert";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useSearch } from "./hooks";

// /:org/:ws/search?q= (PRD §11.13): tasks, projects, teams, people and
// comments you can open. Ctrl+K (⌘K) from anywhere comes here.

const GROUPS: { type: SearchType; title: string; icon: LucideIcon }[] = [
  { type: "task", title: "Tasks", icon: SquareCheckBig },
  { type: "project", title: "Projects", icon: FolderKanban },
  { type: "team", title: "Teams", icon: Users },
  { type: "user", title: "People", icon: User },
  { type: "comment", title: "Comments", icon: MessageSquare },
];

export default function SearchPage() {
  const context = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const q = useDeferredValue(text.trim());
  const results = useSearch(context?.organization.slug ?? "", q);

  // Keep the address in step, so a search can be bookmarked or shared.
  useEffect(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (q) next.set("q", q);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  }, [q, setParams]);

  if (!context) return null;
  const total = results.data
    ? GROUPS.reduce((sum, group) => sum + results.data[group.type].total, 0)
    : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title="Search"
        description={`Everything you can open in ${context.organization.name}.`}
      />
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          autoFocus
          type="search"
          aria-label="Search"
          placeholder="Search tasks (or a key like NEX-42), projects, teams, people, comments"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="pl-9"
        />
      </div>
      {results.isError && <Alert variant="error">Search failed. Please try again.</Alert>}
      {!q ? (
        <EmptyState icon={Search} title="Start typing" description="Results appear as you type." />
      ) : !results.data ? (
        <Skeleton className="h-48" />
      ) : total === 0 ? (
        <EmptyState icon={Search} title="Nothing found" description={`Nothing matches “${q}”.`} />
      ) : (
        GROUPS.filter((group) => results.data[group.type].items.length > 0).map((group) => {
          const block = results.data[group.type];
          return (
            <section key={group.type} aria-label={group.title}>
              <h2 className="mb-2 text-sm font-semibold">
                {group.title}{" "}
                <span className="font-normal text-muted-foreground">
                  ·{" "}
                  {block.total > block.items.length
                    ? `${block.items.length} of ${block.total}`
                    : block.total}
                </span>
              </h2>
              <ul className="divide-y rounded-card border bg-card">
                {block.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.path}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface"
                    >
                      <group.icon
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{item.title}</span>
                        {item.subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
