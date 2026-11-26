// `npm run pr:check -- --title <title> --body-file <file|-> --branch <head branch>`:
// checks a pull request's title, branch and body against CONTRIBUTING.md.
// CI's pr-standards job runs it on every pull request, and /finish-task runs it
// on its draft. The checks live in ../lib/pull-request.ts.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { worktreeRoot } from "../lib/git.ts";
import { checkPullRequest } from "../lib/pull-request.ts";

const USAGE =
  "usage: npm run pr:check -- --title <title> --body-file <file, or - for stdin> --branch <head branch>";

function usage(problem: string): never {
  console.error(`pr:check: ${problem}\n${USAGE}`);
  process.exit(2);
}

let options: { title?: string; "body-file"?: string; branch?: string };
try {
  options = parseArgs({
    options: {
      title: { type: "string" },
      "body-file": { type: "string" },
      branch: { type: "string" },
    },
  }).values;
} catch (error) {
  usage(error instanceof Error ? error.message : String(error));
}
const { title, "body-file": bodyFile, branch } = options;
if (title === undefined || bodyFile === undefined || branch === undefined) {
  usage("--title, --body-file and --branch are all required");
}

let body: string;
try {
  body = readFileSync(bodyFile === "-" ? 0 : bodyFile, "utf8");
} catch {
  usage(`can't read the body from ${bodyFile}`);
}

// Specs are looked up in the repository pr:check runs in (the PR's checkout in CI).
const root = worktreeRoot(process.cwd()) ?? process.cwd();
const results = checkPullRequest({
  title,
  body,
  branch,
  taskFileExists: (path) => existsSync(join(root, path)),
});

console.log("pr:check");
for (const result of results) {
  if (result.skipped !== null) {
    console.log(`  – ${result.name} (skipped: ${result.skipped})`);
  } else if (result.problems.length === 0) {
    console.log(`  ✔ ${result.name}`);
  } else {
    console.log(`  ✖ ${result.name}`);
    for (const problem of result.problems) console.log(`      ${problem}`);
  }
}
const failed = results.filter((result) => result.problems.length > 0).map((result) => result.name);
console.log(
  failed.length === 0
    ? "\nAll pull request checks passed."
    : `\n${String(failed.length)} check(s) failed: ${failed.join(", ")}. ` +
        'The standard is under "Pull requests" in CONTRIBUTING.md; the template is .github/pull_request_template.md.',
);
process.exit(failed.length === 0 ? 0 : 1);
