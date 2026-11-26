---
name: finish-task
description: Close out the current task against the Definition of Done. Runs full verification and an independent review against the spec, records evidence in the progress file and makes the final commit. Use when a task's implementation is complete, or when the user asks to wrap up, finish or mark a task done.
---

Branch: !`git branch --show-current`

Changes against main:
!`git diff --stat main...HEAD`

1. Get the task id from the branch name (`task/<id>-<slug>`) and read the spec and the progress file. On a branch that isn't a task branch, stop and ask.
2. Run `npm run verify` and fix failures at their cause. Paste the summary block it prints into the progress log.
3. If the diff touches a prompt, a schema or `src/lib/llm/`, run /run-evals (it asks the user before spending money).
4. Ask the `reviewer` subagent to review task <id>. Fix every correctness or scope gap it reports, and re-run `npm run verify` if you changed code. If you disagree with a finding, note why in the progress file. Ignore style comments.
5. Fill in "Acceptance evidence": one line per criterion, naming the test that proves it (or the command and its output).
6. Replace the "Definition of Done" section of the progress file with the checklist from `docs/definition-of-done.md`. Tick an item only if it's true; for an item that doesn't apply, tick it and add "— N/A: <reason>". Leave anything false unticked.
7. Only if every item is ticked, set `status: done`. Run `npm run tasks:check`: it refuses `done` while evidence or checklist items are missing. Commit.
8. Report to the user: what changed, the verify summary, eval results if any, anything left unticked and why, and what's under "Discovered". Pushing and opening a pull request wait for the user's go-ahead. A person merges it.
