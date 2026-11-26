// The commit-msg git hook: .githooks/commit-msg runs this with the path of the
// file holding the proposed message. The rules live in ../lib/commit-message.ts,
// which CI's pr-standards job also uses for pull request titles.
import { readFileSync } from "node:fs";
import {
  cleanupMessage,
  evaluateCommit,
  HEADER_FORMAT,
  MAX_HEADER_LENGTH,
} from "../lib/commit-message.ts";
import { currentBranch } from "../lib/git.ts";

const file = process.argv[2];
if (file === undefined) {
  console.error("usage: node harness/cli/commit-msg.ts <commit-message-file>");
  process.exit(2);
}

// git runs the hook from the root of the worktree being committed to.
const raw = readFileSync(file, "utf8");
const problems = evaluateCommit(raw, currentBranch(process.cwd()));

if (problems.length > 0) {
  const header = cleanupMessage(raw).split("\n")[0] ?? "";
  console.error(
    [
      `commit-msg: commit refused: ${JSON.stringify(header)}`,
      ...problems.map((problem) => `  ✖ ${problem.rule}: ${problem.message}`),
      `The header is ${HEADER_FORMAT}, at most ${String(MAX_HEADER_LENGTH)} characters, for example:`,
      "  feat(sentence-feedback): explain each error (task 0004)",
      `See "Commit messages" in CONTRIBUTING.md. Your message is saved in ${file}.`,
    ].join("\n"),
  );
  process.exit(1);
}
