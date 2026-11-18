import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

const VARIANTS = {
  error: {
    icon: CircleAlert,
    classes: "border-destructive/40 bg-destructive/10 text-foreground",
    iconClass: "text-destructive",
  },
  success: {
    icon: CircleCheck,
    classes: "border-success/40 bg-success/10 text-foreground",
    iconClass: "text-success",
  },
  info: {
    icon: Info,
    classes: "border-info/40 bg-info/10 text-foreground",
    iconClass: "text-info",
  },
} as const;

// A colored message box. Errors use role="alert" so screen readers read them at once.
export function Alert({
  variant = "info",
  children,
  className,
}: {
  variant?: keyof typeof VARIANTS;
  children: ReactNode;
  className?: string;
}) {
  const { icon: Icon, classes, iconClass } = VARIANTS[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("flex gap-2.5 rounded-control border px-3 py-2.5 text-sm", classes, className)}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
