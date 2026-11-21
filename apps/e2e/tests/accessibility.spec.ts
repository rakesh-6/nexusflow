import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openFirstBoard, startDemo } from "./helpers.ts";

// Automated accessibility checks with axe (PRD §25.1, WCAG 2.1 AA): no
// "serious" or "critical" problems on the key pages.

async function seriousProblems(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`);
}

test("the login page has no serious accessibility problems", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Try the demo/ })).toBeVisible();
  expect(await seriousProblems(page)).toEqual([]);
});

test("the board has no serious accessibility problems", async ({ page }) => {
  await startDemo(page);
  await openFirstBoard(page);
  expect(await seriousProblems(page)).toEqual([]);
});
