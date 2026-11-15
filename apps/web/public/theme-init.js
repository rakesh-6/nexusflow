// Runs before the page is drawn: adds the "dark" class to <html> when the saved
// theme is dark, or when no choice is saved and the computer prefers dark.
// Kept in its own file because the security policy blocks inline scripts.
(function () {
  var saved = null;
  try {
    saved = localStorage.getItem("nexusflow-theme");
  } catch {
    // Storage can be blocked (private windows); fall back to the system setting.
  }
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  var dark = saved === "dark" || ((saved === null || saved === "system") && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
})();
