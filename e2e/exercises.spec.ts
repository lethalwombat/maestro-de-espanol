import { expect, test } from "@playwright/test";
import { create, expectExercise, holdExercises, TOPICS } from "./exercise-helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/exercises");
});

test("a topic makes an exercise that is answered by keyboard, checked in code and retried", async ({
  page,
}) => {
  await create(page, TOPICS.exercise);
  await expectExercise(page);
  const items = page.getByRole("list", { name: "Items" }).getByRole("listitem");
  await expect(items).toHaveCount(5);

  // Keyboard only: choose "soy", type "esta" without its accent, leave the rest.
  await page
    .getByRole("radiogroup", { name: /Yo ___ de Chile/ })
    .getByRole("radio")
    .first()
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: /Mi hermano ___ en casa/ })).toBeFocused();
  await page.keyboard.type("esta");
  await page.getByRole("button", { name: "Check answers" }).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("main").getByRole("status")).toContainText("2 of 5 right.");
  await expect(items.nth(0)).toContainText("Right");
  await expect(items.nth(1)).toContainText("Watch the accent: está");
  await expect(items.nth(2)).toContainText("Wrong");
  await expect(items.nth(2)).toContainText("Your answer: no answer");
  await expect(items.nth(2)).toContainText("Correct answer: está");
  await expect(items.nth(2)).toContainText("A changeable state takes estar.");
  await expect(page.getByRole("radio", { name: "estoy" })).toBeDisabled();

  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) requests.push(request.url());
  });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("radio", { name: "soy" })).not.toBeChecked();
  await expect(page.getByRole("textbox", { name: /Mi hermano/ })).toHaveValue("");

  await page.getByRole("button", { name: "Check answers" }).click();
  await page.getByRole("button", { name: "New exercise" }).click();
  await expect(page.getByRole("textbox", { name: "Topic" })).toBeFocused();
  await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("an empty or over-long topic shows a validation message and sends no request", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/exercises", async (route) => {
    requests += 1;
    await route.continue();
  });
  await page.getByRole("button", { name: "Create exercise" }).click();
  await expect(page.getByText("Name a topic first.")).toBeVisible();
  await create(page, "a".repeat(201));
  await expect(page.getByText("Keep the topic under 200 characters.")).toBeVisible();
  expect(requests).toBe(0);
});

test("while generating, the button is busy and the exercise area holds a placeholder", async ({
  page,
}) => {
  const release = await holdExercises(page);
  await create(page, TOPICS.exercise);
  await expect(page.getByRole("button", { name: "Creating…" })).toBeDisabled();
  await expect(page.getByRole("main").locator('[aria-busy="true"]')).toBeVisible();
  release();
  await expectExercise(page);
  await expect(page.getByRole("main").locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create exercise" })).toBeEnabled();
});

test("a topic that isn't about Spanish gets an info message and no exercise", async ({ page }) => {
  await create(page, TOPICS.offTopic);
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "isn't about the Spanish language",
  );
  await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
});

for (const [name, topic] of [
  ["a refusal", TOPICS.refused],
  ["invalid output", TOPICS.invalid],
] as const) {
  test(`${name} shows an alert and keeps the topic`, async ({ page }) => {
    await create(page, topic);
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Topic" })).toHaveValue(topic);
    await expect(page.getByRole("list", { name: "Items" })).toHaveCount(0);
  });
}
