import { Dialog as Primitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

// A panel that slides in from the left edge, used for the sidebar on phones.
// It is a Radix dialog: focus stays inside while open, Escape or a click on
// the dimmed background closes it, and screen readers announce its title.

export const Sheet = Primitive.Root;

interface SheetContentProps {
  /** Read by screen readers; not shown on screen. */
  title: string;
  className?: string;
  children: ReactNode;
}

export function SheetContent({ title, className, children }: SheetContentProps) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
      <Primitive.Content
        aria-describedby={undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-surface shadow-xl focus:outline-none",
          className,
        )}
      >
        <Primitive.Title className="sr-only">{title}</Primitive.Title>
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
