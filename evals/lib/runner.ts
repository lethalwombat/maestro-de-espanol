// A small, honest eval runner. What it guarantees, following the eval health
// checklist in Anthropic's claude-api skill:
// - every (case, rep) is recorded with its output, stop reason, usage and latency
// - infrastructure failures (API errors, timeouts, the wrong model serving the
//   request) go to errors.jsonl and are never scored as model failures
// - refusals are their own metric, not silent zeros
// - truncated outputs are reported, not averaged in as wrong answers
// - several reps per case, with the rep-to-rep spread reported
// - cost comes from recorded usage at the serving model's rates
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { costUsd, type Usage } from "./pricing";

export interface EvalCase<Input, Expected> {
  id: string;
  input: Input;
  expect: Expected;
}

export interface AttemptMeta {
  model: string;
  stopReason: string | null;
  usage: Usage;
  latencyMs: number;
}

/** What one call to the system under test produced. Throwing means an infra error. */
export type Attempt<Output> =
  | { kind: "output"; output: Output; meta: AttemptMeta }
  | { kind: "refused"; meta: AttemptMeta }
  | { kind: "truncated"; meta: AttemptMeta }
  /** Output that couldn't be used (e.g. failed the schema). Counts as a failure. */
  | { kind: "invalid"; detail: string; meta: AttemptMeta };

export type Checks = Record<string, boolean>;

export interface SuiteDefinition<Input, Expected, Output> {
  name: string;
  cases: Array<EvalCase<Input, Expected>>;
  reps: number;
  concurrency: number;
  timeoutMs: number;
  minPassRate: number;
  maxRefusals: number;
  expectedModel: string;
  run: (input: Input) => Promise<Attempt<Output>>;
  grade: (output: Output, testCase: EvalCase<Input, Expected>) => Checks;
  outDir: string;
}

export interface ResultRow {
  case: string;
  rep: number;
  status: "scored" | "refused" | "truncated" | "invalid";
  passed: boolean;
  checks: Checks;
  output?: unknown;
  detail?: string;
  meta: AttemptMeta;
  costUsd: number | null;
}

export interface ErrorRow {
  case: string;
  rep: number;
  errorClass: "api_error" | "timeout" | "served_model_mismatch";
  message: string;
}

