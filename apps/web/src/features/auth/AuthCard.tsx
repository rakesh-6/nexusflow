import type { ReactNode } from "react";

// The white card that holds every sign-in page: title, short explanation,
// the form, and links underneath ("Forgot password?", "Create an account").
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="w-full max-w-sm">
      <div className="rounded-dialog border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && (
        <div className="mt-5 text-center text-sm text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_a:hover]:underline">
          {footer}
        </div>
      )}
    </div>
  );
}
