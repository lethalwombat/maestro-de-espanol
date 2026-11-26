import { expect, type Page, test } from "@playwright/test";
import { create, TOPICS } from "./exercise-helpers";

// One app process holds the in-memory prompt store for every test, so the tests
// that change the active prompt run one at a time and leave the default active.
test.describe.configure({ mode: "serial" });

const DEFAULT_FIRST_LINE =
  "You write short practice exercises for English-speaking learners of Spanish. The learner names a topic, and you build one exercise for it.".slice(
    0,
    120,
  );

async function openAdmin(page: Page) {
  await page.goto("/admin/prompts");
  await expect(page.getByRole("textbox", { name: "Exercise prompt" })).toBeVisible();
}

async function generatedTitle(page: Page): Promise<string> {
  await page.goto("/exercises");
  await create(page, TOPICS.echo);
  const heading = page.getByRole("heading", { level: 2 });
  await expect(heading).toBeVisible();
  return (await heading.textContent()) ?? "";
}

test.afterAll(async ({ request }) => {
  await request.post("/api/admin/prompts/restore-default", { data: {} });
});

test("with nothing saved, the default prompt from code is active and generates exercises", async ({
  page,
  request,
}) => {
  await request.post("/api/admin/prompts/restore-default", { data: {} });
  await openAdmin(page);
  await expect(page.getByText("Active: the default prompt from code.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Exercise prompt" })).toHaveValue(
    /^You write short practice exercises/,
  );
  expect(await generatedTitle(page)).toBe(DEFAULT_FIRST_LINE);
});

test("a saved prompt becomes active and the next exercise uses it, with no restart", async ({
  page,
}) => {
  await openAdmin(page);
  const editor = page.getByRole("textbox", { name: "Exercise prompt" });
  await editor.fill("Marcador uno: prompt guardado\nMore instructions.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Saved.");
  await expect(page.getByText(/Active: a saved version from/)).toBeVisible();

  expect(await generatedTitle(page)).toBe("Marcador uno: prompt guardado");
});

test("versions are listed newest first, restoring saves a copy, and Restore default goes back to the code", async ({
  page,
}) => {
  await openAdmin(page);
  const editor = page.getByRole("textbox", { name: "Exercise prompt" });
  await editor.fill("Marcador dos: segundo prompt");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Saved.");

  const versions = page.getByRole("list", { name: "Saved versions" }).getByRole("listitem");
  await expect(versions.nth(0)).toContainText("Marcador dos");
  await expect(versions.nth(1)).toContainText("Marcador uno");
  const before = await versions.count();

  await versions.nth(1).getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Restored.");
  await expect(versions).toHaveCount(before + 1);
  await expect(versions.nth(0)).toContainText("Marcador uno");
  await expect(editor).toHaveValue("Marcador uno: prompt guardado\nMore instructions.");
  expect(await generatedTitle(page)).toBe("Marcador uno: prompt guardado");

  await openAdmin(page);
  await page.getByRole("button", { name: "Restore default" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Restored the default.");
  await expect(page.getByText("Active: the default prompt from code.")).toBeVisible();
  await expect(versions).toHaveCount(before + 1);
  expect(await generatedTitle(page)).toBe(DEFAULT_FIRST_LINE);
});

test("an empty prompt is refused with a validation message and nothing is saved", async ({
  page,
}) => {
  await openAdmin(page);
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") posts += 1;
  });
  await page.getByRole("textbox", { name: "Exercise prompt" }).fill("   ");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Write a prompt first.")).toBeVisible();
  expect(posts).toBe(0);
});

test("a failed save shows an alert and keeps the unsaved text", async ({ page }) => {
  await openAdmin(page);
  await page.route("**/api/admin/prompts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      status: 503,
      json: {
        error: "unavailable",
        message: "The prompt store couldn't be reached. Your text hasn't been saved; try again.",
      },
    });
  });
  const editor = page.getByRole("textbox", { name: "Exercise prompt" });
  await editor.fill("A draft that fails to save");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("hasn't been saved");
  await expect(editor).toHaveValue("A draft that fails to save");
});
