// The specification for pull requests (CONTRIBUTING.md): what `npm run
// pr:check` and CI's pr-standards job accept and refuse.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkPullRequest, PR_SECTIONS, type PullRequest } from "./pull-request.ts";

const TEMPLATE = readFileSync(
  resolve(import.meta.dirname, "..", "..", ".github", "pull_request_template.md"),
  "utf8",
);

const sections = {
  Task: "0003 — tasks/0003-contribution-standards.md (part 1 of 1)",
  Summary: "Adds the commit-msg hook and the pr-standards check.",
  "Acceptance criteria": "- AC1: `harness/lib/commit-message.test.ts`",
  Verification: "```\nharness check --full:\n  ✔ unit (4.1s)\n\nAll checks passed.\n```",
  Discovered: "None",
};
const bodyOf = (parts: Record<string, string>) =>
  Object.entries(parts)
    .map(([heading, content]) => `## ${heading}\n\n${content}\n`)
    .join("\n");

const good: PullRequest = {
  title: "ci(harness): enforce commit and pull request standards (task 0003)",
  body: bodyOf(sections),
  branch: "task/0003-contribution-standards",
  taskFileExists: (path) => path === "tasks/0003-contribution-standards.md",
};

/** Problems per failed check, by check name. */
const failures = (change: Partial<PullRequest>) =>
  Object.fromEntries(
    checkPullRequest({ ...good, ...change })
      .filter((check) => check.problems.length > 0)
      .map((check) => [check.name, check.problems]),
  );
const skipped = (change: Partial<PullRequest>) =>
  checkPullRequest({ ...good, ...change })
    .filter((check) => check.skipped !== null)
    .map((check) => check.name);

