import { expect, test } from "@playwright/test";

const PAGES = [
  { path: "/", link: "Sentence checker", heading: "Maestro de Español" },
  { path: "/exercises", link: "Exercises", heading: "Exercises" },
  { path: "/admin/prompts", link: "Prompt admin", heading: "Prompt admin" },
] as const;

for (const from of PAGES) {
  test(`the navigation on ${from.path} links every page and marks the current one`, async ({
    page,
  }) => {
    await page.goto(from.path);
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: from.link })).toHaveAttribute(
      "aria-current",
      "page",
    );

    for (const to of PAGES) {
      await page.goto(from.path);
      await nav.getByRole("link", { name: to.link }).click();
      await expect(page).toHaveURL(to.path);
      await expect(page.getByRole("heading", { level: 1, name: to.heading })).toBeVisible();
    }
  });
}

test("the navigation is reachable and usable by keyboard", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Sentence checker" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Exercises" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/exercises");
});
