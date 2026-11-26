import { expect, test } from "@playwright/test";
import { CANVAS, canvasColour, expectCanvas } from "./design-helpers";

test.describe("following the OS", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`with no saved theme, an OS set to ${colorScheme} gets the ${colorScheme} tokens`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      await expect.poll(() => canvasColour(page)).toBe(CANVAS[colorScheme]);
    });
  }

  test("changing the OS setting switches the theme without a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expectCanvas(page, "light");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => canvasColour(page)).toBe(CANVAS.dark);
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => canvasColour(page)).toBe(CANVAS.light);
  });
});

test.describe("the theme control", () => {
  test("is a keyboard-operable radio group named Theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const group = page.getByRole("radiogroup", { name: "Theme" });
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(group.getByRole("radio", { name: "System" })).toBeChecked();

    await group.getByRole("radio", { name: "System" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { name: "Light" })).toBeChecked();
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { name: "Dark" })).toBeChecked();
    await expectCanvas(page, "dark");
  });

  test("Dark and Light override the OS at once and survive a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    await page.getByRole("radio", { name: "Dark" }).check();
    await expectCanvas(page, "dark");
    await page.reload();
    await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
    await expectCanvas(page, "dark");

    await page.emulateMedia({ colorScheme: "dark" });
    await page.getByRole("radio", { name: "Light" }).check();
    await expectCanvas(page, "light");
    await page.reload();
    await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
    await expectCanvas(page, "light");
  });

  test("System goes back to following the OS", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.getByRole("radio", { name: "Light" }).check();
    await expectCanvas(page, "light");

    await page.getByRole("radio", { name: "System" }).check();
    await expectCanvas(page, "dark");
    await page.reload();
    await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
    await expectCanvas(page, "dark");
  });
});

test("a saved Dark choice applies before React loads", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("radio", { name: "Dark" }).check();

  let blocked = 0;
  await page.route("**/_next/static/chunks/**/*.js", async (route) => {
    blocked++;
    await route.abort();
  });
  await page.reload();

  expect(blocked).toBeGreaterThan(0);
  await expectCanvas(page, "dark");
});

test.describe("when storage misbehaves", () => {
  test("a throwing localStorage leaves the page on the OS theme, the toggle still works, and nothing is logged", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("denied", "SecurityError");
        },
      });
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    await expectCanvas(page, "dark");
    await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
    await page.getByRole("radio", { name: "Light" }).check();
    await expectCanvas(page, "light");
    await page.getByRole("radio", { name: "Dark" }).check();
    await expectCanvas(page, "dark");
    expect(errors).toEqual([]);
  });

  test("an unknown saved value leaves the page on the OS theme", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("theme", "purple");
    });
    await page.reload();

    await expectCanvas(page, "dark");
    await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
    await page.getByRole("radio", { name: "Light" }).check();
    await expectCanvas(page, "light");
    expect(errors).toEqual([]);
  });
});
