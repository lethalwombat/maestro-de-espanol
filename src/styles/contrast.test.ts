import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  GUIDE_PATH,
  parseContrastPairs,
  parseTokens,
  readRepoFile,
  TOKENS_PATH,
} from "./design-system";

const tokens = parseTokens(readRepoFile(TOKENS_PATH));
const pairs = parseContrastPairs(readRepoFile(GUIDE_PATH));

// WCAG 2.2: 1.4.3 for text, 1.4.11 for focus rings, control borders and meaningful icons.
const MINIMUM = { text: 4.5, "non-text": 3 } as const;

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777", "#fff")).toBeCloseTo(4.48, 2);
  });

  it("refuses a value that isn't a hex colour", () => {
    expect(() => contrastRatio("red", "#fff")).toThrow(/hex colour/);
  });
});

describe("parseContrastPairs", () => {
  it("reads the rows whose first two cells are tokens", () => {
    expect(
      parseContrastPairs(`
| \`--color-bg\` | \`#f8fafc\` | \`#020617\` | Page |
| \`--color-fg\` | \`--color-bg\` | text |
| \`--color-ring\` | \`--color-surface\` | non-text |
`),
    ).toEqual([
      { foreground: "--color-fg", background: "--color-bg", kind: "text" },
      { foreground: "--color-ring", background: "--color-surface", kind: "non-text" },
    ]);
  });
});

describe("the documented colour pairs", () => {
  it("lists pairs to check", () => {
    expect(pairs.length).toBeGreaterThan(0);
  });

  it.each(["light", "dark"] as const)("meet WCAG contrast in the %s theme", (theme) => {
    const failures = pairs
      .map((pair) => {
        const foreground = tokens.get(pair.foreground)?.[theme];
        const background = tokens.get(pair.background)?.[theme];
        if (foreground === undefined || background === undefined) {
          return { ...pair, ratio: "undefined token" };
        }
        const ratio = contrastRatio(foreground, background);
        return ratio >= MINIMUM[pair.kind] ? null : { ...pair, ratio: ratio.toFixed(2) };
      })
      .filter((failure) => failure !== null);

    expect(failures).toEqual([]);
  });
});
