import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router";
import { PageSkeleton } from "../components/common/PageSkeleton";
import { Sheet, SheetContent } from "../components/ui/sheet";
import { TooltipProvider } from "../components/ui/tooltip";
import { FullPageLoader, ServerUnavailable } from "../features/auth/guards";
import { useCurrentUser } from "../features/auth/hooks";
import { useOrgContext, useRememberWorkspace } from "../features/organizations/hooks";
import { NoWorkspacePage } from "../features/organizations/NoWorkspacePage";
import { useRealtimeSync } from "../features/realtime/useRealtime";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import { useWorkspace } from "../hooks/useWorkspace";
import { ApiError } from "../lib/api";
import { cn } from "../lib/utils";
import { NotFoundPage } from "../pages/NotFoundPage";
import { SidebarContent } from "./Sidebar";
import { TopBar } from "./TopBar";

/** Saves the workspace in the address as "last opened", once per change. */
function useRememberOpenedWorkspace(workspaceId: string | undefined) {
  const { data: user } = useCurrentUser();
  const remember = useRememberWorkspace();
  const { mutate } = remember;
  const lastId = user?.lastActiveWorkspaceId;
  useEffect(() => {
    if (workspaceId && workspaceId !== lastId) mutate(workspaceId);
  }, [workspaceId, lastId, mutate]);
}

// The frame around every signed-in page (PRD §14.1): sidebar on the left
// (a slide-out drawer on phones), top bar, and the current page in the middle.
export function AppShell() {
  const { orgSlug, workspaceSlug } = useParams();
  const orgContext = useOrgContext(orgSlug);
  const context = useWorkspace();
  useRememberOpenedWorkspace(workspaceSlug ? context?.workspace.id : undefined);
  // Live updates for the open organization and workspace (PRD §11.8).
  useRealtimeSync(context);
  const { collapsed, toggle } = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Close the phone drawer after moving to another page.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  // Ctrl+K (⌘K on Mac) jumps to search from anywhere (PRD §14.6).
  const searchPath = context?.path("search");
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (searchPath && event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        navigate(searchPath);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, searchPath]);

  if (orgContext.isPending) return <FullPageLoader />;
  if (orgContext.isError) {
    const notMember = orgContext.error instanceof ApiError && orgContext.error.status === 404;
    return notMember ? (
      <NotFoundPage />
    ) : (
      <ServerUnavailable retry={() => void orgContext.refetch()} />
    );
  }
  if (!context) {
    // A workspace in the address that does not exist, or a guest with no workspace.
    return workspaceSlug ? (
      <NotFoundPage />
    ) : (
      <NoWorkspacePage organizationName={orgContext.data.organization.name} />
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-card focus:px-3 focus:py-2 focus:shadow-lg"
      >
        Skip to content
      </a>

      <div className="flex h-dvh bg-background">
        <aside
          aria-label="Sidebar"
          className={cn(
            "hidden shrink-0 border-r bg-surface transition-[width] duration-200 md:block",
            collapsed ? "w-16" : "w-60",
          )}
        >
          <SidebarContent context={context} collapsed={collapsed} onToggleCollapse={toggle} />
        </aside>

        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent title="Navigation">
            <SidebarContent context={context} collapsed={false} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar context={context} onOpenMenu={() => setDrawerOpen(true)} />
          <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
