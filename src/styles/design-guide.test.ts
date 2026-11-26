import { describe, expect, it } from "vitest";
import { GUIDE_PATH, readRepoFile, sourceFiles, TOKENS_PATH } from "./design-system";

const guide = readRepoFile(GUIDE_PATH);

function headings(level: number): string[] {
  const marker = `${"#".repeat(level)} `;
  return guide
    .split("\n")
    .filter((line) => line.startsWith(marker))
    .map((line) => line.slice(marker.length).trim().toLowerCase());
}

/** The text under a `###` heading, up to the next heading of level 2 or 3. */
function subsection(title: string): string {
  const lines = guide.split("\n");
  const start = lines.findIndex((line) => line.toLowerCase() === `### ${title}`);
  if (start === -1) return "";
  const end = lines.findIndex((line, index) => index > start && /^#{2,3} /.test(line));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .toLowerCase();
}

describe("docs/design.md", () => {
  it.each([
    "principles",
    "colour",
    "typography",
    "spacing and layout",
    "shape and elevation",
    "motion",
    "iconography",
    "components",
    "theming",
    "responsive behaviour",
    "accessibility",
    "adding a token or a component",
  ])("has a section on %s", (section) => {
    expect(headings(2)).toContain(section);
  });

  it.each([
    ["button", ["default", "hover", "focus-visible", "active", "disabled", "loading"]],
    ["text area", ["default", "hover", "focus-visible", "disabled"]],
    ["card", ["default"]],
    ["status and alert messages", ["default"]],
    ["spinner", ["default"]],
    ["loading placeholder", ["default"]],
    ["theme toggle", ["default", "hover", "focus-visible", "active"]],
  ])("covers the %s and its states", (component, states) => {
    const text = subsection(component);
    expect(text, `no "### ${component}" subsection`).not.toBe("");
    for (const state of states) expect(text).toContain(state);
  });
});

describe("pointers to the guide", () => {
  it("README links to docs/design.md", () => {
    expect(readRepoFile("README.md")).toContain("(docs/design.md)");
  });

  it("CLAUDE.md conventions say UI work follows the guide, and where tokens and components live", () => {
    const claude = readRepoFile("CLAUDE.md");
    const conventions = claude.slice(
      claude.indexOf("## Conventions"),
      claude.indexOf("## Gotchas"),
    );
    expect(conventions).toContain("docs/design.md");
    expect(conventions).toContain("src/styles/tokens.css");
    expect(conventions).toContain("src/components/ui/");
  });
});

describe("styles", () => {
  const css = sourceFiles().filter(({ path }) => path.endsWith(".css"));

  it("Tailwind runs through @tailwindcss/postcss", () => {
    expect(readRepoFile("postcss.config.mjs")).toContain('"@tailwindcss/postcss"');
  });

  it("defines theme tokens only in tokens.css", () => {
    const elsewhere = css
      .filter(({ path }) => path !== TOKENS_PATH)
      .filter(({ source }) => /@theme|--[\w-]+\s*:/.test(source))
      .map(({ path }) => path);
    expect(elsewhere).toEqual([]);
  });

  it("keeps globals.css to the imports and base element styles", () => {
    const globals = readRepoFile("src/app/globals.css");
    const imports = [...globals.matchAll(/^@import "([^"]+)";$/gm)].map((match) => match[1] ?? "");
    expect(imports).toEqual(["tailwindcss", "../styles/tokens.css"]);

    const selectors = [...globals.matchAll(/^([^@\s}][^{]*)\{/gm)].map((match) =>
      (match[1] ?? "").trim(),
    );
    const classOrId = selectors.filter((selector) => /[.#]/.test(selector));
    expect(classOrId).toEqual([]);
  });

  it("no longer uses the hand-written page classes", () => {
    const old = /\b(?:page|lede|result|explanation|error)\b/;
    const users = sourceFiles()
      .filter(({ path }) => path.endsWith(".tsx") && !path.endsWith(".test.tsx"))
      .filter(({ source }) =>
        [...source.matchAll(/className=\{?[`"]([^`"]*)[`"]/g)].some((match) =>
          old.test(match[1] ?? ""),
        ),
      )
      .map(({ path }) => path);
    expect(users).toEqual([]);
  });
});
