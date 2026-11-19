import { Popover as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

// A small floating panel attached to a button (Radix popover): Escape or a
// click outside closes it, and focus moves inside while it is open.

export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverClose = Primitive.Close;

export function PopoverContent({
  className,
  sideOffset = 6,
  align = "start",
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 w-64 rounded-card border bg-card p-2 text-foreground shadow-lg focus:outline-none",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
