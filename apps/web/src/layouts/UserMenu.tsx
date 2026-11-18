import { LogOut, Monitor, Moon, ShieldCheck, Sun, User } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { UserAvatar } from "../components/common/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { useCurrentUser, useLogout } from "../features/auth/hooks";
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "../lib/theme";
import { cn } from "../lib/utils";

// The signed-in person at the bottom of the sidebar: profile, theme, log out.
export function UserMenu({
  settingsPath,
  collapsed,
}: {
  settingsPath: string;
  collapsed: boolean;
}) {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice);

  function chooseTheme(value: string) {
    const choice = value as ThemeChoice;
    setTheme(choice);
    setThemeChoice(choice);
  }

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-control p-1.5 text-left transition-colors hover:bg-card",
          collapsed && "justify-center",
        )}
        aria-label={`Account menu for ${user.name}`}
      >
        <UserAvatar name={user.name} avatarUrl={user.avatarUrl} />
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuItem asChild>
          <Link to={`${settingsPath}/profile`}>
            <User /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={`${settingsPath}/security`}>
            <ShieldCheck /> Security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={chooseTheme}>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={logout.isPending}
          onSelect={() =>
            logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })
          }
        >
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
