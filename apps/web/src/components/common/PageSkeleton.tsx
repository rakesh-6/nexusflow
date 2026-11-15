import { Skeleton } from "../ui/skeleton";

// Shown while a page's code is still downloading. Its shape matches a real page
// (title, description, cards), so nothing jumps when the page appears.
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6" role="status">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
      </div>
      <Skeleton className="h-64 rounded-card" />
    </div>
  );
}
