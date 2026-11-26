import { describe, expect, it } from "vitest";
import {
  findRawMotion,
  parseTokens,
  readRepoFile,
  sourceFiles,
  TOKENS_PATH,
} from "./design-system";

const tokens = parseTokens(readRepoFile(TOKENS_PATH));

function milliseconds(value: string): number {
  const [, amount, unit] = /^([\d.]+)(ms|s)$/.exec(value) ?? [];
  if (amount === undefined) throw new Error(`${value} isn't a duration`);
  return unit === "s" ? Number(amount) * 1000 : Number(amount);
}

describe("motion tokens", () => {
  it("cap one-shot durations at 300 ms; only the spinner's turn is exempt", () => {
    const durations = [...tokens].filter(([name]) => name.startsWith("--duration-"));
    expect(durations.length).toBeGreaterThan(0);

    const tooLong = durations
      .filter(([name]) => name !== "--duration-spin")
      .filter(([, value]) => milliseconds(value.light) > 300)
      .map(([name]) => name);
    expect(tooLong).toEqual([]);
  });
});

describe("findRawMotion", () => {
  it.each([
    ["a numeric duration utility", '<div className="transition duration-300" />', "duration-300"],
    ["a named easing utility", '<div className="ease-in" />', "ease-in"],
    ["an arbitrary duration", '<div className="duration-[250ms]" />', "duration-[250ms]"],
    ["a duration in CSS", ".x { transition: opacity 250ms ease; }", "250ms"],
    ["a duration in seconds", ".x { animation-duration: 0.2s; }", "0.2s"],
    [
      "a cubic-bezier outside the tokens",
      ".x { transition-timing-function: cubic-bezier(0, 0, 1, 1); }",
      "cubic-bezier(",
    ],
  ])("catches %s", (_name, source, raw) => {
    expect(findRawMotion(source)).toContain(raw);
  });

  it.each([
    ["token utilities", '<div className="duration-(--duration-fast) ease-(--ease-out)" />'],
    ["the token animation", '<div className="animate-rise" />'],
    ["a stagger from the token", "style={{ animationDelay: `calc(var(--delay-stagger) * 2)` }}"],
  ])("allows %s", (_name, source) => {
    expect(findRawMotion(source)).toEqual([]);
  });
});

describe("the repository", () => {
  it("takes every duration and easing under src/ from the motion tokens", () => {
    const offenders = sourceFiles()
      .filter(({ path }) => /\.(?:css|tsx)$/.test(path) && path !== TOKENS_PATH)
      .filter(({ path }) => !/\.test\.tsx$/.test(path))
      .map(({ path, source }) => ({ path, raw: findRawMotion(source) }))
      .filter(({ raw }) => raw.length > 0);
    expect(offenders).toEqual([]);
  });
});
