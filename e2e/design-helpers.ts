// Shared steps for the design system's e2e specs.
import { expect, type Page } from "@playwright/test";

/** Sentences with canned replies in e2e/mock-anthropic.ts, one per outcome. */
export const SENTENCES = {
  corrected: "Yo es estudiante.",
  correct: "Me gusta el café.",
  notSpanish: "Hello there, how are you?",
  error: "Esta frase provoca un rechazo.",
} as const;

/** Canvas colours from src/styles/tokens.css, as the browser reports them. */
export const CANVAS = { light: "rgb(248, 250, 252)", dark: "rgb(2, 6, 23)" } as const;

export async function check(page: Page, sentence: string) {
  await page.getByLabel("Write a sentence in Spanish").fill(sentence);
  await page.getByRole("button", { name: "Check my sentence" }).click();
}

/** Holds /api/feedback until the returned function is called, to keep the loading state on screen. */
export async function holdFeedback(page: Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/feedback", async (route) => {
    await released;
    await route.continue();
  });
  return release;
}

export async function canvasColour(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
}

export async function expectCanvas(page: Page, theme: keyof typeof CANVAS) {
  await expect.poll(() => canvasColour(page)).toBe(CANVAS[theme]);
}
