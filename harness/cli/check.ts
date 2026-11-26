// `npm run check` and `npm run verify`: every quality gate in one command, with
// a compact report of what failed. Steps run in parallel and none is skipped
// because another failed, so one run shows every problem.
//
//   node harness/cli/check.ts          tasks, format, typecheck, lint, unit tests + coverage
//   node harness/cli/check.ts --full   all of the above, then production build + e2e
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

interface Step {
  name: string;
  commands: Array<[string, string[]]>;
}

const root = resolve(import.meta.dirname, "..", "..");
const bin = (name: string) => join(root, "node_modules", ".bin", name);
const full = process.argv.includes("--full");
const TAIL = 60;

const STEPS: Step[] = [
  { name: "tasks", commands: [[process.execPath, ["harness/cli/validate-tasks.ts"]]] },
  { name: "format", commands: [[bin("prettier"), ["--check", "--log-level=warn", "."]]] },
  {
    name: "typecheck",
    commands: [
      [bin("next"), ["typegen"]],
      [bin("tsc"), ["--noEmit", "--pretty", "false"]],
    ],
  },
  { name: "lint", commands: [[bin("eslint"), ["--max-warnings=0", "."]]] },
  {
    name: "unit",
    commands: [[bin("vitest"), ["run", "--coverage", "--coverage.reporter=text-summary"]]],
  },
];
const E2E: Step = { name: "e2e", commands: [[bin("playwright"), ["test"]]] };

interface Outcome {
  name: string;
  ok: boolean;
  seconds: number;
  output: string;
}

function exec(command: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((done) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", (error) => {
      done({ code: 1, output: `${output}\n${error.message}` });
    });
    child.on("close", (code) => {
      done({ code: code ?? 1, output });
    });
  });
}

async function runStep(step: Step): Promise<Outcome> {
  const started = performance.now();
  let output = "";
  for (const [command, args] of step.commands) {
    const result = await exec(command, args);
    output += result.output;
    if (result.code !== 0) {
      return { name: step.name, ok: false, seconds: (performance.now() - started) / 1000, output };
    }
  }
  return { name: step.name, ok: true, seconds: (performance.now() - started) / 1000, output };
}

const outcomes = await Promise.all(STEPS.map(runStep));
// The build needs the CPU and .next/ to itself, so e2e runs after the rest.
if (full) outcomes.push(await runStep(E2E));

const failed = outcomes.filter((outcome) => !outcome.ok);
console.log(`harness check${full ? " --full" : ""}:`);
for (const outcome of outcomes) {
  console.log(`  ${outcome.ok ? "✔" : "✖"} ${outcome.name} (${outcome.seconds.toFixed(1)}s)`);
}
for (const outcome of failed) {
  const lines = outcome.output.trim().split("\n");
  console.log(
    `\n── ${outcome.name} failed${lines.length > TAIL ? ` (last ${String(TAIL)} lines)` : ""} ──`,
  );
  console.log(lines.slice(-TAIL).join("\n"));
}
console.log(
  failed.length === 0
    ? "\nAll checks passed."
    : `\n${String(failed.length)} check(s) failed: ${failed.map((outcome) => outcome.name).join(", ")}.`,
);
process.exit(failed.length === 0 ? 0 : 1);
