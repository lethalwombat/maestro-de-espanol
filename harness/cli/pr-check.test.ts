// Black-box tests for `npm run pr:check` (harness/cli/pr-check.ts), run the
// way CI's pr-standards job and /finish-task run it.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const CLI = resolve(import.meta.dirname, "pr-check.ts");
const TITLE = "ci(harness): enforce commit and pull request standards (task 0003)";
const BRANCH = "task/0003-contribution-standards";
const BODY = [
  "## Task\n\n0003 — tasks/0003-contribution-standards.md (part 1 of 1)",
  "## Summary\n\nAdds the hook.",
  "## Acceptance criteria\n\n- AC1: commit-message.test.ts",
  "## Verification\n\nAll checks passed.",
  "## Discovered\n\nNone",
].join("\n\n");

// Keep a surrounding git process (when these tests run inside a hook) from
// pointing the CLI's git calls at this repository.
const env: NodeJS.ProcessEnv = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith("GIT_")) env[key] = undefined;
}

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function prCheck(cwd: string, args: string[], input?: string): Run {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, env, input, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("pr:check", () => {
  let dir: string;
  let bodyFile: string;
  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "harness-pr-check-")));
    mkdirSync(join(dir, "tasks"));
    writeFileSync(join(dir, "tasks", "0003-contribution-standards.md"), "spec\n");
    bodyFile = join(dir, "body.md");
    writeFileSync(bodyFile, BODY);
  });

  const args = (title = TITLE, branch = BRANCH, body = bodyFile) => [
    "--title",
    title,
    "--body-file",
    body,
    "--branch",
    branch,
  ];

  it("exits 0 when every check passes, listing them", () => {
    const run = prCheck(dir, args());

    expect(run.status).toBe(0);
    for (const name of ["title", "branch", "title matches branch", "body"]) {
      expect(run.stdout).toContain(`✔ ${name}\n`);
    }
    expect(run.stdout).toContain("All pull request checks passed.");
  });

  it("exits non-zero naming each check that failed, with its problems", () => {
    writeFileSync(bodyFile, "## Task\n\n0003\n");
    const run = prCheck(dir, args("Add the hook.", "feature/hooks"));

    expect(run.status).toBe(1);
    expect(run.stdout).toContain("✖ title\n");
    expect(run.stdout).toContain("format: it doesn't match type(scope): subject (task NNNN)");
    expect(run.stdout).toContain("✖ branch\n");
    expect(run.stdout).toContain(`"feature/hooks" isn't a task branch`);
    expect(run.stdout).toContain("– title matches branch (skipped: the title names no task)");
    expect(run.stdout).toContain("✖ body\n");
    expect(run.stdout).toContain(`"## Summary" is missing`);
    expect(run.stdout).toContain(`"## Task" must name the spec`);
    expect(run.stdout).toContain("3 check(s) failed: title, branch, body.");
    expect(run.stdout).toContain("CONTRIBUTING.md");
  });

  it("refuses a title naming another task than the branch", () => {
    const run = prCheck(dir, args("ci(harness): enforce standards (task 0002)"));

    expect(run.status).toBe(1);
    expect(run.stdout).toContain("✖ title matches branch\n");
    expect(run.stdout).toContain("1 check(s) failed: title matches branch.");
  });

  it("looks for the spec in the repository it runs in", () => {
    const empty = realpathSync(mkdtempSync(join(tmpdir(), "harness-pr-check-")));
    const run = prCheck(empty, args());

    expect(run.status).toBe(1);
    expect(run.stdout).toContain("tasks/0003-contribution-standards.md, which doesn't exist");
  });

  it("reads the body from stdin with --body-file -", () => {
    expect(prCheck(dir, args(TITLE, BRANCH, "-"), BODY).status).toBe(0);
    expect(prCheck(dir, args(TITLE, BRANCH, "-"), "").status).toBe(1);
  });

  it("exits 2 with usage when an option is missing, unknown or unreadable", () => {
    for (const bad of [
      ["--title", TITLE, "--body-file", bodyFile],
      [...args(), "--base", "main"],
      args(TITLE, BRANCH, join(dir, "missing.md")),
    ]) {
      const run = prCheck(dir, bad);
      expect(run.status).toBe(2);
      expect(run.stderr).toContain("usage: npm run pr:check -- --title");
    }
  });
});
