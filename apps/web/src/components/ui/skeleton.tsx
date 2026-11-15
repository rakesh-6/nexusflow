import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

// A gently pulsing grey block that holds a place while content loads (PRD §14.4).
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-control bg-border/70", className)}
      {...props}
    />
  );
}
