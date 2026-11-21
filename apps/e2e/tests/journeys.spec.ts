import { expect, test } from "@playwright/test";
import { openFirstBoard, startDemo } from "./helpers.ts";

// The main journeys a visitor takes (PRD §25.4), in a real browser.

test("try the demo, then see the home page and the demo banner", async ({ page }) => {
  await startDemo(page);
  await expect(page.getByText(/You are exploring the demo/)).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Sidebar" })
      .or(page.getByRole("complementary", { name: "Sidebar" })),
  ).toBeVisible();
});

test("add a task on the board and open it", async ({ page }) => {
  await startDemo(page);
  await openFirstBoard(page);
  const title = `Browser test task ${Date.now()}`;
  await page.getByRole("button", { name: "Add task" }).first().click();
  const input = page.getByRole("textbox", { name: "New task title" });
  await input.fill(title);
  await input.press("Enter");
  const card = page.getByRole("button", { name: new RegExp(title) });
  await expect(card).toBeVisible();

  await card.click();
  await expect(
    page.getByRole("heading", { name: title }).or(page.getByText(title).nth(1)),
  ).toBeVisible();
  await expect(page).toHaveURL(/[?&]task=/);
});

test("comment on a task", async ({ page }) => {
  await startDemo(page);
  await openFirstBoard(page);
  await page.locator('[aria-label*=": "]').filter({ hasText: /\w/ }).first().click();
  const editor = page.getByRole("textbox", { name: "Write a comment…" });
  await expect(editor).toBeVisible();
  const words = `Looks good from the browser test ${Date.now()}`;
  await editor.click();
  await page.keyboard.type(words);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByText(words)).toBeVisible();
});
