import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readLastGreen, readSession, updateSession, writeLastGreen } from "./gate-state.ts";
import {
  changedPaths,
  commonGitDir,
  currentBranch,
  gitPath,
  nearestExistingDir,
  realPath,
  treeFingerprint,
  worktreeRoot,
} from "./git.ts";
import { emitPermission, projectDir, str, toolInput } from "./hook-io.ts";

function git(cwd: string, ...args: string[]) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function makeRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "harness-git-")));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  git(root, "config", "commit.gpgsign", "false");
  return root;
}

function commitAll(root: string) {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "commit");
}

describe("git helpers", () => {
  let repo: string;
  beforeEach(() => {
    repo = makeRepo();
  });

  it("finds the worktree root and branch, including on an unborn branch", () => {
    mkdirSync(join(repo, "src", "deep"), { recursive: true });

    expect(worktreeRoot(join(repo, "src", "deep"))).toBe(repo);
    expect(currentBranch(repo)).toBe("main");
    expect(commonGitDir(repo)).toBe(join(repo, ".git"));
  });

  it("returns null outside a repository and on a detached HEAD", () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "harness-nogit-")));
    expect(worktreeRoot(outside)).toBeNull();
    expect(commonGitDir(outside)).toBeNull();

    writeFileSync(join(repo, "a.txt"), "a");
    commitAll(repo);
    git(repo, "checkout", "-q", "--detach");
    expect(currentBranch(repo)).toBeNull();
  });

  it("shares the common git dir across worktrees but keeps state paths per worktree", () => {
    writeFileSync(join(repo, "a.txt"), "a");
    commitAll(repo);
    const worktree = join(realpathSync(mkdtempSync(join(tmpdir(), "harness-wt-"))), "wt");
    git(repo, "worktree", "add", "-q", "-b", "task/0001-x", worktree);

    expect(commonGitDir(worktree)).toBe(commonGitDir(repo));
    expect(currentBranch(worktree)).toBe("task/0001-x");
    expect(gitPath(worktree, "claude-harness")).not.toBe(gitPath(repo, "claude-harness"));
  });

  it("lists staged, unstaged, untracked and renamed paths", () => {
    writeFileSync(join(repo, "keep.txt"), "1");
    writeFileSync(join(repo, "old.txt"), "1");
    commitAll(repo);
    writeFileSync(join(repo, "keep.txt"), "2");
    writeFileSync(join(repo, "new.txt"), "1");
    git(repo, "mv", "old.txt", "renamed.txt");

    expect(changedPaths(repo)).toEqual(["keep.txt", "new.txt", "renamed.txt"]);
  });

  it("changes the fingerprint when content, HEAD or deletions change, and only then", () => {
    writeFileSync(join(repo, "a.txt"), "1");
    const first = treeFingerprint(repo);
    expect(treeFingerprint(repo)).toBe(first);

    writeFileSync(join(repo, "a.txt"), "2");
    const edited = treeFingerprint(repo);
    expect(edited).not.toBe(first);

    commitAll(repo);
    const committed = treeFingerprint(repo);
    expect(committed).not.toBe(edited);

    rmSync(join(repo, "a.txt"));
    expect(treeFingerprint(repo)).not.toBe(committed);
  });

  it("resolves symlinked and not-yet-existing paths", () => {
    const missing = join(repo, "does", "not", "exist.ts");

    expect(realPath(missing)).toBe(missing);
    expect(nearestExistingDir(missing)).toBe(repo);
    writeFileSync(join(repo, "file.txt"), "x");
    expect(nearestExistingDir(join(repo, "file.txt"))).toBe(repo);
  });
});

describe("gate state", () => {
  it("round-trips session and last-green state inside the git directory", () => {
    const repo = makeRepo();

    expect(readSession(repo, "s/1")).toEqual({});
    updateSession(repo, "s/1", { turnStart: "a" });
    updateSession(repo, "s/1", { lastFailed: "b" });
    expect(readSession(repo, "s/1")).toEqual({ turnStart: "a", lastFailed: "b" });

    expect(readLastGreen(repo)).toBeUndefined();
    writeLastGreen(repo, "c");
    expect(readLastGreen(repo)).toBe("c");
    expect(changedPaths(repo)).toEqual([]);
  });

  it("treats a corrupt state file as empty", () => {
    const repo = makeRepo();
    mkdirSync(join(repo, ".git", "claude-harness"), { recursive: true });
    writeFileSync(join(repo, ".git", "claude-harness", "last-green.json"), "{not json");

    expect(readLastGreen(repo)).toBeUndefined();
  });
});

describe("hook io", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reads tool input and strings defensively", () => {
    expect(toolInput({ tool_input: { command: "ls" } })).toEqual({ command: "ls" });
    expect(toolInput({ tool_input: "nope" })).toEqual({});
    expect(str("x")).toBe("x");
    expect(str(1)).toBeUndefined();
  });

  it("prefers CLAUDE_PROJECT_DIR over the input's cwd", () => {
    vi.stubEnv("CLAUDE_PROJECT_DIR", "/project");
    expect(projectDir({ cwd: "/elsewhere" })).toBe("/project");

    vi.stubEnv("CLAUDE_PROJECT_DIR", undefined);
    expect(projectDir({ cwd: "/elsewhere" })).toBe("/elsewhere");
  });

  it("writes a PreToolUse permission decision", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    emitPermission({ decision: "deny", reason: "because" });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "because",
      },
    });
  });
});
