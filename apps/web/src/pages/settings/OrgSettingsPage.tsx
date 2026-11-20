import { LockKeyhole } from "lucide-react";
import type { ComponentType } from "react";
import { useParams } from "react-router";
import { EmptyState } from "../../components/common/EmptyState";
import { BillingSettings } from "../../features/billing/BillingSettings";
import { AuditLogSettings } from "../../features/organizations/settings/AuditLogSettings";
import { InvitationsSettings } from "../../features/organizations/settings/InvitationsSettings";
import { MembersSettings } from "../../features/organizations/settings/MembersSettings";
import { OrgGeneralSettings } from "../../features/organizations/settings/OrgGeneralSettings";
import { PermissionsSettings } from "../../features/organizations/settings/PermissionsSettings";
import { UsageSettings } from "../../features/organizations/settings/UsageSettings";
import { AllTeamsSettings } from "../../features/projects/settings/AllTeamsSettings";
import { TrashSettings } from "../../features/projects/settings/TrashSettings";
import { useWorkspace, type WorkspaceContext } from "../../hooks/useWorkspace";
import { NotFoundPage } from "../NotFoundPage";
import { PlaceholderPage } from "../PlaceholderPage";
import { ORG_SETTINGS_SECTIONS } from "./orgSettingsSections";

// Organization settings sections that are built; the rest show a placeholder.
const ORG_SECTION_PAGES: Record<string, ComponentType<{ context: WorkspaceContext }>> = {
  general: OrgGeneralSettings,
  members: MembersSettings,
  invitations: InvitationsSettings,
  teams: AllTeamsSettings,
  projects: TrashSettings,
  permissions: PermissionsSettings,
  billing: BillingSettings,
  usage: UsageSettings,
  audit: AuditLogSettings,
};

/** /:org/settings/org/members and the other admin panel sections (PRD §11.17.1). */
export default function OrgSettingsPage() {
  const { section = "" } = useParams();
  const context = useWorkspace();
  const meta = ORG_SETTINGS_SECTIONS[section];
  if (!meta || !context) return <NotFoundPage />;
  // The API refuses these requests too; this only avoids showing a broken page.
  const allowed = meta.permission ? context.can(meta.permission) : context.role !== "GUEST";
  if (!allowed) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon={LockKeyhole}
          title="Admins only"
          description="Your role does not include this part of the settings. Ask an owner or admin."
        />
      </div>
    );
  }
  const Page = ORG_SECTION_PAGES[section];
  if (Page) return <Page context={context} />;
  return (
    <PlaceholderPage
      title={meta.title}
      description={meta.description}
      phase={meta.phase}
      comingSoon={meta.comingSoon}
    />
  );
}
