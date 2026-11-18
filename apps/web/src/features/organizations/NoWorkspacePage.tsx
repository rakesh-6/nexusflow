import { DoorOpen } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { EmptyState } from "../../components/common/EmptyState";
import { Button } from "../../components/ui/button";
import { useLogout } from "../auth/hooks";

// Guests belong to an organization without seeing any workspace: they only
// see projects shared with them, which arrive with projects in Phase 4.
export function NoWorkspacePage({ organizationName }: { organizationName: string }) {
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <EmptyState
        icon={DoorOpen}
        title={`You're a guest in ${organizationName}`}
        description="Guests see only the projects shared with them. Nothing has been shared with you yet."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/onboarding">Create your own organization</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })
              }
            >
              Log out
            </Button>
          </div>
        }
      />
    </div>
  );
}
