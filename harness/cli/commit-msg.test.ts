// Black-box tests for .githooks/commit-msg: real commits in a scratch
// repository whose core.hooksPath is this repo's .githooks, so git runs the
// hook exactly as it does for a contributor.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const HOOKS_DIR = resolve(import.meta.dirname, "..", "..", ".githooks");

// Variables a surrounding git process may set (when these tests run inside a
// hook) would point the scratch repo's git at this one. Undefined entries are
// left out of a child's environment.
const env: NodeJS.ProcessEnv = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith("GIT_")) env[key] = undefined;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: "pipe" }).trim();
}

interface Attempt {
  status: number | null;
  stderr: string;
}

function attempt(cwd: string, ...args: string[]): Attempt {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  return { status: result.status, stderr: result.stderr };
}

const commit = (repo: string, message: string) =>
  attempt(repo, "commit", "--quiet", "--allow-empty", "-m", message);
const lastSubject = (repo: string) => git(repo, "log", "-1", "--format=%s");

function makeRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "harness-commit-msg-")));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "commit", "-q", "--allow-empty", "-m", "init");
  git(root, "config", "core.hooksPath", HOOKS_DIR);
  return root;
}

describe(".githooks/commit-msg", () => {
  let repo: string;
  beforeEach(() => {
    repo = makeRepo();
  });

  describe("on a task branch", () => {
    beforeEach(() => {
      git(repo, "switch", "-q", "-c", "task/0003-contribution-standards");
    });

    it("lets a compliant commit through", () => {
      const result = commit(repo, "feat(harness): add the commit-msg hook (task 0003)");

      expect(result.status).toBe(0);
      expect(lastSubject(repo)).toBe("feat(harness): add the commit-msg hook (task 0003)");
    });

    it("lets a compliant commit with a body through", () => {
      const result = commit(
        repo,
        "fix: handle refusals (task 0003)\n\nWhy.\n\nCo-Authored-By: A <a@b.c>",
      );

      expect(result.status).toBe(0);
    });

    it("refuses a header that breaks the format, saying which rule and why", () => {
      const result = commit(repo, "Added the hook.");

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("format: it doesn't match type(scope): subject (task NNNN)");
      expect(result.stderr).toContain("CONTRIBUTING.md");
      expect(lastSubject(repo)).toBe("init");
    });

    it("refuses each broken rule at once", () => {
      const result = commit(repo, `feature(Harness): ${"x".repeat(70)}.`);

      expect(result.status).not.toBe(0);
      for (const rule of ["type", "scope", "period", "task-id", "length"]) {
        expect(result.stderr).toContain(`✖ ${rule}: `);
      }
    });

    it("refuses a body that doesn't follow a blank line", () => {
      const result = commit(repo, "fix: handle refusals (task 0003)\nWhy.");

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("✖ body: ");
    });

    it("refuses a commit naming another task", () => {
      const result = commit(repo, "feat(harness): add the hook (task 0002)");

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "task-match: the header names task 0002, but branch task/0003-contribution-standards is for task 0003",
      );
      expect(lastSubject(repo)).toBe("init");
    });

    it("lets git's own messages through", () => {
      writeFileSync(join(repo, "notes.txt"), "draft\n");
      git(repo, "add", "notes.txt");
      expect(commit(repo, "docs: add notes (task 0003)").status).toBe(0);
      expect(attempt(repo, "revert", "--no-edit", "HEAD").status).toBe(0);
      expect(lastSubject(repo)).toBe('Revert "docs: add notes (task 0003)"');

      git(repo, "switch", "-q", "-c", "side");
      git(repo, "commit", "-q", "--allow-empty", "--no-verify", "-m", "side work");
      git(repo, "switch", "-q", "task/0003-contribution-standards");
      expect(attempt(repo, "merge", "--no-ff", "--no-edit", "side").status).toBe(0);
      expect(lastSubject(repo)).toBe("Merge branch 'side' into task/0003-contribution-standards");

      expect(attempt(repo, "commit", "-q", "--allow-empty", "--fixup", "HEAD").status).toBe(0);
      expect(lastSubject(repo)).toBe(
        "fixup! Merge branch 'side' into task/0003-contribution-standards",
      );
    });
  });

  describe("on a branch that isn't a task branch", () => {
    beforeEach(() => {
      git(repo, "switch", "-q", "-c", "feature/hooks");
    });

    it("refuses a compliant message, pointing to /start-task", () => {
      const result = commit(repo, "feat(harness): add the hook (task 0003)");

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`branch: "feature/hooks" isn't a task branch`);
      expect(result.stderr).toContain("/start-task <id>");
      expect(lastSubject(repo)).toBe("init");
    });

    it("lets exempt messages through", () => {
      expect(attempt(repo, "commit", "-q", "--allow-empty", "--fixup", "HEAD").status).toBe(0);
      expect(lastSubject(repo)).toBe("fixup! init");
    });
  });

  describe("with a detached HEAD", () => {
    it("checks the format but not the branch", () => {
      git(repo, "switch", "-q", "--detach");

      expect(commit(repo, "feat(harness): add the hook (task 0009)").status).toBe(0);
      const refused = commit(repo, "add the hook");
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain("✖ format: ");
    });

    it("does the same mid-rebase", () => {
      git(repo, "switch", "-q", "-c", "task/0003-contribution-standards");
      expect(commit(repo, "feat(harness): add the hook (task 0003)").status).toBe(0);

      const otherTask = attempt(
        repo,
        "rebase",
        "--exec",
        "git commit -q --allow-empty -m 'chore: note from a rebase (task 0009)'",
        "HEAD~1",
      );
      expect(otherTask.status).toBe(0);
      expect(lastSubject(repo)).toBe("chore: note from a rebase (task 0009)");

      const badFormat = attempt(
        repo,
        "rebase",
        "--exec",
        "git commit -q --allow-empty -m 'note from a rebase'",
        "HEAD~1",
      );
      expect(badFormat.status).not.toBe(0);
      expect(badFormat.stderr).toContain("✖ format: ");
      git(repo, "rebase", "--abort");
    });
  });
});
