// Calibrates the judge before its verdicts are trusted: it must pass the
// hand-written good exercises and catch each planted wrong key, on every rep.
// Calls the real Claude API: run it with `npm run evals`.
import { expect, test } from "vitest";
import { getAnthropicClient } from "@/lib/llm/client";
import { costUsd } from "../lib/pricing";
import { judgeExercise } from "./judge";
import { JUDGE_FIXTURES } from "./judge-fixtures";

const REPS = Number(process.env.EVAL_REPS ?? 2);

test("the judge passes good exercises and catches planted wrong keys", async () => {
  const client = getAnthropicClient();
  const jobs = JUDGE_FIXTURES.flatMap((fixture) =>
    Array.from({ length: REPS }, (_, rep) => ({ fixture, rep })),
  );

  const rows = await Promise.all(
    jobs.map(async ({ fixture, rep }) => {
      const result = await judgeExercise(client, fixture.topic, fixture.exercise);
      const usage = result.message.usage;
      const cost = costUsd(result.message.model, {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      });
      if (!result.ok) return { id: fixture.id, rep, ok: false, why: result.reason, cost };

      const flagged = result.data.items
        .filter((item) => !item.key_correct || !item.unambiguous)
        .map((item) => item.index);
      const expected = fixture.wrongKey === null ? [] : [fixture.wrongKey];
      const ok =
        result.data.items_on_topic &&
        result.data.items.length === fixture.exercise.items.length &&
        JSON.stringify(flagged) === JSON.stringify(expected);
      const why = ok
        ? "as expected"
        : `flagged ${JSON.stringify(flagged)}, expected ${JSON.stringify(expected)}; ` +
          result.data.items
            .filter((item) => flagged.includes(item.index))
            .map((item) => `#${String(item.index)}: ${item.reason}`)
            .join(" ");
      return { id: fixture.id, rep, ok, why, cost };
    }),
  );

  const total = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0);
  console.log(
    [
      `judge calibration: ${String(rows.filter((row) => row.ok).length)}/${String(rows.length)} as expected, cost $${total.toFixed(4)}`,
      ...rows.map((row) => `  ${row.ok ? "✔" : "✖"} ${row.id} rep ${String(row.rep)}: ${row.why}`),
    ].join("\n"),
  );
  expect(rows.filter((row) => !row.ok)).toEqual([]);
});
