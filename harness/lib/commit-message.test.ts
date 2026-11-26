// The specification for commit messages (CONTRIBUTING.md). Each row is a
// header or message and the rules it breaks; an empty list means it passes.
import { describe, expect, it } from "vitest";
import {
  checkCommitMessage,
  checkHeader,
  cleanupMessage,
  COMMIT_TYPES,
  evaluateCommit,
  exemption,
  MAX_HEADER_LENGTH,
  type Rule,
} from "./commit-message.ts";

const rules = (header: string): Rule[] => checkHeader(header).problems.map((p) => p.rule);

describe("commit header (AC1)", () => {
  it.each<[string, string, Rule[]]>([
    // type
    ["type: every allowed type passes", "feat: add a validator (task 0003)", []],
    ["type: unknown type", "feature: add a validator (task 0003)", ["type"]],
    ["type: capitalised type", "Feat: add a validator (task 0003)", ["type"]],
    // scope
    ["scope: optional", "fix: handle refusals (task 0002)", []],
    ["scope: kebab-case", "feat(sentence-feedback): explain errors (task 0004)", []],
    ["scope: digits allowed", "build(node26): bump the runtime (task 0005)", []],
    ["scope: uppercase", "feat(Health): add the endpoint (task 0002)", ["scope"]],
    ["scope: underscore", "feat(sentence_feedback): explain errors (task 0004)", ["scope"]],
    ["scope: space", "feat(sentence feedback): explain errors (task 0004)", ["scope"]],
    ["scope: trailing hyphen", "feat(health-): add the endpoint (task 0002)", ["scope"]],
    ["scope: empty parentheses", "feat(): add the endpoint (task 0002)", ["scope"]],
    // separator
    ["separator: no space", "feat:add the endpoint (task 0002)", ["separator"]],
    ["separator: two spaces", "feat:  add the endpoint (task 0002)", ["separator"]],
    // subject
    ["subject: present", "docs: rollback steps (task 0002)", []],
    ["subject: empty", "docs: (task 0002)", ["subject"]],
    ["subject: blank", "docs:   (task 0002)", ["separator", "subject"]],
    ["subject: any case", "feat(health): GET /api/health reports the commit (task 0002)", []],
    // period
    ["period: none", "docs: rollback steps, then teardown (task 0002)", []],
    ["period: trailing", "docs: rollback steps. (task 0002)", ["period"]],
    ["period: after the task id", "docs: rollback steps (task 0002).", ["period", "task-id"]],
    // task id
    ["task-id: missing", "docs: rollback steps", ["task-id"]],
    ["task-id: too short", "docs: rollback steps (task 2)", ["task-id"]],
    ["task-id: wrong word", "docs: rollback steps (Task 0002)", ["task-id"]],
    ["task-id: not at the end", "docs: (task 0002) rollback steps", ["task-id"]],
    // length
    ["length: exactly the limit", `docs: ${"x".repeat(MAX_HEADER_LENGTH - 18)} (task 0002)`, []],
    ["length: one over", `docs: ${"x".repeat(MAX_HEADER_LENGTH - 17)} (task 0002)`, ["length"]],
    [
      "length: counts what a reader sees",
      `docs: ${"👍🏽".repeat(MAX_HEADER_LENGTH - 18)} (task 0002)`,
      [],
    ],
    // format
    ["format: no type at all", "Add the health endpoint", ["format"]],
    ["format: breaking-change marker", "feat!: drop the old route (task 0002)", ["format"]],
    ["format: leading space", " feat: add the endpoint (task 0002)", ["format"]],
    ["format: empty", "", ["format"]],
    ["format: too long as well", `Add ${"x".repeat(MAX_HEADER_LENGTH)}`, ["format", "length"]],
    // several at once
    [
      "several rules",
      "feature(Health):add it.",
      ["type", "scope", "separator", "period", "task-id"],
    ],
  ])("%s: %s", (_name, header, expected) => {
    expect(rules(header)).toEqual(expected);
  });

  it.each(COMMIT_TYPES)("accepts the %s type", (type) => {
    expect(rules(`${type}(harness): do the thing (task 0003)`)).toEqual([]);
  });

  it("allows exactly feat, fix, docs, test, refactor, perf, build, ci, chore and revert", () => {
    expect(COMMIT_TYPES).toEqual([
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
    ]);
    expect(MAX_HEADER_LENGTH).toBe(72);
  });

  it("parses the parts of a valid header", () => {
    expect(checkHeader("feat(sentence-feedback): explain each error (task 0004)")).toEqual({
      header: {
        type: "feat",
        scope: "sentence-feedback",
        subject: "explain each error",
        taskId: "0004",
      },
      problems: [],
    });
  });

  it("still reports the task id of an invalid header, so it can be compared", () => {
    expect(checkHeader("feature: add it (task 0003)")).toMatchObject({
      header: { taskId: "0003" },
    });
    expect(checkHeader("Add it").header).toBeNull();
  });

  it("explains each rule in words, naming what it found", () => {
    const messages = checkHeader(`feature(Health):add it. ${"x".repeat(60)}`).problems.map(
      (p) => `${p.rule}: ${p.message}`,
    );

    expect(messages).toEqual([
      expect.stringMatching(
        /^type: "feature" .*feat, fix, docs, test, refactor, perf, build, ci, chore or revert/,
      ),
      expect.stringMatching(/^scope: "Health" .*kebab-case/),
      expect.stringMatching(/^separator: .*": "/),
      expect.stringMatching(/^task-id: .*\(task NNNN\)/),
      expect.stringMatching(/^length: .*84 characters.*72/),
    ]);
    expect(checkHeader("Add it").problems[0]?.message).toContain(
      "type(scope): subject (task NNNN)",
    );
    expect(checkHeader("docs: (task 0002)").problems[0]?.message).toMatch(/subject is empty/);
    expect(checkHeader("docs: x. (task 0002)").problems[0]?.message).toMatch(/period/);
  });
});

