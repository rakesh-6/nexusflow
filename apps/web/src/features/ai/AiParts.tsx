import { AI_LABEL } from "@nexusflow/shared";
import { Loader2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { errorMessage } from "../../lib/api";
import { useAiNotice } from "./hooks";

// Small building blocks every AI feature uses: the button, the first-use
// privacy notice and the labelled preview with accept / discard.

/** "✨ Draft description" style button; shows a spinner while waiting. */
export function AiButton({
  children,
  onClick,
  busy,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={busy || disabled}>
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
      {children}
    </Button>
  );
}

/** Shows the privacy notice once; the AI buttons inside appear after "Got it". */
export function AiGate({ children }: { children: ReactNode }) {
  const notice = useAiNotice();
  return notice.seen ? <>{children}</> : <AiNotice onAccept={notice.accept} />;
}

function AiNotice({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="max-w-md rounded-control border bg-surface p-3 text-sm">
      <p className="font-medium">Before you use AI</p>
      <p className="mt-1 text-muted-foreground">
        When you click an AI button, NexusFlow sends only what that feature needs (for example a
        task's title and description) to Google Gemini. Never files, emails or other organizations'
        data. Its answer is a suggestion you review before anything is saved.
      </p>
      <Button size="sm" className="mt-2" onClick={onAccept}>
        Got it
      </Button>
    </div>
  );
}

/** An AI answer waiting for the person to accept, edit or discard it. */
export function AiPreview({
  title,
  children,
  onAccept,
  acceptLabel,
  onDiscard,
  accepting = false,
}: {
  title: string;
  children: ReactNode;
  onAccept?: () => void;
  acceptLabel?: string;
  onDiscard: () => void;
  accepting?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-control border border-primary/40 bg-primary/5 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium">
        <Sparkles className="size-4 text-primary" aria-hidden /> {title}
      </p>
      <p className="text-xs text-muted-foreground">{AI_LABEL}</p>
      <div>{children}</div>
      <div className="flex flex-wrap gap-2 pt-1">
        {onAccept && (
          <Button size="sm" onClick={onAccept} disabled={accepting}>
            {accepting && <Loader2 className="animate-spin" aria-hidden />}
            {acceptLabel ?? "Use this"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}

export function AiError({ error }: { error: unknown }) {
  return error ? <Alert variant="error">{errorMessage(error)}</Alert> : null;
}
