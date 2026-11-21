import { expect, type Page } from "@playwright/test";

/**
 * Signs in with "Try the demo". The first run builds the demo organization
 * (about a minute on a free database), so it retries while the server says
 * "being prepared".
 */
export async function startDemo(page: Page) {
  await page.goto("/login");
  const button = page.getByRole("button", { name: /Try the demo/ });
  await expect(button).toBeVisible();
  for (let attempt = 0; attempt < 12; attempt++) {
    await button.click();
    const outcome = await Promise.race([
      page.waitForURL(/\/acme(\/|$)/, { timeout: 20_000 }).then(() => "in" as const),
      page
        .getByText(/being prepared/i)
        .waitFor({ timeout: 20_000 })
        .then(() => "wait" as const),
    ]).catch(() => "wait" as const);
    if (outcome === "in") return;
    await page.waitForTimeout(10_000);
  }
  throw new Error("The demo organization was not ready in time");
}

/** Opens the first project's board from the Projects page. */
export async function openFirstBoard(page: Page) {
  await page.getByRole("link", { name: "Projects" }).first().click();
  await page.locator('a[href*="/projects/"]').first().click();
  await page.getByRole("link", { name: "Board" }).click();
  await expect(page.getByText("To Do").or(page.getByText("Todo")).first()).toBeVisible();
}
