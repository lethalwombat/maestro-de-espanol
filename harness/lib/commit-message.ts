// The commit-message standard from CONTRIBUTING.md, in one place. The
// commit-msg git hook, CI's pr-standards job (for PR titles) and /finish-task
// (through `npm run pr:check`) all call these functions, so they can't drift.
// commit-message.test.ts is the specification.
import { taskIdFromBranch } from "./tasks.ts";

export const COMMIT_TYPES = [
  "feat",
  "fix",
  "docs",
  "test",
  "refactor",
  "perf",
  "build",
  "ci",
  "chore",
  "revert",
] as const;
export const MAX_HEADER_LENGTH = 72;
export const HEADER_FORMAT = "type(scope): subject (task NNNN)";

export type Rule =
  | "format"
  | "type"
  | "scope"
  | "separator"
  | "subject"
  | "period"
  | "task-id"
  | "length"
  | "body"
  | "branch"
  | "task-match";

export interface Problem {
  rule: Rule;
  message: string;
}

export interface Header {
  type: string;
  scope: string | null;
  subject: string;
  /** The four-digit id from " (task NNNN)", or null when the suffix is missing. */
  taskId: string | null;
}

export interface HeaderCheck {
  /** The parts of the header, or null when it doesn't even look like `type: subject`. */
  header: Header | null;
  problems: Problem[];
}

export interface MessageCheck extends HeaderCheck {
  /** Why git's own message is exempt, or null when the rules apply. */
  exempt: string | null;
}

// Lenient on purpose: it parses anything shaped like `type(scope): rest`, so
// each broken rule gets its own reason instead of one generic "bad format".
const SHAPE = /^([A-Za-z]+)(?:\(([^()]*)\))?(:\s*)(.*)$/;
// Exactly one space before "(task", unless the subject is empty.
const TASK_SUFFIX = /(?:^| )\(task (\d{4})\)$/;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const EXEMPTIONS: ReadonlyArray<[RegExp, string]> = [
  [/^Merge /, "a merge commit"],
  [/^Revert "/, "git revert's message"],
  [/^(?:fixup|squash|amend)! /, "a fixup!, squash! or amend! commit"],
];

const typeList = `${COMMIT_TYPES.slice(0, -1).join(", ")} or ${COMMIT_TYPES.at(-1) ?? ""}`;

export function checkHeader(text: string): HeaderCheck {
  const problems: Problem[] = [];
  const problem = (rule: Rule, message: string) => problems.push({ rule, message });
  const length = [...new Intl.Segmenter().segment(text)].length;
  const lengthProblem = () => {
    if (length > MAX_HEADER_LENGTH) {
      problem(
        "length",
        `it's ${String(length)} characters long; the limit is ${String(MAX_HEADER_LENGTH)}`,
      );
    }
  };

  const shape = SHAPE.exec(text);
  if (!shape) {
    problem("format", `it doesn't match ${HEADER_FORMAT}`);
    lengthProblem();
    return { header: null, problems };
  }
  const [, type = "", scope, separator = "", rest = ""] = shape;

  if (!(COMMIT_TYPES as readonly string[]).includes(type)) {
    problem("type", `"${type}" isn't a commit type: use ${typeList}`);
  }
  if (scope !== undefined && !KEBAB.test(scope)) {
    problem(
      "scope",
      `"${scope}" isn't lowercase kebab-case, like "harness" or "sentence-feedback" (or leave the scope out)`,
    );
  }
  if (separator !== ": ") {
    problem("separator", 'the type or scope must be followed by ": " (a colon and one space)');
  }

  const suffix = TASK_SUFFIX.exec(rest);
  const subject = suffix ? rest.slice(0, suffix.index) : rest;
  if (subject.trim() === "") problem("subject", "the subject is empty: say what the change does");
  else if (subject.endsWith(".")) problem("period", "the subject ends with a period: drop it");
  if (!suffix || (subject.trim() !== "" && subject !== subject.trimEnd())) {
    problem("task-id", 'it must end with " (task NNNN)", one space then the four-digit task id');
  }
  lengthProblem();

  return {
    header: { type, scope: scope ?? null, subject, taskId: suffix?.[1] ?? null },
    problems,
  };
}

/**
 * The message as git will store it under its default `strip` cleanup: git
 * runs commit-msg before cleaning up, so the file can still hold `#` comment
 * lines and, with `git commit -v`, a scissors line followed by the diff.
 */
export function cleanupMessage(raw: string): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const scissors = lines.findIndex((line) => /^# -+ >8 -+$/.test(line));
  const kept = (scissors === -1 ? lines : lines.slice(0, scissors))
    .filter((line) => !line.startsWith("#"))
    .map((line) => line.trimEnd());
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, ""); // blank lines only: git keeps a header's leading spaces
}

/** Why a message git generated itself is exempt from the rules, or null. */
export function exemption(message: string): string | null {
  const header = cleanupMessage(message).split("\n")[0] ?? "";
  return EXEMPTIONS.find(([pattern]) => pattern.test(header))?.[1] ?? null;
}

/** The header rules, plus the blank line before a body. Exempt messages pass. */
export function checkCommitMessage(raw: string): MessageCheck {
  const message = cleanupMessage(raw);
  const exempt = exemption(message);
  if (exempt !== null) return { exempt, header: null, problems: [] };

  const [headerLine = "", second] = message.split("\n");
  const { header, problems } = checkHeader(headerLine);
  if (second !== undefined && second !== "") {
    problems.push({
      rule: "body",
      message: "the body must be separated from the header by a blank line",
    });
  }
  return { exempt: null, header, problems };
}

/**
 * What the commit-msg hook decides for a commit on `branch` (null when HEAD is
 * detached, as during a rebase). An empty list means the commit may go ahead.
 */
export function evaluateCommit(raw: string, branch: string | null): Problem[] {
  const { exempt, header, problems } = checkCommitMessage(raw);
  if (exempt !== null || branch === null) return problems;

  const branchTask = taskIdFromBranch(branch);
  if (branchTask === null) {
    return [
      {
        rule: "branch",
        message:
          `"${branch}" isn't a task branch, and every commit belongs to a task. ` +
          "Start one with /start-task <id> (it creates task/<id>-<slug>), or switch to the task's branch.",
      },
      ...problems,
    ];
  }
  if (header?.taskId != null && header.taskId !== branchTask) {
    problems.push({
      rule: "task-match",
      message: `the header names task ${header.taskId}, but branch ${branch} is for task ${branchTask}`,
    });
  }
  return problems;
}
