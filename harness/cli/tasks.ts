// `npm run tasks`: lists tasks and their status. `--next-id` prints the id for a new task.
import { resolve } from "node:path";
import { loadWorkspace, nextTaskId } from "../lib/tasks.ts";

const { tasks, problems } = loadWorkspace(resolve(import.meta.dirname, "..", ".."));

if (process.argv.includes("--next-id")) {
  console.log(nextTaskId(tasks));
} else {
  if (tasks.length === 0) console.log("No tasks yet. Draft one with /new-task.");
  for (const task of tasks) {
    console.log(`${task.spec.id}  ${task.status.padEnd(11)}  ${task.spec.title}`);
  }
  if (problems.length > 0)
    console.log(`\n${String(problems.length)} problem(s): run npm run tasks:check`);
}
