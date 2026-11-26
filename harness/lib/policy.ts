// The guardrail policy, in one place. Hooks call these pure functions; the
// tests in policy.test.ts are the specification. Keep the rule set small: each
// rule here is something that must hold with zero exceptions. Preferences
// belong in CLAUDE.md instead.
import { isAbsolute, relative, resolve } from "node:path";
import { isWriteRedirect, parseCommandLine, type SimpleCommand } from "./shell.ts";

export const MAIN_BRANCHES: ReadonlySet<string> = new Set(["main", "master"]);

/**
 * Human-owned paths: the harness itself and the configs that define the quality
 * gates. Entries ending in "/" are directories. Mirrored as `Edit(...)` deny
 * rules in .claude/settings.json; policy.test.ts keeps the two in sync.
 */
export const PROTECTED_PATHS: readonly string[] = [
  ".claude/",
  ".githooks/",
  ".github/",
  "harness/",
  ".nvmrc",
  ".prettierignore",
  ".prettierrc.json",
  "eslint.config.mjs",
  "package-lock.json",
  "playwright.config.ts",
  "tsconfig.json",
  "vitest.config.ts",
  "vitest.evals.config.ts",
];

/**
 * Files inside PROTECTED_PATHS that agents may write, by the owner's decision.
 * Keep it short. Not mirrored in .claude/settings.json: a deny rule there would
 * override the exception, so directories holding one get file-level denies instead.
 */
export const AGENT_WRITABLE_PATHS: ReadonlySet<string> = new Set([".github/workflows/deploy.yml"]);

export interface Verdict {
  decision: "deny" | "ask";
  reason: string;
}

const deny = (reason: string): Verdict => ({ decision: "deny", reason });
const ask = (reason: string): Verdict => ({ decision: "ask", reason });

export const REASONS = {
  protected: (path: string) =>
    `${path} is part of the agent harness and is human-owned (see docs/harness.md). ` +
    "Don't work around this. If you believe it needs to change, stop and tell the user exactly what you would change and why.",
  gitInternals: "Files inside .git are managed by git. Use git commands instead.",
  editOnMain:
    "Edits on main are blocked: work happens on a task branch. Run /start-task <id> " +
    "(or `git switch -c task/<id>-<slug>`). If no task covers this work yet, ask the user or draft one with /new-task.",
  commitOnMain:
    "Commits on main are blocked: commit on the task branch instead (/start-task <id> creates it).",
  pushMain:
    "Pushing to main is blocked. Push the task branch and open a pull request; a person merges it.",
  forcePush:
    "Force pushes and remote deletions are blocked: they rewrite or destroy shared history.",
  noVerify:
    "--no-verify is blocked: git hooks are part of the quality gate. Fix what the hook reports instead.",
  hooksPath: "Changing core.hooksPath is blocked: it would disable the repository's git hooks.",
  nestedClaude:
    "Starting another Claude Code process from inside a session is blocked: it could run without this project's settings and guardrails.",
  pipeToShell:
    "Piping a download straight into a shell is blocked. Download it, read it, then decide.",
  dangerousRm:
    "Recursive deletion of the repository root, home directory, .git or everything is blocked.",
  discardsWork: (what: string) =>
    `\`${what}\` discards uncommitted work. Asking the user before running it.`,
} as const;

export function normalizeRelative(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^(\.\/)+/, "")
    .replace(/\/{2,}/g, "/");
}

/** The protected entry that covers `relPath`, or null. */
export function protectedEntry(relPath: string): string | null {
  const path = normalizeRelative(relPath);
  if (AGENT_WRITABLE_PATHS.has(path)) return null;
  for (const entry of PROTECTED_PATHS) {
    const covered = entry.endsWith("/")
      ? path === entry.slice(0, -1) || path.startsWith(entry)
      : path === entry;
    if (covered) return entry;
  }
  return null;
}

export interface EditContext {
  /** Path of the file relative to the root of the worktree it lives in. */
  relPath: string;
  /** Current branch of that worktree, or null when HEAD is detached. */
  branch: string | null;
}

