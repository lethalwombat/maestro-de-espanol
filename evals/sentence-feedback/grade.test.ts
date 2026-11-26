// Tests the grader itself: the gold answers must pass, and trivial or
// plausible-but-wrong answers must fail. A grader that can't tell these apart
// makes every eval score meaningless.
import { describe, expect, it } from "vitest";
import type { Feedback } from "@/features/sentence-feedback/schema";
import { gradeFeedback, normalize, SUITE } from "./grade";

const allPass = (checks: Record<string, boolean>) => Object.values(checks).every(Boolean);

function reference(testCase: (typeof SUITE.cases)[number]): Feedback {
  return {
    verdict: testCase.expect.verdict,
    corrected: testCase.reference.corrected,
    issues: testCase.reference.issues.map((issue) => ({ ...issue, explanation: "Gold answer." })),
  };
}

describe("sentence-feedback grader", () => {
  it("covers every verdict, so neither 'always correct' nor 'always wrong' can score well", () => {
    const verdicts = new Set(SUITE.cases.map((testCase) => testCase.expect.verdict));

    expect(verdicts).toEqual(new Set(["correct", "has_errors", "not_spanish"]));
  });

  it("has unique case ids", () => {
    const ids = SUITE.cases.map((testCase) => testCase.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SUITE.cases.map((testCase) => [testCase.id, testCase] as const))(
    "passes the gold answer for %s",
    (_id, testCase) => {
      expect(gradeFeedback(reference(testCase), testCase)).toSatisfy(allPass);
    },
  );

  it("fails a do-nothing baseline on every case that has errors", () => {
    const errorCases = SUITE.cases.filter((testCase) => testCase.expect.verdict === "has_errors");

    const passing = errorCases.filter((testCase) =>
      allPass(
        gradeFeedback({ verdict: "correct", corrected: testCase.input, issues: [] }, testCase),
      ),
    );

    expect(passing).toEqual([]);
  });

  it("fails an answer with the right verdict but the wrong correction", () => {
    const testCase = SUITE.cases.find((candidate) => candidate.id === "ser-vs-estar");
    if (!testCase) throw new Error("missing case ser-vs-estar");

    const checks = gradeFeedback(
      {
        verdict: "has_errors",
        corrected: "Mi amigo estaba de México.",
        issues: [{ original: "está", correction: "estaba", explanation: "Tense." }],
      },
      testCase,
    );

    expect(checks).toMatchObject({ verdict: true, correction: false });
  });

  it("fails issues that quote text the learner never wrote", () => {
    const testCase = SUITE.cases.find((candidate) => candidate.id === "gender-agreement");
    if (!testCase) throw new Error("missing case gender-agreement");

    const checks = gradeFeedback(
      {
        verdict: "has_errors",
        corrected: "La casa es muy bonita.",
        issues: [{ original: "lindo", correction: "bonita", explanation: "Agreement." }],
      },
      testCase,
    );

    expect(checks).toMatchObject({ correction: true, issues_quote_input: false });
  });

  it("fails a 'correct' sentence that was rewritten anyway", () => {
    const testCase = SUITE.cases.find((candidate) => candidate.id === "correct-everyday");
    if (!testCase) throw new Error("missing case correct-everyday");

    const checks = gradeFeedback(
      { verdict: "correct", corrected: "Me encanta leer novelas en el tren.", issues: [] },
      testCase,
    );

    expect(checks).toMatchObject({ verdict: true, unchanged: false });
  });

  it("normalises spacing and case but keeps accents meaningful", () => {
    expect(normalize("  Después   DE clase ")).toBe("después de clase");
    expect(normalize("despues")).not.toBe(normalize("después"));
  });
});
