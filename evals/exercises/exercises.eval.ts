// Runs exercise generation against the real Claude API with the DEFAULT prompt in
// code (not a stored one), then has Claude judge each exercise. Costs money: run
// it deliberately with `npm run evals` (see the run-evals skill).
//
// Sweeps: EVAL_MODEL / EVAL_EFFORT change the generator only; the judge always
// runs on the production config, so the yardstick doesn't move. EVAL_REPS
// overrides the rep count.
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { generateExercise } from "@/features/exercises/generate";
import { DEFAULT_EXERCISE_PROMPT } from "@/features/exercises/prompt";
import { getAnthropicClient } from "@/lib/llm/client";
import { type Effort, LLM_CONFIG } from "@/lib/llm/config";
import { costUsd } from "../lib/pricing";
import { type Attempt, formatSummary, runSuite } from "../lib/runner";
import { gradeExerciseOutput, type JudgedOutput, SUITE } from "./grade";
import { judgeExercise } from "./judge";

const overrides = {
  model: process.env.EVAL_MODEL ?? LLM_CONFIG.model,
  effort: (process.env.EVAL_EFFORT as Effort | undefined) ?? LLM_CONFIG.effort,
};

const judgeCost = { usd: 0, unknown: 0, calls: 0 };

async function run(topic: string): Promise<Attempt<JudgedOutput>> {
  const client = getAnthropicClient();
  const started = performance.now();
  const result = await generateExercise(client, topic, DEFAULT_EXERCISE_PROMPT, overrides);
  const { usage } = result.message;
  const meta = {
    model: result.message.model,
    stopReason: result.message.stop_reason,
    latencyMs: performance.now() - started,
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    },
  };
  if (!result.ok) {
    if (result.reason === "refused") return { kind: "refused", meta };
    if (result.reason === "truncated") return { kind: "truncated", meta };
    return { kind: "invalid", detail: result.detail, meta };
  }

  const { exercise } = result.data;
  if (exercise === null)
    return { kind: "output", output: { output: result.data, judge: null }, meta };

  const verdict = await judgeExercise(client, topic, exercise);
  judgeCost.calls += 1;
  const judgeUsd = costUsd(verdict.message.model, {
    inputTokens: verdict.message.usage.input_tokens,
    outputTokens: verdict.message.usage.output_tokens,
    cacheWriteTokens: verdict.message.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: verdict.message.usage.cache_read_input_tokens ?? 0,
  });
  if (judgeUsd === null) judgeCost.unknown += 1;
  else judgeCost.usd += judgeUsd;
  // A judge that can't give a verdict is a broken yardstick, not a model failure:
  // throwing records it as an infra error, which fails the run loudly.
  if (!verdict.ok) throw new Error(`judge ${verdict.reason}: ${verdict.detail}`);

  return { kind: "output", output: { output: result.data, judge: verdict.data }, meta };
}

test("exercise generation meets its pass-rate threshold", async () => {
  const summary = await runSuite({
    name: "exercises",
    cases: SUITE.cases,
    reps: Number(process.env.EVAL_REPS ?? SUITE.reps),
    concurrency: 4,
    timeoutMs: 240_000,
    minPassRate: SUITE.minPassRate,
    maxRefusals: SUITE.maxRefusals,
    expectedModel: overrides.model,
    run,
    grade: gradeExerciseOutput,
    outDir: fileURLToPath(new URL("../results", import.meta.url)),
  });

  console.log(formatSummary(summary));
  console.log(
    `  judge: ${String(judgeCost.calls)} calls, cost $${judgeCost.usd.toFixed(4)}` +
      (judgeCost.unknown ? ` (+${String(judgeCost.unknown)} at an unknown rate)` : ""),
  );
  expect(summary.attempts.errors, "infra errors: see errors.jsonl").toBe(0);
  expect(summary.passed).toBe(true);
});
