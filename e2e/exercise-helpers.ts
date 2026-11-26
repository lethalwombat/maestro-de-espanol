// Shared steps for the exercise and prompt-admin e2e specs.
import { expect, type Page } from "@playwright/test";

/** Topics with canned replies in e2e/mock-anthropic.ts, one per outcome. */
export const TOPICS = {
  exercise: "ser y estar",
  offTopic: "Python decorators",
  refused: "tema rechazado",
  invalid: "salida rota",
  /** The mock titles this exercise with the first line of the system prompt it received. */
  echo: "eco del prompt",
} as const;

export async function create(page: Page, topic: string) {
  await page.getByRole("textbox", { name: "Topic" }).fill(topic);
  await page.getByRole("button", { name: "Create exercise" }).click();
}

/** Holds /api/exercises until the returned function is called, to keep the loading state on screen. */
export async function holdExercises(page: Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/exercises", async (route) => {
    await released;
    await route.continue();
  });
  return release;
}

export async function expectExercise(page: Page, title = "Ser y estar") {
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
}
