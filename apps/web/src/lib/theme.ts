// Light, dark or "follow my computer" theme, remembered in this browser.
// public/theme-init.js applies the same rule before React starts.

export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "nexusflow-theme";
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

export function getThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // Storage can be blocked (private windows); use the default below.
  }
  return "system";
}

/** Saves the choice and updates the page right away. */
export function setThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Not saved, but the page still switches for this visit.
  }
  applyTheme(choice);
}

export function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && darkQuery().matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Re-applies "system" whenever the computer switches between light and dark. */
export function watchSystemTheme(getChoice: () => ThemeChoice): () => void {
  const query = darkQuery();
  const onChange = () => {
    if (getChoice() === "system") applyTheme("system");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
