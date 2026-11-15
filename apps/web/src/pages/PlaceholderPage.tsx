import { Hammer, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";

export interface PlaceholderPageProps {
  title: string;
  /** One line under the title describing the page. */
  description: string;
  /** Which roadmap phase builds the page (PRD §27), e.g. "Phase 5". */
  phase: string;
  /** What will appear here, shown in the empty state. */
  comingSoon: string;
  icon?: LucideIcon;
  children?: ReactNode;
}

// A page whose address and layout already work, while its features arrive in
// a later phase. Keeps every link in the app clickable from day one.
export function PlaceholderPage({
  title,
  description,
  phase,
  comingSoon,
  icon = Hammer,
  children,
}: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader title={title} description={description} />
      <EmptyState icon={icon} title={`Coming in ${phase}`} description={comingSoon} />
      {children}
    </div>
  );
}
