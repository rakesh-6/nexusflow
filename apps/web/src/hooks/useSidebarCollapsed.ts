import { useState } from "react";

const STORAGE_KEY = "nexusflow-sidebar-collapsed";

function readSaved(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Whether the desktop sidebar is folded down to icons, remembered in this browser. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readSaved);

  function toggle() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Not remembered, but still works for this visit.
      }
      return next;
    });
  }

  return { collapsed, toggle };
}
