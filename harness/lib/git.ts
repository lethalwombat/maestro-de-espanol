import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

function run(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function runTrimmed(cwd: string, args: string[]): string | null {
  const out = run(cwd, args);
  return out === null ? null : out.trim();
}

/** Resolves symlinks (macOS /tmp -> /private/tmp) for paths that may not exist yet. */
export function realPath(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return parent === path ? path : join(realPath(parent), basename(path));
}

/** The closest existing directory at or above `path`. */
export function nearestExistingDir(path: string): string {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return statSync(current).isDirectory() ? current : dirname(current);
}

/** Root of the worktree containing `dir`, or null outside a git repository. */
export function worktreeRoot(dir: string): string | null {
  const root = runTrimmed(dir, ["rev-parse", "--show-toplevel"]);
  return root ? realPath(root) : null;
}

/** The repository's shared .git directory: identical for every worktree of a repo. */
export function commonGitDir(dir: string): string | null {
  const common = runTrimmed(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return common ? realPath(common) : null;
}

/** A path inside this worktree's git directory: never tracked, never part of the worktree. */
export function gitPath(dir: string, name: string): string | null {
  return runTrimmed(dir, ["rev-parse", "--path-format=absolute", "--git-path", name]) || null;
}

/** Current branch name (also on an unborn branch), or null when HEAD is detached. */
export function currentBranch(dir: string): string | null {
  return runTrimmed(dir, ["symbolic-ref", "--quiet", "--short", "HEAD"]) || null;
}

/** Paths with staged, unstaged or untracked changes, relative to the worktree root. */
export function changedPaths(root: string): string[] {
  const out = run(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!out) return [];
  const entries = out.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] ?? "";
    paths.push(entry.slice(3));
    // Renames and copies are followed by their source path.
    if (entry[0] === "R" || entry[0] === "C") i++;
  }
  return paths.sort();
}

/**
 * A hash of the worktree's state: HEAD plus the content of every changed path.
 * Equal fingerprints mean nothing has changed in between.
 */
export function treeFingerprint(root: string): string {
  const hash = createHash("sha256");
  hash.update(runTrimmed(root, ["rev-parse", "--verify", "--quiet", "HEAD"]) ?? "unborn");
  for (const path of changedPaths(root)) {
    hash.update(`\0${path}\0`);
    const absolute = join(root, path);
    if (existsSync(absolute) && statSync(absolute).isFile()) hash.update(readFileSync(absolute));
    else hash.update("<missing>");
  }
  return hash.digest("hex");
}
