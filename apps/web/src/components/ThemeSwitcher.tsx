import { useEffect, useState } from "react";
import { getThemeChoice, setThemeChoice, watchSystemTheme, type ThemeChoice } from "../lib/theme";

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// Three-way switch: follow the computer, always light, or always dark.
// Built as a radio group so keyboard and screen-reader users can use it too.
export function ThemeSwitcher() {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice);

  // While on "System", follow the computer when it switches light/dark.
  useEffect(() => watchSystemTheme(getThemeChoice), []);

  function choose(value: ThemeChoice) {
    setChoice(value);
    setThemeChoice(value);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex rounded-control border bg-surface p-0.5 text-sm"
    >
      {OPTIONS.map((option) => {
        const selected = option.value === choice;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choose(option.value)}
            className={`rounded-[5px] px-3 py-1 font-medium transition-colors duration-150 ${
              selected
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
