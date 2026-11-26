// Runs the real app entry point against the real Claude API. Costs money: run it
// deliberately with `npm run evals` (see the run-evals skill), never from `npm test`.
//
// Sweeps: EVAL_MODEL / EVAL_EFFORT override the production config for one run,
// EVAL_REPS overrides the rep count.
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { getSentenceFeedback } from "@/features/sentence-feedback/get-feedback";
import { getAnthropicClient } from "@/lib/llm/client";
import { type Effort, LLM_CONFIG } from "@/lib/llm/config";
import { type Attempt, formatSummary, runSuite } from "../lib/runner";
import type { Feedback } from "@/features/sentence-feedback/schema";
import { gradeFeedback, SUITE } from "./grade";

const overrides = {
  model: process.env.EVAL_MODEL ?? LLM_CONFIG.model,
  effort: (process.env.EVAL_EFFORT as Effort | undefined) ?? LLM_CONFIG.effort,
};

async function run(sentence: string): Promise<Attempt<Feedback>> {
  const started = performance.now();
  const result = await getSentenceFeedback(getAnthropicClient(), sentence, overrides);
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
  if (result.ok) return { kind: "output", output: result.data, meta };
  if (result.reason === "refused") return { kind: "refused", meta };
  if (result.reason === "truncated") return { kind: "truncated", meta };
  return { kind: "invalid", detail: result.detail, meta };
}

test("sentence-feedback meets its pass-rate threshold", async () => {
  const summary = await runSuite({
    name: "sentence-feedback",
    cases: SUITE.cases,
    reps: Number(process.env.EVAL_REPS ?? SUITE.reps),
    concurrency: 4,
    timeoutMs: 120_000,
    minPassRate: SUITE.minPassRate,
    maxRefusals: SUITE.maxRefusals,
    expectedModel: overrides.model,
    run,
    grade: gradeFeedback,
    outDir: fileURLToPath(new URL("../results", import.meta.url)),
  });

  console.log(formatSummary(summary));
  expect(summary.attempts.errors, "infra errors: see errors.jsonl").toBe(0);
  expect(summary.passed).toBe(true);
});
