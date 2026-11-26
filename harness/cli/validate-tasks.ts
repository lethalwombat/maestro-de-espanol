// `npm run tasks:check`: validates every task spec and progress file, and
// refuses `status: done` while acceptance evidence or Definition of Done items
// are missing.
import { resolve } from "node:path";
import { loadWorkspace } from "../lib/tasks.ts";

const { tasks, problems } = loadWorkspace(resolve(import.meta.dirname, "..", ".."));

if (problems.length > 0) {
  console.error(problems.map((problem) => `✖ ${problem}`).join("\n"));
  console.error(`\n${String(problems.length)} problem(s). Task format: tasks/README.md`);
  process.exit(1);
}
const withProgress = tasks.filter((task) => task.progress !== null).length;
console.log(
  `✔ ${String(tasks.length)} task spec(s) and ${String(withProgress)} progress file(s) are valid.`,
);