describe("commit message body (AC1)", () => {
  const messageRules = (message: string): Rule[] => {
    const result = checkCommitMessage(message);
    return result.exempt === null ? result.problems.map((p) => p.rule) : [];
  };

  it.each<[string, string, Rule[]]>([
    ["header only", "fix: handle refusals (task 0002)", []],
    ["header only, trailing newline", "fix: handle refusals (task 0002)\n", []],
    ["body after a blank line", "fix: handle refusals (task 0002)\n\nWhy it broke.\n", []],
    [
      "trailers in the body",
      "fix: handle refusals (task 0002)\n\nWhy.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n",
      [],
    ],
    ["body without the blank line", "fix: handle refusals (task 0002)\nWhy it broke.\n", ["body"]],
    ["bad header and body", "fix handle refusals\nWhy it broke.\n", ["format", "body"]],
  ])("%s", (_name, message, expected) => {
    expect(messageRules(message)).toEqual(expected);
  });

  it("explains the body rule", () => {
    const result = checkCommitMessage("fix: x (task 0002)\nbody");

    expect(result.problems).toEqual([
      { rule: "body", message: expect.stringMatching(/blank line/) as string },
    ]);
  });
});

describe("exemptions for git's own messages (AC2)", () => {
  it.each([
    ["git merge", "Merge branch 'main' into task/0003-contribution-standards"],
    ["a merged pull request", "Merge pull request #2 from lethalwombat/task/0002-azure-deploy"],
    ["git pull", "Merge remote-tracking branch 'origin/main'"],
    [
      "git revert",
      'Revert "feat(health): GET /api/health reports status and build commit (task 0002)"\n\nThis reverts commit dcc2df2.\n',
    ],
    ["git commit --fixup", "fixup! feat(harness): add the validator (task 0003)"],
    [
      "git commit --squash",
      "squash! feat(harness): add the validator (task 0003)\n\nMore detail.\n",
    ],
    [
      "git commit --fixup=amend:",
      "amend! feat(harness): add the validator (task 0003)\n\nfeat(harness): add the commit validator (task 0003)\n",
    ],
  ])("exempts %s", (_name, message) => {
    expect(exemption(message)).not.toBeNull();
    expect(checkCommitMessage(message)).toMatchObject({ problems: [] });
  });

  it.each([
    ["a lowercase merge type", "merge: combine the forms (task 0003)"],
    ["Revert without git's quotes", "Revert the health endpoint"],
    ["a fixup without the bang", "fixup: the validator (task 0003)"],
    ["a fixup without the space", "fixup!feat: the validator (task 0003)"],
    ["an exemption word later in the header", "feat: Merge the forms (task 0003)"],
  ])("doesn't exempt %s", (_name, message) => {
    expect(exemption(message)).toBeNull();
  });

  it("names the exemption", () => {
    expect(exemption("Merge branch 'x'")).toMatch(/merge/i);
    expect(exemption('Revert "x"')).toMatch(/revert/i);
    expect(exemption("fixup! x")).toMatch(/fixup/);
  });
});

