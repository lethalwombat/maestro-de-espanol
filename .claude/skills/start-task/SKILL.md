---
name: start-task
description: Begin or resume work on a task from tasks/. Checks preconditions, creates the task branch and progress file, and writes a plan before any code. Use when the user asks to start, pick up, continue or work on a task by id.
argument-hint: "<task-id>"
---

Task id: $0

!`git status --short --branch`

1. Run `npm run tasks`, then find `tasks/$0-*.md` and read it. If it doesn't exist, or its criteria aren't testable as written, stop and tell the user (and offer /new-task).
2. **Resuming?** If the branch `task/<id>-<slug>` already exists, switch to it, read `progress/<id>-<slug>.md`, and continue from the last log entry. Skip to step 6.
3. The working tree must be clean. If it isn't, stop and ask: don't stash, reset or discard anything.
4. Create the branch from main: `git switch -c task/<id>-<slug> main`.
5. Create `progress/<id>-<slug>.md` from [progress-template.md](progress-template.md), with an `- ACn:` line under "Acceptance evidence" for each criterion.
6. Read the code involved. Write the plan into the progress file: approach, files likely to change, the first failing test for each criterion, risks, open questions. If an open question would change the plan, ask the user now rather than guessing.
7. Work one criterion at a time:
   - Write the test and run it (`npx vitest run <file>`). Watch it fail for the right reason.
   - Write the minimum code to pass it. Refactor while green.
   - Commit, in the format under "Commit messages" in `CONTRIBUTING.md`. The commit-msg hook refuses any other format and says which rule broke.
   - Add a log line for anything worth knowing later: a decision, a dead end, a surprise.
8. Anything you notice that the task doesn't need goes under "Discovered", not into the diff.
9. When every criterion is implemented, run /finish-task.
