// Readers for the design system's source of truth: the token file and the
// guide's tables. The tests in this folder use them to keep code and guide in
// step. Nothing here runs in the app.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..");
export const TOKENS_PATH = "src/styles/tokens.css";
export const GUIDE_PATH = "docs/design.md";

export function readRepoFile(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

// --- Colour literals ---------------------------------------------------------

const HEX = /(?<![\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab)\(/gi;

/** Every hex colour or colour function in `source`. */
export function findColourLiterals(source: string): string[] {
  return [...source.matchAll(HEX), ...source.matchAll(COLOUR_FUNCTION)].map((match) =>
    match[0].toLowerCase(),
  );
}

const TEXT_FILE = /\.(?:css|ts|tsx|js|mjs|json|svg|md)$/;
const TEST_FILE = /\.test\.tsx?$/;

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** Text files under src/, as repo-relative paths with their contents. */
export function sourceFiles(): { path: string; source: string }[] {
  return walk("src")
    .filter((path) => TEXT_FILE.test(path))
    .map((path) => ({ path: relative(ROOT, join(ROOT, path)), source: readRepoFile(path) }));
}

/** The files that may not hold colour literals: all of src/ but the token file and tests. */
export function sourceFilesWithColourRule(): { path: string; source: string }[] {
  return sourceFiles().filter(({ path }) => path !== TOKENS_PATH && !TEST_FILE.test(path));
}

// --- Tokens ------------------------------------------------------------------

export interface TokenValue {
  light: string;
  dark: string;
}

/** The body of the first `@theme` block, found by brace matching. */
function themeBlock(css: string): string {
  const start = css.search(/@theme\b[^{]*\{/);
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    if (css[index] === "{") depth++;
    if (css[index] === "}" && --depth === 0) return css.slice(open + 1, index);
  }
  return css.slice(open + 1);
}

function splitLightDark(value: string): TokenValue {
  const [, light, dark] = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(value) ?? [];
  return light && dark ? { light, dark } : { light: value, dark: value };
}

/** The tokens a `@theme` block defines, skipping nested blocks and `--x-*: initial` resets. */
export function parseTokens(css: string): Map<string, TokenValue> {
  const tokens = new Map<string, TokenValue>();
  let depth = 0;
  let statement = "";
  for (const char of themeBlock(css.replace(/\/\*[\s\S]*?\*\//g, ""))) {
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      statement = "";
    } else if (depth === 0 && char === ";") {
      const [, name, value] = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(statement) ?? [];
      if (name && value) tokens.set(name, splitLightDark(value.replace(/\s+/g, " ")));
      statement = "";
    } else if (depth === 0) statement += char;
  }
  return tokens;
}

// --- The guide's tables ------------------------------------------------------

function tableRows(markdown: string): string[][] {
  return markdown
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim().replace(/^`|`$/g, "")),
    );
}

const isToken = (cell: string | undefined) => /^--[a-z]/.test(cell ?? "");

/**
 * Token rows from the guide: `| --token | value | use |`, and for colours
 * `| --color-x | light | dark | use |`. Contrast rows (two tokens) are skipped.
 */
export function parseGuideTokens(markdown: string): Map<string, TokenValue> {
  const tokens = new Map<string, TokenValue>();
  for (const [name, first, second] of tableRows(markdown)) {
    if (name === undefined || first === undefined || !isToken(name) || isToken(first)) continue;
    const isColour = name.startsWith("--color-") && second !== undefined;
    tokens.set(name, { light: first, dark: isColour ? second : first });
  }
  return tokens;
}

export interface ContrastPair {
  foreground: string;
  background: string;
  kind: "text" | "non-text";
}

/** Contrast rows from the guide: `| --color-fg | --color-bg | text |`. */
export function parseContrastPairs(markdown: string): ContrastPair[] {
  return tableRows(markdown).flatMap(([foreground, background, kind]): ContrastPair[] =>
    foreground && background && isToken(foreground) && isToken(background)
      ? [{ foreground, background, kind: kind === "text" ? "text" : "non-text" }]
      : [],
  );
}

// --- Contrast ----------------------------------------------------------------

function luminance(hex: string): number {
  const [, hexDigits] = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex) ?? [];
  if (hexDigits === undefined) throw new Error(`${hex} isn't a hex colour (#rgb or #rrggbb)`);
  const digits = hexDigits.length === 3 ? hexDigits.replace(/./g, "$&$&") : hexDigits;
  const linear = (offset: number) => {
    const channel = parseInt(digits.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(0) + 0.7152 * linear(2) + 0.0722 * linear(4);
}

/** WCAG 2.x contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// --- Motion ------------------------------------------------------------------

const RAW_MOTION = [
  /(?<![\w-])duration-(?:\d+|\[[^\]]*\])/g, // duration-300, duration-[250ms]
  /(?<![\w-])ease-(?:linear|in-out|in|out|\[[^\]]*\])(?![\w-])/g, // ease-in, ease-[...]
  /(?<![\w.-])\d*\.?\d+m?s\b/g, // 250ms, 0.2s
  /\bcubic-bezier\(/g,
];

/** Durations and easings written out instead of taken from the motion tokens. */
export function findRawMotion(source: string): string[] {
  return RAW_MOTION.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[0]));
}
