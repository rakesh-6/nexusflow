import { cn } from "../../lib/utils";

// "Aarav Shah" -> "AS", shown when there is no profile photo.
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function UserAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  const classes = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
    className,
  );
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={cn(classes, "object-cover")}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(classes, "bg-primary text-xs font-semibold text-primary-foreground")}
    >
      {initials(name)}
    </span>
  );
}
