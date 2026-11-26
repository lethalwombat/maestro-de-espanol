import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { create, expectExercise, holdExercises, TOPICS } from "./exercise-helpers";

const STATES: Record<string, (page: Page) => Promise<void>> = {
  empty: async (page) => {
    await expect(page.getByRole("button", { name: "Create exercise" })).toBeVisible();
  },
  loading: async (page) => {
    await holdExercises(page);
    await create(page, TOPICS.exercise);
    await expect(page.getByRole("main").locator('[aria-busy="true"]')).toBeVisible();
  },
  "exercise shown": async (page) => {
    await create(page, TOPICS.exercise);
    await expectExercise(page);
  },
  checked: async (page) => {
    await create(page, TOPICS.exercise);
    await page.getByRole("radio", { name: "estoy" }).check();
    await page.getByRole("textbox", { name: /Mi hermano/ }).fill("esta");
    await page.getByRole("button", { name: "Check answers" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText("of 5 right");
  },
  "off-topic": async (page) => {
    await create(page, TOPICS.offTopic);
    await expect(page.getByRole("main").getByRole("status")).toBeVisible();
  },
  error: async (page) => {
    await create(page, TOPICS.refused);
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  },
};

for (const colorScheme of ["light", "dark"] as const) {
  for (const [state, reach] of Object.entries(STATES)) {
    test(`axe finds no WCAG 2.2 A or AA violations on /exercises: ${state}, ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/exercises");
      await reach(page);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
        .analyze();

      expect(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length }))).toEqual([]);
    });
  }
}
