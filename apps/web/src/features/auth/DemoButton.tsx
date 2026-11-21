import { Loader2, PlayCircle } from "lucide-react";
import { useNavigate } from "react-router";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { errorMessage } from "../../lib/api";
import { useAuthProviders } from "./GoogleButton";
import { useStartDemo } from "./hooks";

// "Try the demo" on the login page (PRD §26.8): one click, no sign-up, signed in
// as an admin of the sample organization "Acme Studio".
export function DemoButton() {
  const { data } = useAuthProviders();
  const start = useStartDemo();
  const navigate = useNavigate();
  if (!data?.demo) return null;
  return (
    <div className="mb-5 space-y-2">
      <Button
        type="button"
        className="w-full"
        disabled={start.isPending}
        onClick={() =>
          start.mutate(undefined, { onSuccess: ({ orgSlug }) => navigate(`/${orgSlug}`) })
        }
      >
        {start.isPending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <PlayCircle aria-hidden />
        )}
        Try the demo, no sign-up
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        You join the sample company “Acme Studio” as an admin. It resets every day.
      </p>
      {start.isError && <Alert variant="error">{errorMessage(start.error)}</Alert>}
    </div>
  );
}
