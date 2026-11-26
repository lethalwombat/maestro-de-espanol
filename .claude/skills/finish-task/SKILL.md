---
name: finish-task
description: Close out the current task against the Definition of Done. Runs full verification and an independent review against the spec, records evidence in the progress file, drafts and checks the pull request, and makes the final commit. Use when a task's implementation is complete, or when the user asks to wrap up, finish or mark a task done.
---

Branch: !`git branch --show-current`

Changes against main:
!`git diff --stat main...HEAD`

1. Get the task id from the branch name (`task/<id>-<slug>`) and read the spec and the progress file. On a branch that isn't a task branch, stop and ask.
2. Run `npm run verify` and fix failures at their cause. Paste the summary block it prints into the progress log.
3. If the diff touches a prompt, a schema or `src/lib/llm/`, run /run-evals (it asks the user before spending money).
4. Ask the `reviewer` subagent to review task <id>. Fix every correctness or scope gap it reports, and re-run `npm run verify` if you changed code. If you disagree with a finding, note why in the progress file. Ignore style comments.
5. Fill in "Acceptance evidence": one line per criterion, naming the test that proves it (or the command and its output).
6. Draft the pull request at the end of the progress file, following "Pull requests" in `CONTRIBUTING.md`. The title goes on its own line. The body goes in a `~~~~markdown` fence, whose four tildes let it hold ``` code blocks, and follows the sections of `.github/pull_request_template.md`:

   ```text
   ## Pull request

   type(scope): subject for the whole pull request (task <id>)

   ~~~~markdown
   ## Task

   <id> — tasks/<id>-<slug>.md (part X of Y)

   ## Summary

   ## Acceptance criteria

   ## Verification

   ## Discovered
   ~~~~
   ```

   Fill in every section: what changed and why, each criterion with its evidence, the verify summary, and "Discovered" from the progress file (or `None`). An attribution footer may follow the last section. Then check the draft exactly as CI will, and fix it until it passes:

   ```bash
   awk '/^## Pull request$/{s=1} f&&/^~~~~$/{exit} f{print} s&&/^~~~~markdown$/{f=1}' progress/<id>-<slug>.md \
     | npm run pr:check -- --title "<title>" --body-file - --branch "$(git branch --show-current)"
   ```

7. Replace the "Definition of Done" section of the progress file with the checklist from `docs/definition-of-done.md`. Tick an item only if it's true; for an item that doesn't apply, tick it and add "— N/A: <reason>". Leave anything false unticked.
8. Only if every item is ticked, set `status: done`. Run `npm run tasks:check`: it refuses `done` while evidence or checklist items are missing. Commit.
9. Report to the user: what changed, the verify summary, eval results if any, anything left unticked and why, what's under "Discovered", and the drafted pull request title. Pushing and opening the pull request wait for the user's go-ahead. Then open it from the same draft:

   ```bash
   git push -u origin "$(git branch --show-current)"
   awk '/^## Pull request$/{s=1} f&&/^~~~~$/{exit} f{print} s&&/^~~~~markdown$/{f=1}' progress/<id>-<slug>.md \
     | gh pr create --base main --title "<title>" --body-file -
   ```

   A person merges it.
