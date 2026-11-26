import { describe, expect, it } from "vitest";
import { findColourLiterals, sourceFilesWithColourRule } from "./design-system";

describe("findColourLiterals", () => {
  it.each([
    ["a hex colour in a CSS file", ".card { color: #4f46e5; }", "#4f46e5"],
    ["a short hex colour", ".card { color: #fff; }", "#fff"],
    ["a Tailwind arbitrary value", '<div className="bg-[#4f46e5] p-4" />', "#4f46e5"],
    ["an inline style prop", '<p style={{ color: "rgb(79 70 229)" }} />', "rgb("],
    ["an rgba() value", ".x { background: rgba(0, 0, 0, 0.5); }", "rgba("],
    ["an SVG attribute in TSX", '<svg><circle fill="oklch(0.5 0.2 270)" /></svg>', "oklch("],
    ["an hsl() value", ".x { color: hsl(240 50% 50%); }", "hsl("],
    ["an oklab() value", ".x { color: oklab(0.5 0.1 -0.1); }", "oklab("],
  ])("catches %s", (_name, source, literal) => {
    expect(findColourLiterals(source)).toContain(literal);
  });

  it.each([
    ["a semantic utility", '<div className="bg-accent text-fg" />'],
    ["a token reference", ".x { color: var(--color-accent); }"],
    ["an HTML entity", "<p>That doesn&#39;t look like Spanish.</p>"],
    ["a fragment link", '<a href="#main">Skip</a>'],
  ])("ignores %s", (_name, source) => {
    expect(findColourLiterals(source)).toEqual([]);
  });
});

describe("the repository", () => {
  it("has no colour literal under src/ outside tokens.css and tests", () => {
    const offenders = sourceFilesWithColourRule()
      .map(({ path, source }) => ({ path, literals: findColourLiterals(source) }))
      .filter(({ literals }) => literals.length > 0);

    expect(offenders).toEqual([]);
  });
});
