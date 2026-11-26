// SessionStart (startup, resume, clear, compact): tells Claude which task this
// branch is for, and what is in and out of scope, so the objective survives
// /clear and context compaction.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { currentBranch, worktreeRoot } from "../lib/git.ts";
import { projectDir, readHookInput, str } from "../lib/hook-io.ts";
import { MAIN_BRANCHES } from "../lib/policy.ts";
import { loadWorkspace, splitSections, taskIdFromBranch } from "../lib/tasks.ts";

const input = readHookInput();
const root = worktreeRoot(str(input.cwd) ?? projectDir(input)) ?? projectDir(input);
const branch = currentBranch(root);
const { tasks } = loadWorkspace(root);
const taskId = taskIdFromBranch(branch);
const lines = ["[harness] Session context. Rules for working here are in CLAUDE.md."];

if (branch !== null && MAIN_BRANCHES.has(branch)) {
  lines.push(`Branch: ${branch}. Edits and commits are blocked on ${branch}.`);
  const open = tasks.filter((task) => task.status !== "done");
  lines.push(
    open.length === 0
      ? "There are no open tasks."
      : `Open tasks: ${open.map((task) => `${task.spec.id} ${task.spec.title} (${task.status})`).join("; ")}.`,
  );
  lines.push(
    "To change code, start a task with /start-task <id>, or draft a new spec with /new-task.",
  );
} else if (taskId === null) {
  lines.push(
    `Branch: ${branch ?? "(detached HEAD)"}. It isn't a task branch, so no task is active. ` +
      "If this work belongs to a task, ask the user which one.",
  );
} else {
  const task = tasks.find((candidate) => candidate.spec.id === taskId);
  if (!task) {
    lines.push(
      `Branch ${branch ?? ""} is for task ${taskId}, but tasks/${taskId}-*.md doesn't exist. Ask the user.`,
    );
  } else {
    const { spec, progress } = task;
    lines.push(`Active task ${spec.id}: ${spec.title} (${task.status}). Spec: ${spec.file}`);
    lines.push(`Objective: ${spec.objective.replace(/\s+/g, " ")}`);
    lines.push(
      "Acceptance criteria:",
      ...spec.criteria.map((criterion) => `- ${criterion.id}: ${criterion.text}`),
    );
    lines.push("Out of scope:", ...spec.outOfScope.map((item) => `- ${item}`));
    if (progress) {
      const log = splitSections(readFileSync(join(root, progress.file), "utf8")).get("log") ?? "";
      const recent = log
        .split("\n")
        .filter((line) => line.trim() !== "")
        .slice(-12);
      lines.push(
        `Progress file: ${progress.file}. Recent log:`,
        ...(recent.length ? recent : ["(empty)"]),
      );
    } else {
      lines.push(
        `No progress file yet: create progress/${spec.id}-${spec.slug}.md (see /start-task).`,
      );
    }
    lines.push(
      'Stay inside this task. Record anything unrelated under "Discovered" in the progress file instead of fixing it. Finish with /finish-task.',
    );
  }
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") },
  }),
);
