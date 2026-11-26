// Black-box tests: each hook runs exactly as Claude Code runs it (JSON on stdin,
// CLAUDE_PROJECT_DIR set), against a scratch git repository.
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const HOOKS = import.meta.dirname;

const SPEC = `---
id: "0001"
title: Walking skeleton
---

## Objective

Prove the pipeline end to end.

## Acceptance criteria

- AC1: The page renders.

## Out of scope

- Styling.
`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function write(root: string, path: string, content: string): void {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), content);
}

function makeRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "harness-repo-")));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  git(root, "config", "commit.gpgsign", "false");
  write(root, "tasks/0001-walking-skeleton.md", SPEC);
  write(root, "docs/definition-of-done.md", "- [ ] Done.\n");
  write(root, "src/app.ts", "export {};\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

interface HookRun {
  status: number | null;
  stdout: string;
  stderr: string;
  json: Record<string, unknown> | null;
}

function runHook(
  hook: string,
  project: string,
  payload: Record<string, unknown>,
  args: string[] = [],
): HookRun {
  const result = spawnSync(process.execPath, [join(HOOKS, hook), ...args], {
    input: JSON.stringify({ session_id: "test-session", cwd: project, ...payload }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    encoding: "utf8",
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = result.stdout.trim() ? (JSON.parse(result.stdout) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json };
}

const decisionOf = (run: HookRun) =>
  (run.json?.hookSpecificOutput as { permissionDecision?: string } | undefined)
    ?.permissionDecision ?? "none";

describe("guard-edit", () => {
  let repo: string;
  beforeEach(() => {
    repo = makeRepo();
  });

  const edit = (filePath: string, cwd = repo) =>
    decisionOf(
      runHook("guard-edit.ts", repo, {
        cwd,
        tool_name: "Edit",
        tool_input: { file_path: filePath },
      }),
    );

  it("denies edits on main", () => {
    expect(edit(join(repo, "src/app.ts"))).toBe("deny");
  });

  it("allows edits on a task branch, including new files in new directories", () => {
    git(repo, "switch", "-q", "-c", "task/0001-walking-skeleton");

    expect(edit(join(repo, "src/app.ts"))).toBe("none");
    expect(edit(join(repo, "src/features/new/deep/file.ts"))).toBe("none");
    expect(edit("src/relative.ts")).toBe("none");
  });

  it("denies harness files on any branch", () => {
    git(repo, "switch", "-q", "-c", "task/0001-walking-skeleton");

    expect(edit(join(repo, ".claude/settings.json"))).toBe("deny");
    expect(edit(join(repo, "harness/lib/new.ts"))).toBe("deny");
    expect(edit("vitest.config.ts")).toBe("deny");
  });

  it("covers NotebookEdit's notebook_path", () => {
    const run = runHook("guard-edit.ts", repo, {
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: join(repo, "notes.ipynb") },
    });

    expect(decisionOf(run)).toBe("deny");
  });

  it("ignores files outside the project", () => {
    const elsewhere = makeRepo();

    expect(edit(join(elsewhere, "src/app.ts"))).toBe("none");
    expect(edit(join(tmpdir(), "scratch.txt"))).toBe("none");
  });

  it("judges worktrees by their own branch and paths", () => {
    const worktree = join(realpathSync(mkdtempSync(join(tmpdir(), "harness-wt-"))), "wt");
    git(repo, "worktree", "add", "-q", "-b", "task/0001-walking-skeleton", worktree);

    expect(edit(join(worktree, "src/app.ts"), worktree)).toBe("none");
    expect(edit(join(worktree, "harness/lib/x.ts"), worktree)).toBe("deny");
    expect(edit(join(repo, "src/app.ts"))).toBe("deny");
  });
});

describe("guard-bash", () => {
  let repo: string;
  beforeEach(() => {
    repo = makeRepo();
  });

  const bash = (command: string, cwd = repo) =>
    runHook("guard-bash.ts", repo, { cwd, tool_name: "Bash", tool_input: { command } });

  it("denies commits on main with a reason Claude can act on", () => {
    const run = bash("git add -A && git commit -m 'x'");

    expect(decisionOf(run)).toBe("deny");
    expect(JSON.stringify(run.json)).toContain("task branch");
  });

  it("allows commits on a task branch but still denies force pushes", () => {
    git(repo, "switch", "-q", "-c", "task/0001-walking-skeleton");

    expect(decisionOf(bash("git commit -m 'feat: x (task 0001)'"))).toBe("none");
    expect(decisionOf(bash("git push --force origin HEAD"))).toBe("deny");
  });

  it("asks before discarding work", () => {
    expect(decisionOf(bash("git reset --hard"))).toBe("ask");
  });

  it("leaves other repositories' branches alone", () => {
    const elsewhere = makeRepo();

    expect(decisionOf(bash("git commit -m x", elsewhere))).toBe("none");
  });
});

describe("guard-bash inside the reviewer subagent", () => {
  it("lets the reviewer read but not write, on any branch", () => {
    const repo = makeRepo();
    git(repo, "switch", "-q", "-c", "task/0001-walking-skeleton");
    const run = (command: string, agentType?: string) =>
      decisionOf(
        runHook("guard-bash.ts", repo, {
          tool_name: "Bash",
          tool_input: { command },
          ...(agentType === undefined ? {} : { agent_id: "a1", agent_type: agentType }),
        }),
      );

    expect(run("git diff main...HEAD", "reviewer")).toBe("none");
    expect(run("npm test", "reviewer")).toBe("deny");
    expect(run("touch notes.txt", "reviewer")).toBe("deny");
    expect(run("touch notes.txt", "general-purpose")).toBe("none");
    expect(run("touch notes.txt")).toBe("none");
  });
});

describe("session-start", () => {
  let repo: string;
  beforeEach(() => {
    repo = makeRepo();
  });

  const context = () => {
    const run = runHook("session-start.ts", repo, {
      hook_event_name: "SessionStart",
      source: "startup",
    });
    expect(run.status).toBe(0);
    return String(
      (run.json?.hookSpecificOutput as { additionalContext?: string }).additionalContext,
    );
  };

  it("on main, says edits are blocked and lists open tasks", () => {
    const text = context();

    expect(text).toContain("Edits and commits are blocked on main");
    expect(text).toContain("0001 Walking skeleton (todo)");
  });

  it("on a task branch, restates the objective, criteria, scope and recent progress", () => {
    git(repo, "switch", "-q", "-c", "task/0001-walking-skeleton");
    write(
      repo,
      "progress/0001-walking-skeleton.md",
      '---\ntask: "0001"\nstatus: in-progress\n---\n\n## Log\n\n- 2026-11-26: wrote the failing page test\n',
    );

    const text = context();

    expect(text).toContain("Active task 0001: Walking skeleton (in-progress)");
    expect(text).toContain("Objective: Prove the pipeline end to end.");
    expect(text).toContain("- AC1: The page renders.");
    expect(text).toContain("- Styling.");
    expect(text).toContain("wrote the failing page test");
  });

  it("flags a task branch whose spec is missing", () => {
    git(repo, "switch", "-q", "-c", "task/0042-ghost");

    expect(context()).toContain("tasks/0042-*.md doesn't exist");
  });

  it("notes when the branch isn't a task branch", () => {
    git(repo, "switch", "-q", "-c", "spike/idea");

    expect(context()).toContain("isn't a task branch");
  });
});

describe("turn-start + stop-gate", () => {
  let repo: string;
  let marker: string;
  // The check command records each run in a marker file outside the repo.
  const check = (exitCode: number) => [
    process.execPath,
    "-e",
    `require("fs").appendFileSync(${JSON.stringify(marker)}, "run\\n"); console.log("check output: lint failed"); process.exit(${String(exitCode)})`,
  ];
  const runs = () =>
    existsSync(marker)
      ? execFileSync("cat", [marker], { encoding: "utf8" }).split("\n").filter(Boolean).length
      : 0;
  const stop = (exitCode: number, active = false) =>
    runHook(
      "stop-gate.ts",
      repo,
      { hook_event_name: "Stop", stop_hook_active: active },
      check(exitCode),
    );
  const promptSubmitted = () =>
    runHook("turn-start.ts", repo, { hook_event_name: "UserPromptSubmit", prompt: "hi" });

  beforeEach(() => {
    repo = makeRepo();
    marker = join(realpathSync(mkdtempSync(join(tmpdir(), "harness-marker-"))), "runs.txt");
  });

  it("does nothing when Claude changed nothing this turn", () => {
    write(repo, "src/app.ts", "export const userWip = 1;\n");
    expect(promptSubmitted().stdout).toBe("");

    expect(stop(1).status).toBe(0);
    expect(runs()).toBe(0);
  });

  it("blocks with the check output when Claude's changes fail the check", () => {
    promptSubmitted();
    write(repo, "src/app.ts", "export const broken = ;\n");

    const run = stop(1);

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("Stop gate: `npm run check` failed");
    expect(run.stderr).toContain("check output: lint failed");
    expect(runs()).toBe(1);
  });

  it("lets Claude stop with a warning instead of looping when nothing changed after a block", () => {
    promptSubmitted();
    write(repo, "src/app.ts", "export const broken = ;\n");
    stop(1);

    const run = stop(1, true);

    expect(run.status).toBe(0);
    expect(String(run.json?.systemMessage)).toContain("still fails");
    expect(runs()).toBe(1);
  });

  it("re-checks after Claude makes further changes", () => {
    promptSubmitted();
    write(repo, "src/app.ts", "export const broken = ;\n");
    stop(1);
    write(repo, "src/app.ts", "export const fixed = 1;\n");

    expect(stop(0, true).status).toBe(0);
    expect(runs()).toBe(2);
  });

  it("remembers a passing state and doesn't re-run the check for it", () => {
    promptSubmitted();
    write(repo, "src/app.ts", "export const fine = 1;\n");
    expect(stop(0).status).toBe(0);

    write(repo, "src/app.ts", "export const experiment = 2;\n");
    promptSubmitted();
    write(repo, "src/app.ts", "export const fine = 1;\n");

    expect(stop(1).status).toBe(0);
    expect(runs()).toBe(1);
  });

  it("also checks committed work, not just uncommitted changes", () => {
    git(repo, "switch", "-q", "-c", "task/0001-walking-skeleton");
    promptSubmitted();
    write(repo, "src/app.ts", "export const committed = ;\n");
    git(repo, "commit", "-q", "-am", "wip");

    expect(stop(1).status).toBe(2);
  });
});

describe("post-edit", () => {
  let repo: string;
  beforeEach(() => {
    repo = makeRepo();
    // Stand-ins for the real tools, so this test checks the plumbing only.
    const bin = join(repo, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "prettier"), "#!/bin/sh\nexit 0\n");
    writeFileSync(
      join(bin, "eslint"),
      '#!/bin/sh\ncase "$*" in *bad.ts*) echo "1:1 error no-bad"; exit 1;; esac\nexit 0\n',
    );
    chmodSync(join(bin, "prettier"), 0o755);
    chmodSync(join(bin, "eslint"), 0o755);
  });

  const postEdit = (path: string) =>
    runHook("post-edit.ts", repo, { tool_name: "Edit", tool_input: { file_path: path } });

  it("reports lint errors back to Claude", () => {
    write(repo, "src/bad.ts", "x");

    const run = postEdit(join(repo, "src/bad.ts"));

    expect(run.json).toMatchObject({ decision: "block" });
    expect(String(run.json?.reason)).toContain("ESLint found problems in src/bad.ts");
  });

  it("stays quiet for clean files, files it doesn't lint and files outside the project", () => {
    write(repo, "src/good.ts", "x");
    write(repo, "notes.txt", "x");

    expect(postEdit(join(repo, "src/good.ts")).stdout).toBe("");
    expect(postEdit(join(repo, "notes.txt")).stdout).toBe("");
    expect(postEdit(join(tmpdir(), "elsewhere-bad.ts")).stdout).toBe("");
  });
});
