import { expect, type Page, test } from "@playwright/test";
import { check, holdFeedback, SENTENCES } from "./design-helpers";

async function stylesheets(page: Page): Promise<string> {
  const hrefs = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  expect(hrefs.length).toBeGreaterThan(0);
  const bodies = await Promise.all(
    hrefs.map(async (href) => (await page.request.get(href)).text()),
  );
  return bodies.join("\n");
}

test.describe("styles", () => {
  test("Tailwind generates the stylesheet from the tokens", async ({ page }) => {
    await page.goto("/");
    const css = await stylesheets(page);

    expect(css).toContain(".max-w-content");
    expect(css).toContain("--color-surface:");
    expect(css).toContain("--container-content:");
  });

  test("the production stylesheet defines none of Tailwind's default colours", async ({ page }) => {
    await page.goto("/");
    const css = await stylesheets(page);

    expect(css).not.toMatch(
      /--color-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/,
    );
    expect(css).not.toMatch(/--color-(?:black|white):/);
  });
});

test("the page renders in self-hosted Inter and only talks to its own origin", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "").origin;
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("/");
  await page.evaluate(async () => document.fonts.ready);

  const fontFiles = requests.filter(
    (url) => url.startsWith(`${origin}/_next/static/media/`) && url.endsWith(".woff2"),
  );
  expect(fontFiles.length).toBeGreaterThan(0);
  expect(requests.filter((url) => new URL(url).origin !== origin)).toEqual([]);

  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(bodyFont.split(",")[0]?.trim().replace(/["']/g, "")).toBe("Inter");
  expect(await page.evaluate(() => document.fonts.check("16px Inter"))).toBe(true);
});

test.describe("states", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("while checking, the button shows a spinner and a busy placeholder holds the result area", async ({
    page,
  }) => {
    const release = await holdFeedback(page);
    await check(page, SENTENCES.correct);

    const button = page.getByRole("button", { name: "Checking…" });
    await expect(button).toBeDisabled();
    await expect(button.getByTestId("spinner")).toBeVisible();
    const placeholder = page.getByRole("main").locator('[aria-busy="true"]');
    await expect(placeholder).toBeVisible();

    release();

    await expect(page.getByRole("main").getByRole("status")).toContainText("¡Perfecto!");
    await expect(page.getByTestId("spinner")).toHaveCount(0);
    await expect(placeholder).toHaveCount(0);
  });

  test("the loading state also goes when an error arrives", async ({ page }) => {
    const release = await holdFeedback(page);
    await check(page, SENTENCES.error);
    await expect(page.getByRole("main").locator('[aria-busy="true"]')).toBeVisible();

    release();

    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("main").locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByTestId("spinner")).toHaveCount(0);
  });

  test("corrections strike the wrong fragment and show the correction in its own colour", async ({
    page,
  }) => {
    await check(page, SENTENCES.corrected);

    const corrections = page.getByRole("list", { name: "Corrections" });
    const wrong = corrections.locator("del");
    const right = corrections.locator("ins");
    await expect(wrong).toHaveText("es");
    await expect(right).toHaveText("soy");
    await expect(wrong).toHaveCSS("text-decoration-line", "line-through");
    const [danger, success] = await page.evaluate(() => {
      const probe = document.createElement("span");
      document.body.append(probe);
      const colourOf = (token: string) => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      };
      const colours = [colourOf("--color-danger"), colourOf("--color-success")];
      probe.remove();
      return colours;
    });
    await expect(wrong).toHaveCSS("color", danger ?? "");
    await expect(right).toHaveCSS("color", success ?? "");
  });

  for (const [name, sentence, role, icon] of [
    ["a correct sentence", SENTENCES.correct, "status", "lucide-circle-check"],
    ["text that isn't Spanish", SENTENCES.notSpanish, "status", "lucide-info"],
    ["a failure", SENTENCES.error, "alert", "lucide-circle-alert"],
  ] as const) {
    test(`${name} gets its own message with a hidden icon`, async ({ page }) => {
      await check(page, sentence);

      const message = page.getByRole("main").getByRole(role);
      await expect(message).toBeVisible();
      const svg = message.locator(`svg.${icon}`);
      await expect(svg).toHaveAttribute("aria-hidden", "true");
    });
  }
});

/** Durations, in ms, of every running transition or animation property on the page. */
async function motion(page: Page) {
  return page.evaluate(() => {
    const seconds = (value: string) =>
      value.split(",").map((part) => Math.round(parseFloat(part) * 1000));
    return [...document.querySelectorAll("*")].flatMap((element) => {
      const style = getComputedStyle(element);
      const entries: { kind: string; ms: number; easing: string; name: string }[] = [];
      seconds(style.transitionDuration).forEach((ms, index) => {
        if (ms > 0) {
          entries.push({
            kind: "transition",
            ms,
            easing: style.transitionTimingFunction.split(/,(?![^(]*\))/)[index]?.trim() ?? "",
            name: element.tagName,
          });
        }
      });
      if (style.animationName !== "none") {
        seconds(style.animationDuration).forEach((ms) => {
          entries.push({
            kind: "animation",
            ms,
            easing: style.animationTimingFunction,
            name: style.animationName,
          });
        });
      }
      return entries;
    });
  });
}

test.describe("motion", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("the result card and corrections rise in, one after another, and buttons respond to a press", async ({
    page,
  }) => {
    await check(page, SENTENCES.corrected);
    const card = page.getByRole("main").getByRole("status");
    await expect(card).toHaveCSS("animation-name", "rise");
    await expect(card).toHaveCSS("animation-duration", "0.3s");
    const item = page.getByRole("list", { name: "Corrections" }).getByRole("listitem").first();
    await expect(item).toHaveCSS("animation-name", "rise");
    await expect(item).toHaveCSS("animation-delay", "0.06s");

    const button = page.getByRole("button", { name: "Check my sentence" });
    await expect(button).toHaveCSS("transition-property", "background-color, scale");
    await expect(button).toHaveCSS("transition-duration", "0.12s");
    await button.hover();
    await page.mouse.down();
    await expect(button).toHaveCSS("scale", "0.98");
    await page.mouse.up();
  });

  test("every duration and easing comes from the motion tokens and lasts at most 300 ms", async ({
    page,
  }) => {
    const release = await holdFeedback(page);
    await check(page, SENTENCES.corrected);
    const loading = await motion(page);
    release();
    await expect(page.getByRole("list", { name: "Corrections" })).toBeVisible();
    const entries = [...loading, ...(await motion(page))];

    const oneShot = entries.filter((entry) => entry.name !== "spin");
    expect(oneShot.length).toBeGreaterThan(0);
    expect(oneShot.filter((entry) => entry.ms > 300)).toEqual([]);
    expect(
      oneShot.filter(
        (entry) =>
          !["cubic-bezier(0.2, 0, 0, 1)", "cubic-bezier(0.4, 0, 0.2, 1)"].includes(entry.easing),
      ),
    ).toEqual([]);

    // The spinner is the one looping motion, on its own token (docs/design.md, Motion).
    const spin = loading.filter((entry) => entry.name === "spin");
    expect(spin).toEqual([{ kind: "animation", ms: 800, easing: "linear", name: "spin" }]);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing moves, and the loading state still says Checking…", async ({ page }) => {
    await page.goto("/");
    const release = await holdFeedback(page);
    await check(page, SENTENCES.corrected);

    await expect(page.getByRole("button", { name: "Checking…" })).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await motion(page)).toEqual([]);

    release();
    await expect(page.getByRole("list", { name: "Corrections" })).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await motion(page)).toEqual([]);
  });
});
