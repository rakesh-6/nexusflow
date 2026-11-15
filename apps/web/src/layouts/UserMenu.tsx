import { LogOut, Monitor, Moon, Sun, User } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
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
import { SAMPLE_USER } from "../lib/sampleData";
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
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice);

  function chooseTheme(value: string) {
    const choice = value as ThemeChoice;
    setTheme(choice);
    setThemeChoice(choice);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-control p-1.5 text-left transition-colors hover:bg-card",
          collapsed && "justify-center",
        )}
        aria-label={`Account menu for ${SAMPLE_USER.name}`}
      >
        <UserAvatar name={SAMPLE_USER.name} />
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{SAMPLE_USER.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {SAMPLE_USER.email}
            </span>
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuItem asChild>
          <Link to={settingsPath}>
            <User /> Profile and settings
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
        <DropdownMenuItem disabled>
          <LogOut /> Log out
          <span className="ml-auto text-xs text-muted-foreground">Phase 2</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
