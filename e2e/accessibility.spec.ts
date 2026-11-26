import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { check, holdFeedback, SENTENCES } from "./design-helpers";

const STATES: Record<string, (page: Page) => Promise<void>> = {
  empty: async (page) => {
    await expect(page.getByRole("button", { name: "Check my sentence" })).toBeVisible();
  },
  loading: async (page) => {
    await holdFeedback(page);
    await check(page, SENTENCES.correct);
    await expect(page.getByRole("main").locator('[aria-busy="true"]')).toBeVisible();
  },
  corrected: async (page) => {
    await check(page, SENTENCES.corrected);
    await expect(page.getByRole("list", { name: "Corrections" })).toBeVisible();
  },
  correct: async (page) => {
    await check(page, SENTENCES.correct);
    await expect(page.getByRole("main").getByRole("status")).toContainText("¡Perfecto!");
  },
  "not Spanish": async (page) => {
    await check(page, SENTENCES.notSpanish);
    await expect(page.getByRole("main").getByRole("status")).toContainText("Spanish");
  },
  error: async (page) => {
    await check(page, SENTENCES.error);
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  },
};

for (const colorScheme of ["light", "dark"] as const) {
  for (const [state, reach] of Object.entries(STATES)) {
    test(`axe finds no WCAG 2.2 A or AA violations: ${state}, ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/");
      await reach(page);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
        .analyze();

      expect(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length }))).toEqual([]);
    });
  }
}