describe("cleaning up the message as git does before committing", () => {
  it("drops comment lines, the scissors and everything after it, and trailing spaces", () => {
    const raw = [
      "",
      "feat(harness): add the validator (task 0003)   ",
      "",
      "Why.",
      "# Please enter the commit message for your changes.",
      "#",
      "# ------------------------ >8 ------------------------",
      "# Do not modify or remove the line above.",
      "diff --git a/x b/x",
      "+added line",
      "",
    ].join("\n");

    expect(cleanupMessage(raw)).toBe("feat(harness): add the validator (task 0003)\n\nWhy.");
  });

  it("handles Windows line endings", () => {
    expect(cleanupMessage("fix: x (task 0002)\r\n\r\nWhy.\r\n")).toBe("fix: x (task 0002)\n\nWhy.");
  });
});

describe("what the commit-msg hook decides (AC3)", () => {
  const decide = (message: string, branch: string | null) =>
    evaluateCommit(message, branch).map((p) => p.rule);

  it("accepts a compliant commit naming the branch's task", () => {
    expect(decide("feat: add it (task 0003)\n", "task/0003-contribution-standards")).toEqual([]);
  });

  it("refuses a commit that breaks the format", () => {
    expect(decide("add it\n", "task/0003-contribution-standards")).toEqual(["format"]);
  });

  it("refuses a commit naming another task", () => {
    const problems = evaluateCommit(
      "feat: add it (task 0002)\n",
      "task/0003-contribution-standards",
    );

    expect(problems).toEqual([
      {
        rule: "task-match",
        message: expect.stringMatching(/0002.*task\/0003-contribution-standards.*0003/) as string,
      },
    ]);
  });

  it("compares the task id even when the header breaks another rule", () => {
    expect(decide("feat: add it. (task 0002)\n", "task/0003-x")).toEqual(["period", "task-match"]);
  });

  it("refuses non-exempt commits off a task branch, pointing to /start-task", () => {
    const problems = evaluateCommit("feat: add it (task 0003)\n", "feature/validator");

    expect(problems).toEqual([
      {
        rule: "branch",
        message: expect.stringMatching(/feature\/validator.*\/start-task/) as string,
      },
    ]);
    expect(decide("add it\n", "main")).toEqual(["branch", "format"]);
  });

  it("allows exempt commits on any branch", () => {
    expect(decide("Merge branch 'main'\n", "main")).toEqual([]);
    expect(decide("fixup! feat: add it (task 0003)\n", "feature/validator")).toEqual([]);
    expect(decide("Merge branch 'main'\n", "task/0003-x")).toEqual([]);
  });

  it("checks only the format on a detached HEAD", () => {
    expect(decide("feat: add it (task 0009)\n", null)).toEqual([]);
    expect(decide("add it\n", null)).toEqual(["format"]);
  });

  it("checks the cleaned-up message, not git's comments", () => {
    const raw = "feat: add it (task 0003)\n# Please enter the commit message\n#\n";

    expect(decide(raw, "task/0003-x")).toEqual([]);
  });
});
