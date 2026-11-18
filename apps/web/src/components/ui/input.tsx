import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

// A text box. aria-invalid (set by FormField when there is an error) turns the
// border red, so the error is visible and announced to screen readers.
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-control border bg-card px-3 text-sm transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-ring disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