export interface SuiteSummary {
  suite: string;
  runId: string;
  model: string;
  cases: number;
  reps: number;
  attempts: { total: number; graded: number; refused: number; truncated: number; errors: number };
  passRate: number;
  passRateByRep: number[];
  repSpread: number;
  checkPassRates: Record<string, number>;
  failures: Array<{ case: string; rep: number; failedChecks: string[] }>;
  costUsd: number | null;
  latencyMs: { p50: number; p90: number };
  threshold: { minPassRate: number; maxRefusals: number };
  passed: boolean;
  resultsDir: string;
}

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(`timed out after ${String(ms)}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export async function runSuite<Input, Expected, Output>(
  suite: SuiteDefinition<Input, Expected, Output>,
): Promise<SuiteSummary> {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const resultsDir = join(suite.outDir, suite.name, runId);
  const rows: ResultRow[] = [];
  const errors: ErrorRow[] = [];

  const jobs = suite.cases.flatMap((testCase) =>
    Array.from({ length: suite.reps }, (_, rep) => ({ testCase, rep })),
  );

  await pool(jobs, suite.concurrency, async ({ testCase, rep }) => {
    let attempt: Attempt<Output>;
    try {
      attempt = await withTimeout(suite.run(testCase.input), suite.timeoutMs);
    } catch (error) {
      errors.push({
        case: testCase.id,
        rep,
        errorClass: error instanceof TimeoutError ? "timeout" : "api_error",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const { meta } = attempt;
    if (meta.model !== suite.expectedModel) {
      errors.push({
        case: testCase.id,
        rep,
        errorClass: "served_model_mismatch",
        message: `asked for ${suite.expectedModel}, served by ${meta.model}`,
      });
      return;
    }

    const base = { case: testCase.id, rep, meta, costUsd: costUsd(meta.model, meta.usage) };
    if (attempt.kind === "output") {
      const checks = suite.grade(attempt.output, testCase);
      const passed = Object.values(checks).every(Boolean);
      rows.push({ ...base, status: "scored", passed, checks, output: attempt.output });
    } else if (attempt.kind === "invalid") {
      rows.push({ ...base, status: "invalid", passed: false, checks: {}, detail: attempt.detail });
    } else {
      rows.push({ ...base, status: attempt.kind, passed: false, checks: {} });
    }
  });

  rows.sort((a, b) => a.case.localeCompare(b.case) || a.rep - b.rep);
  errors.sort((a, b) => a.case.localeCompare(b.case) || a.rep - b.rep);

  // Graded = attempts that produced a verdict on the model's ability.
  const graded = rows.filter((row) => row.status === "scored" || row.status === "invalid");
  const refused = rows.filter((row) => row.status === "refused").length;
  const truncated = rows.filter((row) => row.status === "truncated").length;
  const passRate = ratio(graded.filter((row) => row.passed).length, graded.length);

  const passRateByRep = Array.from({ length: suite.reps }, (_, rep) => {
    const inRep = graded.filter((row) => row.rep === rep);
    return ratio(inRep.filter((row) => row.passed).length, inRep.length);
  });

  const checkNames = [...new Set(graded.flatMap((row) => Object.keys(row.checks)))].sort();
  const checkPassRates = Object.fromEntries(
    checkNames.map((name) => {
      const withCheck = graded.filter((row) => name in row.checks);
      return [name, ratio(withCheck.filter((row) => row.checks[name]).length, withCheck.length)];
    }),
  );

  const costs = rows.map((row) => row.costUsd);
  const latencies = rows.map((row) => row.meta.latencyMs).sort((a, b) => a - b);

  const summary: SuiteSummary = {
    suite: suite.name,
    runId,
    model: suite.expectedModel,
    cases: suite.cases.length,
    reps: suite.reps,
    attempts: {
      total: jobs.length,
      graded: graded.length,
      refused,
      truncated,
      errors: errors.length,
    },
    passRate,
    passRateByRep,
    repSpread: passRateByRep.length ? Math.max(...passRateByRep) - Math.min(...passRateByRep) : 0,
    checkPassRates,
    failures: graded
      .filter((row) => !row.passed)
      .map((row) => ({
        case: row.case,
        rep: row.rep,
        failedChecks:
          row.status === "invalid"
            ? ["invalid_output"]
            : Object.entries(row.checks)
                .filter(([, ok]) => !ok)
                .map(([name]) => name),
      })),
    costUsd: costs.some((cost) => cost === null)
      ? null
      : costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0),
    latencyMs: { p50: percentile(latencies, 50), p90: percentile(latencies, 90) },
    threshold: { minPassRate: suite.minPassRate, maxRefusals: suite.maxRefusals },
    passed: graded.length > 0 && passRate >= suite.minPassRate && refused <= suite.maxRefusals,
    resultsDir,
  };

  mkdirSync(resultsDir, { recursive: true });
  const jsonl = (items: unknown[]) => items.map((item) => JSON.stringify(item)).join("\n") + "\n";
  writeFileSync(join(resultsDir, "results.jsonl"), jsonl(rows));
  writeFileSync(join(resultsDir, "errors.jsonl"), jsonl(errors));
  writeFileSync(join(resultsDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(
    join(suite.outDir, suite.name, "latest.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );

  return summary;
}

export function formatSummary(summary: SuiteSummary): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  const lines = [
    `eval ${summary.suite} on ${summary.model}: ${summary.passed ? "PASS" : "FAIL"}`,
    `  pass rate ${pct(summary.passRate)} (threshold ${pct(summary.threshold.minPassRate)}), ` +
      `per rep ${summary.passRateByRep.map(pct).join(" / ")}, spread ${pct(summary.repSpread)}`,
    `  attempts ${String(summary.attempts.total)}: graded ${String(summary.attempts.graded)}, ` +
      `refused ${String(summary.attempts.refused)} (max ${String(summary.threshold.maxRefusals)}), ` +
      `truncated ${String(summary.attempts.truncated)}, infra errors ${String(summary.attempts.errors)}`,
    `  checks: ${Object.entries(summary.checkPassRates)
      .map(([name, rate]) => `${name} ${pct(rate)}`)
      .join(", ")}`,
    `  cost ${summary.costUsd === null ? "unknown" : `$${summary.costUsd.toFixed(4)}`}, ` +
      `latency p50 ${String(Math.round(summary.latencyMs.p50))}ms p90 ${String(Math.round(summary.latencyMs.p90))}ms`,
    ...summary.failures.map(
      (failure) =>
        `  ✖ ${failure.case} rep ${String(failure.rep)}: ${failure.failedChecks.join(", ")}`,
    ),
    `  details: ${summary.resultsDir}`,
  ];
  return lines.join("\n");
}