describe("the pull request template (AC4)", () => {
  const headings = TEMPLATE.split("\n").filter((line) => line.startsWith("#"));

  it("has the five sections, in order", () => {
    expect(PR_SECTIONS).toEqual([
      "Task",
      "Summary",
      "Acceptance criteria",
      "Verification",
      "Discovered",
    ]);
    expect(headings).toEqual(PR_SECTIONS.map((section) => `## ${section}`));
  });

  it("has a one-line prompt in each section, hidden in a comment", () => {
    const blocks = TEMPLATE.split(/^## .+$/m).slice(1);
    const prompts = blocks.map((block) => block.split("\n").filter((line) => line.trim() !== ""));

    expect(prompts).toHaveLength(5);
    for (const lines of prompts) {
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^<!-- \S.* -->$/);
    }
  });

  it("gives the Task section's form", () => {
    const task = TEMPLATE.split(/^## .+$/m)[1] ?? "";

    expect(task).toContain("NNNN — tasks/NNNN-<slug>.md (part X of Y)");
  });

  it("fails pr:check until every section is filled in", () => {
    expect(failures({ body: TEMPLATE })).toEqual({
      body: PR_SECTIONS.map(
        (section) => expect.stringContaining(`"## ${section}" is empty`) as string,
      ),
    });
  });
});

describe("pr:check title and branch (AC5)", () => {
  it("passes a compliant pull request", () => {
    expect(checkPullRequest(good)).toEqual([
      { name: "title", problems: [], skipped: null },
      { name: "branch", problems: [], skipped: null },
      { name: "title matches branch", problems: [], skipped: null },
      { name: "body", problems: [], skipped: null },
    ]);
  });

  it("refuses a title that breaks the commit header rules, naming each rule", () => {
    expect(failures({ title: "Feature: Add the hook." })).toEqual({
      title: [
        expect.stringMatching(/^type: "Feature" isn't a commit type/) as string,
        expect.stringMatching(/^period: /) as string,
        expect.stringMatching(/^task-id: /) as string,
      ],
    });
    expect(Object.keys(failures({ title: `ci: ${"x".repeat(70)} (task 0003)` }))).toEqual([
      "title",
    ]);
  });

  it("doesn't give titles the exemptions commits get", () => {
    expect(
      failures({ title: "Merge pull request #3 from lethalwombat/task/0003-x" }),
    ).toHaveProperty("title");
    expect(failures({ title: "fixup! ci: x (task 0003)" })).toHaveProperty("title");
  });

  it("refuses a branch that isn't task/<id>-<slug>", () => {
    for (const branch of [
      "feature/hooks",
      "task/3-hooks",
      "task/0003",
      "Task/0003-x",
      "main",
      "",
    ]) {
      expect(failures({ branch })).toEqual({
        branch: [expect.stringContaining("task/<id>-<slug>") as string],
      });
    }
  });

  it("refuses a title naming another task than the branch", () => {
    expect(failures({ title: "ci(harness): enforce standards (task 0002)" })).toEqual({
      "title matches branch": ["the title names task 0002, but the branch is for task 0003"],
    });
  });

  it("compares the ids even when the title breaks another rule", () => {
    expect(failures({ title: "ci(harness): enforce standards. (task 0002)" })).toEqual({
      title: [expect.stringMatching(/^period: /) as string],
      "title matches branch": ["the title names task 0002, but the branch is for task 0003"],
    });
  });

  it("skips the comparison when either side has no task id", () => {
    expect(skipped({ title: "ci(harness): enforce standards" })).toEqual(["title matches branch"]);
    expect(skipped({ branch: "feature/hooks" })).toEqual(["title matches branch"]);
  });
});

describe("pr:check body (AC6)", () => {
  it.each(PR_SECTIONS)("refuses a body without ## %s", (section) => {
    const { [section]: _dropped, ...rest } = sections;

    expect(failures({ body: bodyOf(rest) })).toEqual({
      body: [`"## ${section}" is missing`],
    });
  });

  it.each(PR_SECTIONS)("refuses a body with ## %s left empty", (section) => {
    expect(failures({ body: bodyOf({ ...sections, [section]: "  \n" }) })).toEqual({
      body: [
        section === "Task"
          ? '"## Task" is empty: name the spec, like "0003 — tasks/0003-<slug>.md (part 1 of 1)"'
          : `"## ${section}" is empty: fill it in, or write "None"`,
      ],
    });
  });

  it("names every problem at once", () => {
    const { Summary: _summary, ...rest } = sections;

    expect(failures({ body: bodyOf({ ...rest, Verification: "<!-- todo -->" }) })).toEqual({
      body: ['"## Summary" is missing', '"## Verification" is empty: fill it in, or write "None"'],
    });
    expect(failures({ body: "" }).body).toHaveLength(5);
  });

  it('counts "None" as content', () => {
    expect(
      failures({ body: bodyOf({ ...sections, Summary: "None", Verification: "None" }) }),
    ).toEqual({});
  });

  it("doesn't count the template's comments as content", () => {
    expect(
      failures({ body: bodyOf({ ...sections, Summary: "<!--\nWhat changed\nand why.\n-->" }) }),
    ).toEqual({
      body: ['"## Summary" is empty: fill it in, or write "None"'],
    });
  });

  it("allows the Claude Code footer after the last section, but not as its content", () => {
    const footer = "🤖 Generated with [Claude Code](https://claude.com/claude-code)";

    expect(failures({ body: `${good.body}\n${footer}\n` })).toEqual({});
    expect(failures({ body: bodyOf({ ...sections, Discovered: footer }) })).toEqual({
      body: ['"## Discovered" is empty: fill it in, or write "None"'],
    });
  });

  it("reads bodies with Windows line endings, as GitHub's editor sends them", () => {
    expect(failures({ body: good.body.replace(/\n/g, "\r\n") })).toEqual({});
  });

  it("matches headings whatever their case", () => {
    expect(
      failures({ body: good.body.replace("## Acceptance criteria", "## Acceptance Criteria") }),
    ).toEqual({});
  });

  it("refuses a Task section that names no spec", () => {
    expect(failures({ body: bodyOf({ ...sections, Task: "Task 0003, part 1" }) })).toEqual({
      body: ['"## Task" must name the spec, like "0003 — tasks/0003-<slug>.md (part 1 of 1)"'],
    });
  });

  it("refuses a Task section naming another task's spec", () => {
    expect(
      failures({
        body: bodyOf({ ...sections, Task: "0002 — tasks/0002-azure-deploy.md (part 2 of 2)" }),
      }),
    ).toEqual({
      body: ['"## Task" names tasks/0002-azure-deploy.md, but the branch is for task 0003'],
    });
  });

  it("refuses a Task section naming a spec that doesn't exist", () => {
    expect(
      failures({
        body: bodyOf({
          ...sections,
          Task: "0003 — tasks/0003-contribution-rules.md (part 1 of 1)",
        }),
      }),
    ).toEqual({
      body: ['"## Task" names tasks/0003-contribution-rules.md, which doesn\'t exist'],
    });
  });

  it("still checks that the spec exists when the branch names no task", () => {
    expect(failures({ branch: "feature/hooks", taskFileExists: () => false })).toEqual({
      branch: [expect.any(String) as string],
      body: ['"## Task" names tasks/0003-contribution-standards.md, which doesn\'t exist'],
    });
  });
});
