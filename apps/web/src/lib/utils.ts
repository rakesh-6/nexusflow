import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge needs to know our custom corner sizes (rounded-control,
// rounded-card, rounded-dialog from index.css) to resolve conflicts between them.
const twMerge = extendTailwindMerge({
  extend: { theme: { radius: ["control", "card", "dialog"] } },
});

/**
 * Joins class names and lets later classes win over earlier ones:
 * cn("px-2 bg-card", isActive && "bg-primary") -> "px-2 bg-primary".
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
