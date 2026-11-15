import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional button or link, e.g. "Create your first project". */
  action?: ReactNode;
  className?: string;
}

// What a page shows when it has nothing to list yet (PRD §14.4):
// an icon, one line that explains, and the main next step.
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-card border border-dashed bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-surface">
        <Icon className="size-6 text-primary" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
