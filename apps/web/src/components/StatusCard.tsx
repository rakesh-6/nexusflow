export type CheckState =
  { status: "checking" } | { status: "ok"; detail: string } | { status: "error"; detail: string };

const STYLES = {
  checking: { dot: "bg-muted-foreground animate-pulse", label: "Checking…" },
  ok: { dot: "bg-success", label: "Working" },
  error: { dot: "bg-destructive", label: "Not working" },
} as const;

interface StatusCardProps {
  title: string;
  description: string;
  state: CheckState;
}

// One service's health: a colored dot, a word, and the detail from the API.
export function StatusCard({ title, description, state }: StatusCardProps) {
  const style = STYLES[state.status];
  return (
    <div className="rounded-card border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <span className={`size-2.5 rounded-full ${style.dot}`} aria-hidden="true" />
          {style.label}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <p className="mt-3 min-h-5 text-sm tabular-nums">
        {state.status === "checking" ? "Asking the server…" : state.detail}
      </p>
    </div>
  );
}
