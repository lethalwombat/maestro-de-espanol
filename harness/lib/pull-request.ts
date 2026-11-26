// The pull request standard from CONTRIBUTING.md: the checks behind `npm run
// pr:check`, which CI's pr-standards job and /finish-task both run. The title
// goes through the same checkHeader() as every commit. pull-request.test.ts is
// the specification.
import { checkHeader } from "./commit-message.ts";
import { splitSections, TASK_BRANCH, taskIdFromBranch } from "./tasks.ts";

/** The headings of .github/pull_request_template.md, in order. */
export const PR_SECTIONS = [
  "Task",
  "Summary",
  "Acceptance criteria",
  "Verification",
  "Discovered",
] as const;

export interface PullRequest {
  title: string;
  body: string;
  /** The head branch, the one the pull request merges from. */
  branch: string;
  /** Whether a repo-relative path such as tasks/0003-x.md exists. */
  taskFileExists: (path: string) => boolean;
}

export type CheckName = "title" | "branch" | "title matches branch" | "body";

export interface CheckResult {
  name: CheckName;
  /** Empty when the check passed. */
  problems: string[];
  /** Why the check couldn't run, or null when it ran. */
  skipped: string | null;
}

const TASK_REFERENCE = /\btasks\/((\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md)\b/;
// The attribution line Claude Code adds after the last section.
const FOOTER = /^🤖 Generated with /;

/** The body's "## " sections, without HTML comments (the template's prompts) or the footer. */
function bodySections(body: string): Map<string, string> {
  const text = body
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter((line) => !FOOTER.test(line))
    .join("\n");
  return splitSections(text);
}

function checkBody(body: string, branchTask: string | null, exists: (path: string) => boolean) {
  const problems: string[] = [];
  const id = branchTask ?? "NNNN";
  const taskExample = `like "${id} — tasks/${id}-<slug>.md (part 1 of 1)"`;
  const found = bodySections(body);
  for (const section of PR_SECTIONS) {
    const content = found.get(section.toLowerCase());
    if (content === undefined) problems.push(`"## ${section}" is missing`);
    else if (content === "") {
      problems.push(
        section === "Task"
          ? `"## Task" is empty: name the spec, ${taskExample}`
          : `"## ${section}" is empty: fill it in, or write "None"`,
      );
    }
  }

  const task = found.get("task");
  if (task) {
    const reference = TASK_REFERENCE.exec(task);
    const [, file = "", referenced = ""] = reference ?? [];
    if (!reference) {
      problems.push(`"## Task" must name the spec, ${taskExample}`);
    } else if (branchTask !== null && referenced !== branchTask) {
      problems.push(`"## Task" names tasks/${file}, but the branch is for task ${branchTask}`);
    } else if (!exists(`tasks/${file}`)) {
      problems.push(`"## Task" names tasks/${file}, which doesn't exist`);
    }
  }
  return problems;
}

export function checkPullRequest({
  title,
  body,
  branch,
  taskFileExists,
}: PullRequest): CheckResult[] {
  const ran = (name: CheckName, problems: string[]): CheckResult => ({
    name,
    problems,
    skipped: null,
  });
  const headerCheck = checkHeader(title);
  const titleTask = headerCheck.header?.taskId ?? null;
  const branchTask = taskIdFromBranch(branch);

  const branchProblems = TASK_BRANCH.test(branch)
    ? []
    : [
        `"${branch}" isn't a task branch: name it task/<id>-<slug>, like task/0003-contribution-standards`,
      ];

  let match: CheckResult;
  if (titleTask === null) {
    match = { name: "title matches branch", problems: [], skipped: "the title names no task" };
  } else if (branchTask === null) {
    match = { name: "title matches branch", problems: [], skipped: "the branch names no task" };
  } else {
    match = ran(
      "title matches branch",
      titleTask === branchTask
        ? []
        : [`the title names task ${titleTask}, but the branch is for task ${branchTask}`],
    );
  }

  return [
    ran(
      "title",
      headerCheck.problems.map((problem) => `${problem.rule}: ${problem.message}`),
    ),
    ran("branch", branchProblems),
    match,
    ran("body", checkBody(body, branchTask, taskFileExists)),
  ];
}
