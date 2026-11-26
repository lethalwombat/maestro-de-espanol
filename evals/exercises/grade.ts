// Checks for exercise generation. Code checks the decision to decline and the
// judge's coverage; the judge's verdict supplies topic relevance and key
// correctness. Each check is atomic so a failure says what went wrong.
import { z } from "zod";
import type { ExerciseOutput } from "@/features/exercises/schema";
import type { Checks, EvalCase } from "../lib/runner";
import type { JudgeVerdict } from "./judge";
import suiteFile from "./suite.json";

const ExpectedSchema = z.object({ onTopic: z.boolean() });

const SuiteSchema = z.object({
  minPassRate: z.number().min(0).max(1),
  maxRefusals: z.number().int().min(0),
  reps: z.number().int().min(1),
  cases: z
    .array(z.object({ id: z.string(), input: z.string().min(1), expect: ExpectedSchema }))
    .min(1),
});

export type Expected = z.infer<typeof ExpectedSchema>;

export const SUITE = SuiteSchema.parse(suiteFile);

/** What one eval attempt produced: the generated output and, for an exercise, the judge's verdict. */
export interface JudgedOutput {
  output: ExerciseOutput;
  judge: JudgeVerdict | null;
}

export function gradeExerciseOutput(
  { output, judge }: JudgedOutput,
  testCase: EvalCase<string, Expected>,
): Checks {
  if (!testCase.expect.onTopic) {
    return { declined: !output.on_topic && output.exercise === null };
  }

  const checks: Checks = { produced_exercise: output.exercise !== null };
  if (output.exercise === null) return checks;

  const items = output.exercise.items.length;
  const verdicts = judge?.items ?? [];
  checks.judge_covers_items =
    verdicts.length === items && verdicts.every((verdict, index) => verdict.index === index);
  checks.items_on_topic = judge?.items_on_topic === true;
  checks.keys_correct = verdicts.length > 0 && verdicts.every((verdict) => verdict.key_correct);
  checks.keys_unambiguous = verdicts.length > 0 && verdicts.every((verdict) => verdict.unambiguous);
  return checks;
}
