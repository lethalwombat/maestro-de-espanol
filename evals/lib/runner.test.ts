import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { costUsd } from "./pricing";
import {
  type Attempt,
  type AttemptMeta,
  formatSummary,
  runSuite,
  type SuiteDefinition,
} from "./runner";

const MODEL = "claude-opus-5-5";

function meta(overrides: Partial<AttemptMeta> = {}): AttemptMeta {
  return {
    model: MODEL,
    stopReason: "end_turn",
    usage: { inputTokens: 1000, outputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0 },
    latencyMs: 100,
    ...overrides,
  };
}

function suite(
  run: SuiteDefinition<string, string, string>["run"],
  overrides: Partial<SuiteDefinition<string, string, string>> = {},
): SuiteDefinition<string, string, string> {
  return {
    name: "echo",
    cases: [
      { id: "a", input: "a", expect: "a" },
      { id: "b", input: "b", expect: "b" },
    ],
    reps: 2,
    concurrency: 2,
    timeoutMs: 1000,
    minPassRate: 1,
    maxRefusals: 0,
    expectedModel: MODEL,
    run,
    grade: (output, testCase) => ({ exact: output === testCase.expect }),
    outDir: mkdtempSync(join(tmpdir(), "evals-")),
    ...overrides,
  };
}

const echo = (input: string): Promise<Attempt<string>> =>
  Promise.resolve({ kind: "output", output: input, meta: meta() });

describe("runSuite", () => {
  it("passes when every graded attempt passes every check (oracle)", async () => {
    const summary = await runSuite(suite(echo));

    expect(summary).toMatchObject({
      passed: true,
      passRate: 1,
      passRateByRep: [1, 1],
      repSpread: 0,
      attempts: { total: 4, graded: 4, refused: 0, truncated: 0, errors: 0 },
      checkPassRates: { exact: 1 },
      failures: [],
    });
  });

  it("fails a constant-answer baseline (null)", async () => {
    const summary = await runSuite(
      suite(() => Promise.resolve({ kind: "output", output: "a", meta: meta() })),
    );

    expect(summary.passed).toBe(false);
    expect(summary.passRate).toBe(0.5);
    expect(summary.failures).toEqual([
      { case: "b", rep: 0, failedChecks: ["exact"] },
      { case: "b", rep: 1, failedChecks: ["exact"] },
    ]);
  });

  it("keeps infra errors and timeouts out of the pass rate", async () => {
    const summary = await runSuite(
      suite(
        (input) => {
          if (input === "a") return Promise.reject(new Error("529 overloaded"));
          if (input === "b") return new Promise<never>(() => undefined);
          return echo(input);
        },
        {
          timeoutMs: 20,
          cases: ["a", "b", "c"].map((id) => ({ id, input: id, expect: id })),
        },
      ),
    );

    expect(summary.attempts).toMatchObject({ total: 6, graded: 2, errors: 4 });
    expect(summary.passRate).toBe(1);
    const errors = readFileSync(join(summary.resultsDir, "errors.jsonl"), "utf8");
    expect(errors).toContain('"errorClass":"api_error"');
    expect(errors).toContain('"errorClass":"timeout"');
  });

  it("treats a response from a different model as an infra error, not a score", async () => {
    const summary = await runSuite(
      suite(() =>
        Promise.resolve({ kind: "output", output: "a", meta: meta({ model: "claude-opus-5" }) }),
      ),
    );

    expect(summary.attempts).toMatchObject({ graded: 0, errors: 4 });
    expect(summary.passed).toBe(false);
  });

  it("reports refusals separately and fails when they exceed the limit", async () => {
    const summary = await runSuite(
      suite((input) =>
        input === "a" ? Promise.resolve({ kind: "refused", meta: meta() }) : echo(input),
      ),
    );

    expect(summary.attempts).toMatchObject({ graded: 2, refused: 2 });
    expect(summary.passRate).toBe(1);
    expect(summary.passed).toBe(false);
  });

  it("reports truncation without scoring it, and counts invalid output as a failure", async () => {
    const summary = await runSuite(
      suite((input) =>
        input === "a"
          ? Promise.resolve({ kind: "truncated", meta: meta({ stopReason: "max_tokens" }) })
          : Promise.resolve({ kind: "invalid", detail: "bad json", meta: meta() }),
      ),
    );

    expect(summary.attempts).toMatchObject({ graded: 2, truncated: 2 });
    expect(summary.passRate).toBe(0);
    expect(summary.failures[0]).toMatchObject({ failedChecks: ["invalid_output"] });
  });

  it("writes per-attempt results, a summary, and a latest pointer", async () => {
    const definition = suite(echo);
    const summary = await runSuite(definition);

    const rows = readFileSync(join(summary.resultsDir, "results.jsonl"), "utf8").trim().split("\n");
    expect(rows).toHaveLength(4);
    expect(JSON.parse(rows[0] ?? "{}")).toMatchObject({
      case: "a",
      rep: 0,
      status: "scored",
      passed: true,
    });
    const latest: unknown = JSON.parse(
      readFileSync(join(definition.outDir, "echo", "latest.json"), "utf8"),
    );
    expect(latest).toMatchObject({ runId: summary.runId });
  });

  it("formats a readable summary with cost and failures", async () => {
    const summary = await runSuite(
      suite(() => Promise.resolve({ kind: "output", output: "a", meta: meta() })),
    );

    const text = formatSummary(summary);

    expect(text).toContain("eval echo on claude-opus-5-5: FAIL");
    expect(text).toContain("pass rate 50.0%");
    expect(text).toContain("✖ b rep 0: exact");
    expect(text).toMatch(/cost \$\d+\.\d{4}/);
  });
});

describe("costUsd", () => {
  it("prices every token class at the serving model's rates", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
    };

    expect(costUsd("claude-opus-5-5", usage)).toBeCloseTo(4 + 20 + 5 + 0.2);
  });

  it("returns null for a model without known rates", () => {
    expect(
      costUsd("claude-unknown", {
        inputTokens: 1,
        outputTokens: 1,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
      }),
    ).toBeNull();
  });
});