export function evaluateEdit({ relPath, branch }: EditContext): Verdict | null {
  const path = normalizeRelative(relPath);
  if (path === ".git" || path.startsWith(".git/")) return deny(REASONS.gitInternals);
  if (protectedEntry(path) !== null) return deny(REASONS.protected(path));
  if (branch !== null && MAIN_BRANCHES.has(branch)) return deny(REASONS.editOnMain);
  return null;
}

export interface BashContext {
  /** Directory the command runs in. */
  cwd: string;
  /** Root of this project's worktree containing cwd, or null when cwd is outside the project. */
  root: string | null;
  /** Current branch of cwd's worktree when it belongs to this project, else null. */
  branch: string | null;
  home: string;
}

const WRITE_ALL_ARGS = new Set([
  "rm",
  "rmdir",
  "touch",
  "truncate",
  "chmod",
  "chown",
  "unlink",
  "shred",
  "tee",
  // mv removes its sources as well as writing its destination.
  "mv",
]);
const WRITE_LAST_ARG = new Set(["cp", "install", "ln", "rsync"]);
const IN_PLACE = new Set(["sed", "perl", "ruby"]);
const INTERPRETERS = new Set(["node", "python", "python3", "ruby", "perl", "deno", "bun"]);
const WRITE_API =
  /writeFile|appendFile|createWriteStream|rmSync|\bunlink|\brename|copyFile|truncate|open\([^)]*['"][wa]/;
const DANGEROUS_RM_TARGETS = new Set([
  "/",
  "/*",
  "~",
  "~/",
  "~/*",
  "$HOME",
  "${HOME}",
  ".",
  "./",
  "./*",
  "..",
  "*",
  ".git",
]);

function program(cmd: SimpleCommand): string {
  return cmd.argv[0]?.split("/").pop() ?? "";
}

function expand(arg: string, ctx: BashContext): string {
  return arg
    .replace(/^\$\{?CLAUDE_PROJECT_DIR\}?/, ctx.root ?? ctx.cwd)
    .replace(/^\$\{?PWD\}?/, ctx.cwd)
    .replace(/^\$\{?HOME\}?/, ctx.home)
    .replace(/^~(?=\/|$)/, ctx.home);
}

function protectedTarget(arg: string, ctx: BashContext): string | null {
  if (ctx.root === null || arg === "" || arg.startsWith("-")) return null;
  const absolute = resolve(ctx.cwd, expand(arg, ctx));
  const rel = relative(ctx.root, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return protectedEntry(rel) === null ? null : normalizeRelative(rel);
}

function writeTargets(cmd: SimpleCommand): string[] {
  const name = program(cmd);
  const args = cmd.argv.slice(1);
  const positional = args.filter((arg) => !arg.startsWith("-"));
  const targets = cmd.redirects.filter(isWriteRedirect).map((redirect) => redirect.target);
  if (WRITE_ALL_ARGS.has(name)) targets.push(...positional);
  if (WRITE_LAST_ARG.has(name) && positional.length > 0) targets.push(positional.at(-1) ?? "");
  if (
    IN_PLACE.has(name) &&
    args.some((arg) => /^-[a-zA-Z]*i/.test(arg) || arg.startsWith("--in-place"))
  ) {
    targets.push(...positional);
  }
  return targets;
}

function interpreterWritesProtected(cmd: SimpleCommand): boolean {
  if (!INTERPRETERS.has(program(cmd))) return false;
  const flagIndex = cmd.argv.findIndex((arg) =>
    ["-e", "-c", "--eval", "-p", "--print"].includes(arg),
  );
  const script = flagIndex === -1 ? undefined : cmd.argv[flagIndex + 1];
  if (script === undefined || !WRITE_API.test(script)) return false;
  return PROTECTED_PATHS.some((entry) => script.includes(entry));
}

function splitGit(args: string[]): { globals: string[]; sub: string | undefined; rest: string[] } {
  const globals: string[] = [];
  let i = 0;
  while (i < args.length && args[i]?.startsWith("-")) {
    const arg = args[i] ?? "";
    globals.push(arg);
    if (
      (arg === "-C" || arg === "-c" || arg === "--git-dir" || arg === "--work-tree") &&
      i + 1 < args.length
    ) {
      globals.push(args[i + 1] ?? "");
      i++;
    }
    i++;
  }
  return { globals, sub: args[i], rest: args.slice(i + 1) };
}

function hasShortFlag(args: string[], flag: string, takesValue: string): boolean {
  return args.some((arg) => {
    if (!/^-[a-zA-Z]+$/.test(arg)) return false;
    const letters = arg.slice(1);
    const at = letters.indexOf(flag);
    if (at === -1) return false;
    // In `-mn`, the n is the value of -m, not a flag.
    for (let i = 0; i < at; i++) {
      if (takesValue.includes(letters.charAt(i))) return false;
    }
    return true;
  });
}

function targetsMain(refspec: string): boolean {
  const destination = refspec.includes(":") ? refspec.slice(refspec.indexOf(":") + 1) : refspec;
  return MAIN_BRANCHES.has(destination.replace(/^refs\/heads\//, ""));
}

function evaluateGit(args: string[], ctx: BashContext): Verdict | null {
  const { globals, sub, rest } = splitGit(args);
  if (globals.some((arg) => /^core\.hookspath/i.test(arg))) return deny(REASONS.hooksPath);

  switch (sub) {
    case "push": {
      if (rest.includes("--no-verify")) return deny(REASONS.noVerify);
      const forceFlags = [
        "--force",
        "--force-with-lease",
        "--force-if-includes",
        "--mirror",
        "--delete",
        "--prune",
      ];
      if (
        rest.some((arg) => forceFlags.some((flag) => arg === flag || arg.startsWith(`${flag}=`))) ||
        hasShortFlag(rest, "f", "o") ||
        hasShortFlag(rest, "d", "o")
      ) {
        return deny(REASONS.forcePush);
      }
      const positional = rest.filter((arg) => !arg.startsWith("-"));
      const refspecs = positional.slice(1);
      if (refspecs.some((spec) => spec.startsWith("+") || spec.startsWith(":")))
        return deny(REASONS.forcePush);
      if (rest.includes("--all") || refspecs.some(targetsMain)) return deny(REASONS.pushMain);
      if (refspecs.length === 0 && ctx.branch !== null && MAIN_BRANCHES.has(ctx.branch)) {
        return deny(REASONS.pushMain);
      }
      return null;
    }
    case "commit":
      if (rest.includes("--no-verify") || hasShortFlag(rest, "n", "mFCct"))
        return deny(REASONS.noVerify);
      if (ctx.branch !== null && MAIN_BRANCHES.has(ctx.branch)) return deny(REASONS.commitOnMain);
      return null;
    case "config":
      return rest.some((arg) => /^core\.hookspath$/i.test(arg)) ? deny(REASONS.hooksPath) : null;
    case "reset":
      return rest.includes("--hard") ? ask(REASONS.discardsWork("git reset --hard")) : null;
    case "clean":
      return rest.includes("--force") || hasShortFlag(rest, "f", "e")
        ? ask(REASONS.discardsWork("git clean -f"))
        : null;
    case "checkout":
      return rest.includes("--") ||
        rest.includes(".") ||
        rest.includes("-f") ||
        rest.includes("--force")
        ? ask(REASONS.discardsWork(`git checkout ${rest.join(" ")}`))
        : null;
    case "restore":
      return rest.includes("--staged") && !rest.includes("--worktree")
        ? null
        : ask(REASONS.discardsWork(`git restore ${rest.join(" ")}`));
    case "stash":
      return rest[0] === "drop" || rest[0] === "clear"
        ? ask(REASONS.discardsWork(`git stash ${rest[0]}`))
        : null;
    case "branch":
      return rest.includes("-D") ? ask(REASONS.discardsWork(`git branch ${rest.join(" ")}`)) : null;
    default:
      return null;
  }
}

function evaluateSimple(cmd: SimpleCommand, ctx: BashContext): Verdict | null {
  const name = program(cmd);
  const args = cmd.argv.slice(1);

  if (name === "claude") return deny(REASONS.nestedClaude);

  if (name === "rm") {
    const recursive = args.some((arg) => arg === "--recursive" || /^-[a-zA-Z]*[rR]/.test(arg));
    const targets = args.filter((arg) => !arg.startsWith("-"));
    if (
      recursive &&
      targets.some((target) => DANGEROUS_RM_TARGETS.has(target) || target === ".git/")
    ) {
      return deny(REASONS.dangerousRm);
    }
  }

  for (const target of writeTargets(cmd)) {
    const hit = protectedTarget(target, ctx);
    if (hit !== null) return deny(REASONS.protected(hit));
  }
  if (interpreterWritesProtected(cmd)) return deny(REASONS.protected("a protected path"));

  if (name === "git") {
    // Restoring over a protected file is a write to it: check before the generic "ask".
    const { sub, rest } = splitGit(args);
    if (sub === "checkout" || sub === "restore") {
      for (const arg of rest) {
        const hit = protectedTarget(arg, ctx);
        if (hit !== null) return deny(REASONS.protected(hit));
      }
    }
    return evaluateGit(args, ctx);
  }
  return null;
}

/** The verdict for a Bash command: the first deny wins, otherwise the first ask. */
export function evaluateBash(command: string, ctx: BashContext): Verdict | null {
  if (/\b(curl|wget)\b[^|;&\n]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(command)) {
    return deny(REASONS.pipeToShell);
  }
  let firstAsk: Verdict | null = null;
  for (const cmd of parseCommandLine(command)) {
    const verdict = evaluateSimple(cmd, ctx);
    if (verdict?.decision === "deny") return verdict;
    firstAsk ??= verdict;
  }
  return firstAsk;
}

const READ_ONLY_PROGRAMS = new Set([
  "cat",
  "head",
  "tail",
  "wc",
  "ls",
  "grep",
  "rg",
  "diff",
  "stat",
  "file",
  "pwd",
  "echo",
  "sort",
  "uniq",
  "cut",
  "tr",
  "jq",
  "basename",
  "dirname",
  "realpath",
  "true",
]);
const READ_ONLY_GIT = new Set([
  "diff",
  "log",
  "show",
  "status",
  "rev-parse",
  "ls-files",
  "merge-base",
  "blame",
  "grep",
  "describe",
  "shortlog",
  "cat-file",
]);
const READ_ONLY_SCRIPTS = new Set(["harness/cli/tasks.ts", "harness/cli/validate-tasks.ts"]);

/**
 * Subagents whose Bash is limited to evaluateReadOnlyBash. Enforced by the
 * project-wide Bash guard (hook input carries `agent_type` inside subagents),
 * so it doesn't depend on hooks in the agent's own frontmatter.
 */
export const READ_ONLY_AGENTS: ReadonlySet<string> = new Set(["reviewer"]);

/**
 * For read-only agents (the reviewer): allow only commands that can't change anything.
 * `root` lets absolute paths to the allowed scripts match.
 */
export function evaluateReadOnlyBash(command: string, root: string | null = null): Verdict | null {
  const refuse = deny(
    "This agent is read-only. Allowed: git diff/log/show/status/ls-files/merge-base/blame, " +
      "cat, head, tail, ls, grep, rg, find without actions, wc, diff, " +
      "and node harness/cli/tasks.ts or harness/cli/validate-tasks.ts.",
  );
  const script = (arg: string) =>
    normalizeRelative(root !== null && isAbsolute(arg) ? relative(root, arg) : arg);
  for (const cmd of parseCommandLine(command)) {
    if (cmd.redirects.some(isWriteRedirect)) return refuse;
    const name = program(cmd);
    const args = cmd.argv.slice(1);
    if (READ_ONLY_PROGRAMS.has(name)) continue;
    if (
      name === "find" &&
      !args.some((arg) => /^-(exec|execdir|ok|okdir|delete|fprint|fprintf|fls)/.test(arg))
    )
      continue;
    if (name === "git") {
      const { globals, sub, rest } = splitGit(args);
      const branchListing =
        sub === "branch" &&
        rest.every((arg) => ["--show-current", "--list", "-a", "-v", "-vv", "-r"].includes(arg));
      if (
        !globals.some((arg) => arg.includes("=") || arg === "-c") &&
        ((sub !== undefined && READ_ONLY_GIT.has(sub)) || branchListing)
      )
        continue;
    }
    if (name === "node" && args.length >= 1 && READ_ONLY_SCRIPTS.has(script(args[0] ?? ""))) {
      continue;
    }
    return refuse;
  }
  return null;
}
