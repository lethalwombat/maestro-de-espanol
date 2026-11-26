// Code-graded checks for sentence feedback. Each check is atomic so a failure
// says what went wrong, not just that something did.
import { z } from "zod";
import type { Feedback } from "@/features/sentence-feedback/schema";
import type { Checks, EvalCase } from "../lib/runner";
import suiteFile from "./suite.json";

const ExpectedSchema = z.object({
  verdict: z.enum(["correct", "has_errors", "not_spanish"]),
  correctedIncludes: z.array(z.string()).optional(),
});

const SuiteSchema = z.object({
  minPassRate: z.number().min(0).max(1),
  maxRefusals: z.number().int().min(0),
  reps: z.number().int().min(1),
  cases: z
    .array(
      z.object({
        id: z.string(),
        input: z.string(),
        expect: ExpectedSchema,
        reference: z.object({
          corrected: z.string(),
          issues: z.array(z.object({ original: z.string(), correction: z.string() })),
        }),
      }),
    )
    .min(1),
});

export type Expected = z.infer<typeof ExpectedSchema>;
export type SuiteCase = EvalCase<string, Expected> & z.infer<typeof SuiteSchema>["cases"][number];

export const SUITE = SuiteSchema.parse(suiteFile);

/** Compare text the way a teacher would: Unicode-normalised, case- and spacing-insensitive, accents kept. */
export function normalize(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function gradeFeedback(output: Feedback, testCase: EvalCase<string, Expected>): Checks {
  const { input, expect } = testCase;
  const corrected = normalize(output.corrected);
  const checks: Checks = { verdict: output.verdict === expect.verdict };

  if (expect.verdict === "has_errors") {
    checks.correction = (expect.correctedIncludes ?? []).every((fragment) =>
      corrected.includes(normalize(fragment)),
    );
    checks.issues_listed = output.issues.length > 0;
    checks.issues_quote_input = output.issues.every((issue) =>
      normalize(input).includes(normalize(issue.original)),
    );
  } else {
    checks.no_issues = output.issues.length === 0;
  }

  if (expect.verdict === "correct") {
    checks.unchanged = corrected === normalize(input);
  }
  return checks;
}
