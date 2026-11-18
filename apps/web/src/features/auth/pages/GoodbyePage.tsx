import { HeartHandshake } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../../../components/ui/button";
import { AuthCard } from "../AuthCard";

// Shown after an account is deleted (PRD §13.14).
export default function GoodbyePage() {
  return (
    <AuthCard title="Your account was deleted">
      <div className="flex flex-col items-center gap-4 text-center">
        <HeartHandshake className="size-10 text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Your personal data was removed and you were signed out everywhere. Thank you for trying
          NexusFlow.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link to="/register">Create a new account</Link>
        </Button>
      </div>
    </AuthCard>
  );
}
