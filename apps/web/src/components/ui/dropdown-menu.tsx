import { Check } from "lucide-react";
import { DropdownMenu as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

// A menu that opens from a button. Radix handles keyboard use (arrow keys,
// Enter, Escape), focus and screen readers; these wrappers only add styling.

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-52 overflow-hidden rounded-card border bg-card p-1 text-foreground shadow-lg",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}

const itemClasses =
  "relative flex cursor-default select-none items-center gap-2 rounded-[5px] px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn(itemClasses, className)} {...props} />;
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem className={cn(itemClasses, "pr-8", className)} {...props}>
      {children}
      <Primitive.ItemIndicator className="absolute right-2">
        <Check />
      </Primitive.ItemIndicator>
    </Primitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      className={cn("px-2 py-1.5 text-xs font-semibold text-muted-foreground", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
