import { Dialog as Primitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

// A centered pop-up window (Radix dialog): focus stays inside while open,
// Escape or a click on the dimmed background closes it.

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

interface DialogContentProps {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}

export function DialogContent({ title, description, className, children }: DialogContentProps) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
      <Primitive.Content
        // Without a description, tell Radix on purpose (it warns otherwise).
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-dialog border bg-card p-6 shadow-xl focus:outline-none",
          className,
        )}
      >
        <Primitive.Title className="text-lg font-semibold">{title}</Primitive.Title>
        {description && (
          <Primitive.Description className="mt-1 text-sm text-muted-foreground">
            {description}
          </Primitive.Description>
        )}
        <div className="mt-5">{children}</div>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
