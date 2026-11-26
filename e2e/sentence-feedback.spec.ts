import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

async function check(page: Page, sentence: string) {
  await page.getByLabel("Write a sentence in Spanish").fill(sentence);
  await page.getByRole("button", { name: "Check my sentence" }).click();
}

test("the home page introduces the tutor", async ({ page }) => {
  await expect(page).toHaveTitle("Maestro de Español");
  await expect(page.getByRole("heading", { level: 1, name: "Maestro de Español" })).toBeVisible();
  await expect(page.getByLabel("Write a sentence in Spanish")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check my sentence" })).toBeDisabled();
});

test("a sentence with errors comes back corrected, with an explanation per error", async ({
  page,
}) => {
  await check(page, "Yo es estudiante.");

  const result = page.getByRole("main").getByRole("status");
  await expect(result).toContainText("Corrected: Yo soy estudiante.");
  const corrections = result.getByRole("list", { name: "Corrections" });
  await expect(corrections.getByRole("listitem")).toHaveCount(1);
  await expect(corrections).toContainText("Conjugation: with 'yo', the verb ser is 'soy'.");
});

test("a correct sentence is confirmed", async ({ page }) => {
  await check(page, "Me gusta el café.");

  await expect(page.getByRole("main").getByRole("status")).toContainText("¡Perfecto!");
});

test("a declined request shows a friendly message instead of failing", async ({ page }) => {
  await check(page, "Esta frase provoca un rechazo.");

  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "I can't give feedback on that sentence.",
  );
});
