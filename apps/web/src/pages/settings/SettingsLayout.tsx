import { NavLink, Outlet } from "react-router";
import { useWorkspace } from "../../hooks/useWorkspace";
import { cn } from "../../lib/utils";
import { ORG_SETTINGS_SECTIONS } from "./orgSettingsSections";

function SettingsLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "block shrink-0 rounded-control px-2.5 py-1.5 text-sm transition-colors duration-150",
          isActive
            ? "bg-surface font-medium text-foreground"
            : "text-muted-foreground hover:bg-surface hover:text-foreground",
        )
      }
    >
      {label}
    </NavLink>
  );
}

// Settings (PRD §14.2): your own account, then the organization sections your
// role may open. On phones the menu becomes a scrolling row above the page.
export function SettingsLayout() {
  const context = useWorkspace();
  if (!context) return null;
  const { settingsPath, can, role } = context;

  const orgSections = Object.entries(ORG_SETTINGS_SECTIONS).filter(([, section]) =>
    section.permission ? can(section.permission) : role !== "GUEST",
  );

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <nav
        aria-label="Settings"
        className="flex gap-1 overflow-x-auto border-b bg-card p-3 md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:border-b-0 md:border-r"
      >
        <h2 className="hidden px-2.5 pb-1 text-xs font-semibold text-muted-foreground md:block">
          Account
        </h2>
        <SettingsLink to={settingsPath("profile")} label="Profile" />
        <SettingsLink to={settingsPath("security")} label="Security" />
        <SettingsLink to={settingsPath("notifications")} label="Notifications" />
        <h2 className="hidden px-2.5 pb-1 pt-4 text-xs font-semibold text-muted-foreground md:block">
          {context.organization.name}
        </h2>
        {orgSections.map(([slug, section]) => (
          <SettingsLink key={slug} to={settingsPath(`org/${slug}`)} label={section.title} />
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
