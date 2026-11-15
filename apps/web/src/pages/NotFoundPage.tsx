import { Compass } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "../components/common/EmptyState";
import { Button } from "../components/ui/button";

// Shown for addresses that do not exist, or that name an organization or
// workspace you cannot see. The wording never reveals which one (PRD §20.2).
export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="This page does not exist, or you do not have access to it."
        action={
          <Button asChild>
            <Link to="/">Go to home</Link>
          </Button>
        }
      />
    </div>
  );
}
