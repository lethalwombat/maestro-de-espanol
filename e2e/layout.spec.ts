import { expect, type Locator, type Page, test } from "@playwright/test";

const WIDTHS = [320, 390, 768, 1280] as const;

async function expectFullyVisible(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
}

async function size(locator: Locator) {
  const box = await locator.boundingBox();
  return { width: box?.width ?? 0, height: box?.height ?? 0 };
}

for (const width of WIDTHS) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test.beforeEach(async ({ page }) => {
      await page.goto("/");
    });

    test("nothing scrolls sideways and every control is fully visible", async ({ page }) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);

      await expectFullyVisible(page, page.getByLabel("Write a sentence in Spanish"));
      await expectFullyVisible(page, page.getByRole("button", { name: "Check my sentence" }));
      await expectFullyVisible(page, page.getByRole("radiogroup", { name: "Theme" }));
      await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeInViewport({ ratio: 1 });
    });

    test("the submit button and each theme option are at least 44 × 44 px", async ({ page }) => {
      const targets = [
        page.getByRole("button", { name: "Check my sentence" }),
        ...["System", "Light", "Dark"].map((name) => page.getByRole("radio", { name })),
      ];
      for (const target of targets) {
        const { width, height } = await size(target);
        expect(width).toBeGreaterThanOrEqual(44);
        expect(height).toBeGreaterThanOrEqual(44);
      }
    });
  });
}

test.describe("at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the content column is no wider than the guide's content width", async ({ page }) => {
    await page.goto("/");
    const [column, contentWidth] = await page.evaluate(() => {
      const main = document.querySelector("main");
      const probe = document.createElement("div");
      probe.style.width = "var(--container-content)";
      document.body.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return [main?.parentElement?.getBoundingClientRect().width ?? Infinity, width];
    });
    expect(contentWidth).toBe(640);
    expect(column).toBeLessThanOrEqual(contentWidth);
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`tabbing shows a focus ring at least 2 px thick on each control in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    // The button is only focusable once there's something to check.
    // Typing leaves focus in the text area: step back to the theme control, then forward.
    await page.getByLabel("Write a sentence in Spanish").fill("Hola.");

    const rings: { name: string; width: number; style: string }[] = [];
    for (const key of ["Shift+Tab", "Tab", "Tab"]) {
      await page.keyboard.press(key);
      rings.push(
        await page.evaluate(() => {
          const element = document.activeElement as HTMLElement;
          const style = getComputedStyle(element);
          return {
            name: (element as HTMLInputElement).labels?.[0]?.textContent || element.textContent,
            width: parseFloat(style.outlineWidth),
            style: style.outlineStyle,
          };
        }),
      );
    }

    expect(rings.map(({ name }) => name)).toEqual([
      "System",
      "Write a sentence in Spanish",
      "Check my sentence",
    ]);
    for (const ring of rings) {
      expect(ring.style, ring.name).not.toBe("none");
      expect(ring.width, ring.name).toBeGreaterThanOrEqual(2);
    }
  });
}
