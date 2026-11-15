import { Tooltip as Primitive } from "radix-ui";
import type { ReactElement } from "react";

// Wrap the app once so all tooltips share the same opening delay.
export const TooltipProvider = Primitive.Provider;

interface TooltipProps {
  content: string;
  side?: "top" | "right" | "bottom" | "left";
  /** One element (a button or link) that shows the tooltip on hover or keyboard focus. */
  children: ReactElement;
}

// A small label that appears next to an element, e.g. on icon-only sidebar buttons.
export function Tooltip({ content, side = "right", children }: TooltipProps) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          side={side}
          sideOffset={8}
          className="z-50 rounded-control bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md"
        >
          {content}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
