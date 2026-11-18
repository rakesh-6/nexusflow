import { useId, type ReactNode } from "react";
import type { FieldValues, Path, UseFormRegister, UseFormSetError } from "react-hook-form";
import { ApiError } from "../../lib/api";
import { Input } from "../ui/input";

interface FormFieldProps<T extends FieldValues> {
  name: Path<T>;
  label: string;
  register: UseFormRegister<T>;
  error?: string;
  hint?: ReactNode;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}

// A labeled text box with its error message underneath (PRD §14.4). The label,
// hint and error are linked to the box so screen readers read them together.
export function FormField<T extends FieldValues>({
  name,
  label,
  register,
  error,
  hint,
  type = "text",
  autoComplete,
  autoFocus,
}: FormFieldProps<T>) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        {...register(name)}
      />
      {error ? (
        <p id={messageId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Puts the server's field errors (for example "body.email: already taken")
 * under the matching form fields. Returns the message to show above the form
 * when the error is not about one specific field.
 */
export function showServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (!(error instanceof ApiError)) return "Something went wrong. Please try again.";
  let placed = false;
  for (const issue of error.details) {
    const field = issue.path.replace(/^body\./, "") as Path<T>;
    if (fields.includes(field)) {
      setError(field, { message: issue.message });
      placed = true;
    }
  }
  return placed ? null : error.message;
}
