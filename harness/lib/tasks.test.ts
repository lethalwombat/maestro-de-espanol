import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadWorkspace,
  nextTaskId,
  parseFrontmatter,
  parseSpec,
  splitSections,
  taskIdFromBranch,
} from "./tasks.ts";

const SPEC = `---
id: "0002"
title: Verb drill
---

## Objective

Learners practise conjugating regular verbs.

## Acceptance criteria

- AC1: Given a verb, the learner sees its infinitive.
- AC2: A wrong answer shows the right form.

## Out of scope

- Irregular verbs.
`;

const DOD = `# Definition of Done

- [ ] Verify passes.
- [ ] Reviewed.
`;

function progress(status: string, extra = "") {
  return `---\ntask: "0002"\nstatus: ${status}\n---\n\n## Plan\n\nDo it.\n\n## Log\n\n- started\n${extra}`;
}

const DONE_SECTIONS = `
## Acceptance evidence

- AC1: drill.test.ts "shows the infinitive"
- AC2: drill.test.ts "shows the right form"

## Definition of Done

- [x] Verify passes. (npm run verify: all green)
- [x] Reviewed.
`;

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "tasks-"));
  for (const [path, content] of Object.entries({ "docs/definition-of-done.md": DOD, ...files })) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

describe("markdown helpers", () => {
  it("parses simple frontmatter, stripping quotes and comments", () => {
    expect(parseFrontmatter('---\nid: "0001"\nstatus: done # finished\n---\nbody')).toEqual({
      data: { id: "0001", status: "done" },
      body: "body",
    });
    expect(parseFrontmatter("no frontmatter")).toBeNull();
  });

  it("splits ## sections by lower-cased heading", () => {
    const sections = splitSections("intro\n## Objective\nA\n## Out of Scope\n- b\n");

    expect([...sections.entries()]).toEqual([
      ["objective", "A"],
      ["out of scope", "- b"],
    ]);
  });
});

describe("parseSpec", () => {
  it("reads id, title, objective, criteria and out of scope", () => {
    const { value, problems } = parseSpec("tasks/0002-verb-drill.md", SPEC);

    expect(problems).toEqual([]);
    expect(value).toMatchObject({
      id: "0002",
      slug: "verb-drill",
      title: "Verb drill",
      objective: "Learners practise conjugating regular verbs.",
      criteria: [
        { id: "AC1", text: "Given a verb, the learner sees its infinitive." },
        { id: "AC2", text: "A wrong answer shows the right form." },
      ],
      outOfScope: ["Irregular verbs."],
    });
  });

  it.each([
    ["a bad file name", "tasks/verb-drill.md", SPEC, "file name"],
    ["a mismatched id", "tasks/0003-verb-drill.md", SPEC, 'id "0002" must be "0003"'],
    [
      "a missing section",
      "tasks/0002-verb-drill.md",
      SPEC.replace("## Out of scope", "## Notes"),
      "out of scope",
    ],
    [
      "an unnumbered criterion",
      "tasks/0002-verb-drill.md",
      SPEC.replace("- AC2: A", "- A"),
      'must start with "AC<n>: "',
    ],
    [
      "criteria out of order",
      "tasks/0002-verb-drill.md",
      SPEC.replace("AC2:", "AC3:"),
      "numbered AC1, AC2",
    ],
  ])("reports %s", (_label, file, markdown, message) => {
    expect(parseSpec(file, markdown).problems.join("\n")).toContain(message);
  });
});

describe("loadWorkspace", () => {
  it("lists a task without a progress file as todo", () => {
    const { tasks, problems } = loadWorkspace(workspace({ "tasks/0002-verb-drill.md": SPEC }));

    expect(problems).toEqual([]);
    expect(tasks.map((task) => task.status)).toEqual(["todo"]);
  });

  it("ignores README and TEMPLATE files in tasks/", () => {
    const { tasks, problems } = loadWorkspace(
      workspace({ "tasks/README.md": "# x", "tasks/TEMPLATE.md": "# y" }),
    );

    expect(tasks).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("accepts an in-progress task with no evidence yet", () => {
    const root = workspace({
      "tasks/0002-verb-drill.md": SPEC,
      "progress/0002-verb-drill.md": progress("in-progress"),
    });

    expect(loadWorkspace(root)).toMatchObject({ problems: [], tasks: [{ status: "in-progress" }] });
  });

  it("accepts a done task with evidence for every criterion and a ticked checklist", () => {
    const root = workspace({
      "tasks/0002-verb-drill.md": SPEC,
      "progress/0002-verb-drill.md": progress("done", DONE_SECTIONS),
    });

    expect(loadWorkspace(root)).toMatchObject({ problems: [], tasks: [{ status: "done" }] });
  });

  it.each([
    ["missing evidence", DONE_SECTIONS.replace(/- AC2:.*\n/, ""), "AC2 has no evidence"],
    ["empty evidence", DONE_SECTIONS.replace(/- AC2:.*\n/, "- AC2:\n"), "AC2 has no evidence"],
    [
      "an unticked item",
      DONE_SECTIONS.replace("- [x] Reviewed.", "- [ ] Reviewed."),
      'not ticked: "Reviewed."',
    ],
    ["a deleted item", DONE_SECTIONS.replace("- [x] Reviewed.\n", ""), 'missing: "Reviewed."'],
    [
      "no checklist at all",
      DONE_SECTIONS.replace(/## Definition of Done[\s\S]*/, ""),
      'no "## Definition of Done"',
    ],
  ])("refuses done with %s", (_label, sections, message) => {
    const root = workspace({
      "tasks/0002-verb-drill.md": SPEC,
      "progress/0002-verb-drill.md": progress("done", sections),
    });

    expect(loadWorkspace(root).problems.join("\n")).toContain(message);
  });

  it.each([
    [
      "an unknown status",
      { "progress/0002-verb-drill.md": progress("finished") },
      "status must be one of",
    ],
    [
      "an orphan progress file",
      { "progress/0009-other.md": progress("in-progress").replace("0002", "0009") },
      "has no spec",
    ],
    [
      "a misnamed progress file",
      { "progress/0002-other.md": progress("in-progress") },
      "should be named",
    ],
    ["a duplicate id", { "tasks/0002-other.md": SPEC }, "is also used by"],
  ])("reports %s", (_label, files, message) => {
    const root = workspace({ "tasks/0002-verb-drill.md": SPEC, ...files });

    expect(loadWorkspace(root).problems.join("\n")).toContain(message);
  });

  it("validates this repository's own tasks", () => {
    expect(loadWorkspace(resolve(import.meta.dirname, "..", "..")).problems).toEqual([]);
  });
});

describe("ids and branches", () => {
  it("reads the task id from a task branch name", () => {
    expect(taskIdFromBranch("task/0042-add-verbs")).toBe("0042");
    expect(taskIdFromBranch("feature/0042-add-verbs")).toBeNull();
    expect(taskIdFromBranch("task/42-add-verbs")).toBeNull();
    expect(taskIdFromBranch(null)).toBeNull();
  });

  it("proposes the next free id", () => {
    const { tasks } = loadWorkspace(workspace({ "tasks/0002-verb-drill.md": SPEC }));

    expect(nextTaskId(tasks)).toBe("0003");
    expect(nextTaskId([])).toBe("0001");
  });
});
