import { describe, expect, it } from "vitest";
import {
  GUIDE_PATH,
  parseGuideTokens,
  parseTokens,
  readRepoFile,
  TOKENS_PATH,
} from "./design-system";

const tokens = parseTokens(readRepoFile(TOKENS_PATH));
const guide = parseGuideTokens(readRepoFile(GUIDE_PATH));

describe("parseTokens", () => {
  it("reads light and dark values from light-dark() and skips namespace resets", () => {
    const parsed = parseTokens(`
      @theme static {
        --color-*: initial;
        --color-bg: light-dark(#f8fafc, #020617);
        /* Shape */
        --radius-md: 0.5rem;
        @keyframes rise { from { opacity: 0; } }
      }
      :root { color-scheme: light dark; }
    `);

    expect(parsed).toEqual(
      new Map([
        ["--color-bg", { light: "#f8fafc", dark: "#020617" }],
        ["--radius-md", { light: "0.5rem", dark: "0.5rem" }],
      ]),
    );
  });
});

describe("parseGuideTokens", () => {
  it("reads colour rows with light and dark columns, and other rows by name", () => {
    const parsed = parseGuideTokens(`
| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| \`--color-bg\` | \`#f8fafc\` | \`#020617\` | Page background |

| Token | Value | Use |
| --- | --- | --- |
| \`--radius-md\` | \`0.5rem\` | Controls |

| Foreground | Background | Kind |
| --- | --- | --- |
| \`--color-fg\` | \`--color-bg\` | text |
`);

    expect(parsed).toEqual(
      new Map([
        ["--color-bg", { light: "#f8fafc", dark: "#020617" }],
        ["--radius-md", { light: "0.5rem", dark: "0.5rem" }],
      ]),
    );
  });
});

describe("tokens.css and docs/design.md", () => {
  it("documents every token the file defines", () => {
    const undocumented = [...tokens.keys()].filter((name) => !guide.has(name));
    expect(undocumented).toEqual([]);
  });

  it("defines every token the guide lists", () => {
    const undefinedTokens = [...guide.keys()].filter((name) => !tokens.has(name));
    expect(undefinedTokens).toEqual([]);
  });

  it("gives each colour token the same light and dark values in both", () => {
    const drift = [...tokens]
      .filter(([name]) => name.startsWith("--color-"))
      .filter(([name, value]) => {
        const documented = guide.get(name);
        return documented?.light !== value.light || documented.dark !== value.dark;
      })
      .map(([name, value]) => ({ name, file: value, guide: guide.get(name) }));

    expect(drift).toEqual([]);
  });
});
