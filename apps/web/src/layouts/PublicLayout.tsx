import { Suspense } from "react";
import { Link, Outlet } from "react-router";
import { PageSkeleton } from "../components/common/PageSkeleton";

// Frame for pages people see before signing in: login, sign-up, pricing...
export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="px-4 py-4 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="text-lg font-semibold tracking-tight">NexusFlow</span>
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-8 sm:py-16">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
