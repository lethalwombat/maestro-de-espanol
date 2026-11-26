import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HOOK = join(import.meta.dirname, "..", "..", ".githooks", "pre-push");
const ZERO = "0".repeat(40);
const SHA = "1".repeat(40);

// What git exports to a hook when the push starts in a linked worktree.
const WORKTREE_GIT_ENV = {
  GIT_DIR: "/real/repo/.git/worktrees/wt",
  GIT_WORK_TREE: "/real/repo/.claude/worktrees/wt",
  GIT_INDEX_FILE: "/real/repo/.git/worktrees/wt/index",
  GIT_PREFIX: "",
  GIT_COMMON_DIR: "/real/repo/.git",
  GIT_OBJECT_DIRECTORY: "/real/repo/.git/objects",
};

let bin: string;
let record: string;

beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), "pre-push-"));
  record = join(bin, "npm-call.json");
  // A fake npm that records how the hook called it instead of running the gate.
  writeFileSync(
    join(bin, "npm"),
    `#!/bin/sh\nexec "${process.execPath}" -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ args: process.argv.slice(2), env: process.env }))' "${record}" "$@"\n`,
  );
  chmodSync(join(bin, "npm"), 0o755);
});

afterEach(() => {
  rmSync(bin, { recursive: true, force: true });
});

function push(remoteRef: string, extraEnv: Record<string, string> = {}) {
  return spawnSync("sh", [HOOK, "origin", "git@example.com:repo.git"], {
    input: `refs/heads/x ${SHA} ${remoteRef} ${ZERO}\n`,
    encoding: "utf8",
    env: {
      ...process.env,
      ...WORKTREE_GIT_ENV,
      ...extraEnv,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    },
  });
}

function npmCall(): { args: string[]; env: Record<string, string> } {
  return JSON.parse(readFileSync(record, "utf8")) as {
    args: string[];
    env: Record<string, string>;
  };
}

describe(".githooks/pre-push", () => {
  it("runs check without the worktree's GIT_* variables", () => {
    const result = push("refs/heads/task/0006-x");
    expect(result.status).toBe(0);
    const call = npmCall();
    expect(call.args).toEqual(["run", "--silent", "check"]);
    expect(Object.keys(call.env).filter((key) => key in WORKTREE_GIT_ENV)).toEqual([]);
  });

  it("refuses a push to main without running check", () => {
    const result = push("refs/heads/main");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pushing to main is blocked");
    expect(existsSync(record)).toBe(false);
  });

  it("refuses a push to master without running check", () => {
    const result = push("refs/heads/master");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pushing to master is blocked");
    expect(existsSync(record)).toBe(false);
  });

  it("lets ALLOW_MAIN_PUSH=1 push to main, through check", () => {
    const result = push("refs/heads/main", { ALLOW_MAIN_PUSH: "1" });
    expect(result.status).toBe(0);
    expect(npmCall().args).toEqual(["run", "--silent", "check"]);
  });
});
