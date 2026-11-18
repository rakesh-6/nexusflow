import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { PageHeader } from "./PageHeader";

/** The column every settings page uses: its title, then its sections. */
export function SettingsPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}

// One card on a settings page: a title, one line of explanation, the content.
// `danger` gives it the red border used for actions that cannot be undone.
export function SettingsSection({
  title,
  description,
  children,
  danger = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  danger?: boolean;
}) {
  const id = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heading`;
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "rounded-card border bg-card p-5 shadow-sm sm:p-6",
        danger && "border-destructive/40",
      )}
    >
      <h2 id={id} className={cn("text-base font-semibold", danger && "text-destructive")}>
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
