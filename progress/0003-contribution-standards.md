---
task: "0003"
status: done
---

## Plan

### Approach

- **One validator.** `harness/lib/commit-message.ts` holds the commit-header rules (AC1), the exemptions (AC2) and the branch-aware decision the hook makes (AC3). `harness/lib/pull-request.ts` holds the PR checks (AC5, AC6) and calls the same `checkHeader()` for the title. The hook (`.githooks/commit-msg` → `harness/cli/commit-msg.ts`), CI (`pr-standards` → `npm run pr:check` → `harness/cli/pr-check.ts`) and `/finish-task` (`npm run pr:check`) all go through these two modules. They're zero-dependency TypeScript run directly by Node, like `policy.ts`.
- **Reasons name the rule.** Each problem is `{ rule, message }`, with rules `format`, `type`, `scope`, `separator`, `subject`, `period`, `task-id`, `length` and `body`, plus `branch` and `task-match` for the hook. The tests assert on rule ids rather than wording.
- **Hook input.** git calls `commit-msg` before it cleans up the message, so the file can hold `#` comment lines and, with `-v`, a scissors line and a diff. The validator does the same cleanup as git's default `strip` mode (it cuts at the scissors line, drops `#` lines, strips trailing whitespace and leading blank lines) before checking.
- **Hook location.** `.githooks/commit-msg` runs `node "$(dirname "$0")/../harness/cli/commit-msg.ts"`, so a temporary repo whose `core.hooksPath` points at this repo's `.githooks` runs this repo's validator. That's how the AC3 tests work.
- **PR body.** The prompts in the template are HTML comments, and `pr:check` strips comments, CRLF line endings and the `🤖 Generated with` footer before it checks that a section has content. An untouched template therefore fails, and a test proves it.
- **CI.** `pull_request` types `opened, edited, synchronize, reopened` apply to the whole of `ci.yml`, so editing a PR re-runs `check` and `e2e` as well. Skipping them on `edited` with a job-level `if` would post a _skipped_ `check`/`e2e` run on the same head SHA, and GitHub counts skipped as passing for a required check, which could hide a real failure. So they re-run. The title, body and branch reach the script through `env`, never inline `${{ }}`, to avoid script injection.
- **`/finish-task` draft.** The draft goes at the end of the progress file under `## Pull request`: the title on its own line, then the body in a `~~~~markdown` fence (four tildes, so the body can hold ``` code blocks). An `awk` one-liner pipes the body into `pr:check --body-file -` and, after the go-ahead, into `gh pr create --body-file -`, so the checked text and the opened text are the same. `pr:check` accepts `-` for stdin, as `gh` does.

### Files likely to change

New: `harness/lib/commit-message{,.test}.ts`, `harness/lib/pull-request{,.test}.ts`, `harness/cli/commit-msg{,.test}.ts`, `harness/cli/pr-check{,.test}.ts`, `.githooks/commit-msg`, `.github/pull_request_template.md`, `CONTRIBUTING.md`.
Changed: `.github/workflows/ci.yml`, `docs/harness.md`, `.claude/skills/start-task/SKILL.md`, `.claude/skills/start-task/progress-template.md`, `.claude/skills/finish-task/SKILL.md`, `README.md`. These need the owner's approval: `CLAUDE.md`, `docs/definition-of-done.md`, `package.json`.

### First failing test per criterion

- AC1, AC2: `harness/lib/commit-message.test.ts`, a table of headers and messages with the rules they break. It fails first because the module doesn't exist.
- AC3: `harness/cli/commit-msg.test.ts` makes real commits in a temporary repo with `core.hooksPath` set to this repo's `.githooks`. It fails first because there's no hook, so every commit succeeds.
- AC4: a test in `harness/lib/pull-request.test.ts` reads the template and expects the five headings in order, each with a one-line prompt. It fails because the file doesn't exist.
- AC5, AC6: `harness/lib/pull-request.test.ts` covers each refusal and the passing case. `harness/cli/pr-check.test.ts` covers exit codes, output and stdin.
- AC7: no local runner. Evidence is the YAML itself plus the `pr-standards` run on this task's own PR (failing on a bad title, then green after an edit without a push).
- AC8–AC12: documentation and skill text, checked against the criteria by reading them and by the reviewer.

### Risks and open points

- `npm run pr:check` needs the `package.json` script, which needs approval. Until then the tests call `node harness/cli/pr-check.ts` directly.
- After a squash merge, GitHub appends ` (#N)` to the commit title on main, so main's headers can exceed 72 characters. Nothing checks main's history, and CONTRIBUTING.md says so.
- The project's reviewer subagent and its read-only Bash guard aren't loaded in an unlocked session. The review runs as a general-purpose subagent given the reviewer's instructions, and told to change nothing.

## Log

- 2026-11-26: Started. This session is unlocked (no project SessionStart context was injected), as the spec's notes require. I created `task/0003-contribution-standards` from `main` 3e3f0aa (equal to `origin/main`). Current GitHub settings: required checks `check` and `e2e` (strict); merge, squash and rebase all allowed; squash title `COMMIT_OR_PR_TITLE`, message `COMMIT_MESSAGES`; delete branch on merge on.
- 2026-11-26: AC1/AC2, test first. `harness/lib/commit-message.test.ts` failed with `Cannot find module './commit-message.ts'`. Before implementing I corrected two expectations: problems come in reading order (`period` before `task-id`), and the wording test's header is 84 characters, not 89. 76/76 then passed. ESLint's `no-misused-spread` refused `[...text].length`, so length counts graphemes with `Intl.Segmenter`, with an emoji row (77/77).
- 2026-11-26: AC3, test first. `harness/cli/commit-msg.test.ts` failed 7 of 11 with no hook (git accepted every commit). The exemption test also failed with exit 129, a bug in my test: `git revert` has no `--allow-empty`, so it now reverts a real file change. With the hook, 11/11 pass, including with `GIT_DIR=/nonexistent` set in the outer environment, which shows the scratch repo is isolated when `pre-push` runs the tests. By hand: `git commit -v` with an editor hands the hook 10 `#` lines and a scissors line plus the diff, and the commit goes through.
- 2026-11-26: From commit 98c4b8a on, this repo's own commits go through the new hook. It refused three of my headers for length (73, 76 and 73 characters). Since then I check each header with `checkHeader()` before committing.
- 2026-11-26: AC4–AC6, test first. `harness/lib/pull-request.test.ts` failed with `Cannot find module './pull-request.ts'`, then 31/31 passed. I changed the empty-Task message to "name the spec" rather than "write None", since "None" isn't valid there. Its test failed first, then passed. `harness/cli/pr-check.test.ts` failed 6/6 with no CLI, then 6/6 passed.
- 2026-11-26: AC7. No actionlint locally. Ruby's YAML parser reads `ci.yml` as triggers `pull_request.types [opened, edited, synchronize, reopened]`, `push [main]`, `workflow_dispatch`, and jobs `check`, `e2e`, `pr-standards` (`if: github.event_name == 'pull_request'`, env `PR_TITLE`, `PR_BODY`, `PR_BRANCH`). `shellcheck -s bash` on the step is clean. Running the step locally as Actions does (`bash -e`, env set, `RUNNER_TEMP` in the scratchpad) exits 0 for a compliant PR with a CRLF body and 1 for a bad title with an empty body. A title of `$(touch /tmp/pwned2)` ran nothing. The live evidence (red, then green after an edit) comes from this PR.
- 2026-11-26: AC9. GitHub's REST reference confirms `allow_*_merge`, `squash_merge_commit_title` (`PR_TITLE` | `COMMIT_OR_PR_TITLE`) and `squash_merge_commit_message` (`PR_BODY` | `COMMIT_MESSAGES` | `BLANK`) on `PATCH /repos/{owner}/{repo}`. For `PATCH …/required_status_checks` the docs don't say whether `checks` replaces or merges, so the documented command passes the full list (`check`, `e2e`, `pr-standards`), which ends in the same state either way. Not applied: the owner runs it.
- 2026-11-26: AC11. Prettier rewrote the `~~~~markdown` fence inside the skill's ````markdown example into backticks, which would break extraction. The outer block is now `text`. The `awk` extraction (BSD awk) skips `~~~~markdown` blocks outside `## Pull request`, keeps the body's inner ``` block, and piped into `npm run --silent pr:check -- … --body-file -` gives exit 0. `npm run` passes stdin through. `parseProgress` still reads status and the DoD of a progress file with the draft section at the end.
- 2026-11-26: The owner approved the `package.json`, `CLAUDE.md` and `docs/definition-of-done.md` edits as previewed, and they're committed in 0f508ee. The `pr:check` wiring test ("is what `npm run pr:check` runs") was written after the script, so it was never seen failing; `git show HEAD~1:package.json` has no `pr:check`.
- 2026-11-26: Every `CONTRIBUTING.md` example, run through `checkHeader()`/`evaluateCommit()`: the four good headers pass, and each refused one fails on exactly the rule its row names (format, type, scope, separator, period, task-id ×2, length at 84, task-match).

- 2026-11-26: Review (a general-purpose subagent given `.claude/agents/reviewer.md`'s instructions, read-only by instruction because the project agent isn't loaded unlocked). It found and I fixed, tests first where code changed:
  - Prettier rewrites a `~~~~markdown` fence to backticks, so the skill's `awk` found no body in a saved progress file. The extraction now accepts any backtick or tilde `markdown` fence and closes on the same fence. Checked on both forms Prettier writes (with and without an inner code block).
  - `git revert` never runs commit-msg, so the revert assertion proved nothing. The test now runs `git revert --no-commit` then `git commit --no-edit`, which goes through the hook.
  - `TASK_SUFFIX` accepted no space, several spaces or a tab before `(task`. Now exactly one. Three new rows failed first, then passed.
  - `cleanupMessage` trimmed the header's leading spaces, which git keeps. It now strips only blank lines. The unit and hook tests failed first, then passed.
  - 25f8a17's header was 73 characters (made before the hook existed). I reworded it to `feat(harness): commit-message validator and git exemptions (task 0003)` with a non-interactive `git rebase -i main` before any push. All 11 branch headers now pass `checkHeader()`.
  - Not changed: `.githooks/pre-commit`'s `ALLOW_MAIN_COMMIT=1` hint no longer gets a commit onto main, because commit-msg refuses non-exempt commits off task branches, as AC3 requires. It's under Discovered for the owner.
  - The "Reapply" note under Discovered was wrong (plain `git revert` skips the hook), so I removed it.
- 2026-11-26: `npm run verify` after the fixes (all 381 unit tests in 16 files, all 5 e2e tests):

  ```
  harness check --full:
    ✔ tasks (0.1s)
    ✔ format (1.7s)
    ✔ typecheck (2.2s)
    ✔ lint (3.7s)
    ✔ unit (9.4s)
    ✔ e2e (4.2s)

  All checks passed.
  ```

## Discovered (out of scope)

- `.githooks/pre-commit` still suggests `ALLOW_MAIN_COMMIT=1 git commit …` as a one-off override on main, but the new commit-msg hook refuses that commit unless its message is exempt. The owner should decide whether the hint goes or the override also applies to commit-msg.
- `CONTRIBUTING.md` has no `ask` rule, so an agent can edit the written standard without approval, while the validator under `harness/` is protected. An `Edit(/CONTRIBUTING.md)` ask rule would match `CLAUDE.md`.
- `splitSections()` in `harness/lib/tasks.ts` doesn't know about code fences: a `## ` line inside a fenced block counts as a heading. That's harmless for the PR draft at the end of a progress file, but a PR body with a `## ` line inside a code block would be misread by `pr:check`.
- The commit-msg cleanup strips only `#` comment lines. With a custom `core.commentChar`, git's template lines stay in what's checked. That's harmless today, because they come after the blank line, but they aren't stripped the way git strips them.
- Editing a PR's title or body re-runs `check` and `e2e` as well as `pr-standards`, since `ci.yml` has one trigger list (see Plan). If that costs too much, the owner could move `pr-standards` to its own workflow, which AC7 as written doesn't allow.

## Acceptance evidence

- AC1: `harness/lib/commit-message.test.ts` "commit header (AC1)" and "commit message body (AC1)": a table with a passing and a failing row for each rule (type, scope, separator, subject, period, task-id, length at 72/73, format, body), each asserting the rule id, plus "explains each rule in words". 81/81 pass.
- AC2: `harness/lib/commit-message.test.ts` "exemptions for git's own messages (AC2)": Merge (git merge, pull request, git pull), `Revert "…"`, `fixup!`, `squash!`, `amend!` pass; five look-alikes don't.
- AC3: `harness/cli/commit-msg.test.ts`, with real commits in a scratch repo whose `core.hooksPath` is this `.githooks`: on a task branch, compliant commits pass, while format, body and other-task commits are refused with their reasons and exit non-zero; a merge, a revert and a fixup go through; off a task branch a compliant commit is refused with "/start-task <id>" and a fixup goes through; with a detached HEAD and mid-rebase (`git rebase --exec`), task 0009 passes and a bad format is refused. 12/12 pass.
- AC4: `harness/lib/pull-request.test.ts` "the pull request template (AC4)": the five headings in order, one comment-line prompt each, the Task form `NNNN — tasks/NNNN-<slug>.md (part X of Y)`, and the untouched template fails pr:check.
- AC5: `harness/lib/pull-request.test.ts` "pr:check title and branch (AC5)" (passing case, title rules, no exemptions for titles, six bad branches, id mismatch, skipped comparison) and `harness/cli/pr-check.test.ts` (exit 0 listing every check, exit 1 naming "title, branch, body", exit 2 usage, stdin, and the `npm run pr:check` script). `npm run --silent pr:check -- … --body-file -` gave exit 0 on a good draft and exit 1 on a bad title and body.
- AC6: `harness/lib/pull-request.test.ts` "pr:check body (AC6)": each of the five headings missing and each left empty, every problem named at once, `None` counts, comments and the footer don't count as content, CRLF bodies, a Task section naming no spec, another task's spec, or a missing spec. The passing case is in AC5's first test. 31/31 pass.
- AC7: `.github/workflows/ci.yml` job `pr-standards`, with `pull_request.types [opened, edited, synchronize, reopened]`, env-only inputs and no branch-commit checks. Ruby's YAML parser and `shellcheck` agree. The step run locally under `bash -e` exits 0 for a compliant PR with a CRLF body and 1 for a bad one, and a `$(…)` title ran nothing. The live run on GitHub (red, then green after an edit) can only exist once the PR is open, and will be added then.
- AC8: `CONTRIBUTING.md` covers the commit format (good examples and a refused table, each checked against the validator), the exemptions, branches, the PR template, a task in several PRs, squash merging with the PR title as the commit on main, and the lifecycle (spec, /start-task, /finish-task, PR, a person merges). `README.md` and `CLAUDE.md` link to it.
- AC9: `docs/harness.md`: rows "One commit format" (commit-msg hook) and "One pull request format" (`pr-standards`). "Recommended GitHub settings" requires `check`, `e2e` and `pr-standards`, allows squash only with the title set to the PR title and the message to the PR body, and gives the `gh api` commands, checked against GitHub's REST reference and not run.
- AC10: `.claude/skills/start-task/SKILL.md` step 7 now says "Commit, in the format under "Commit messages" in `CONTRIBUTING.md`", replacing the inline `feat(<area>): …` example.
- AC11: `.claude/skills/finish-task/SKILL.md` step 6 drafts the title and body into the progress file's `## Pull request` section and pipes the body into `npm run pr:check` until it passes. Step 9, after the go-ahead, opens the PR with `gh pr create --title … --body-file -` from the same draft. This task's own draft below passes through that exact `awk | npm run pr:check` command.
- AC12: `docs/definition-of-done.md`: the commit item now points to `CONTRIBUTING.md`, and a new item requires the drafted PR title and body to pass `npm run pr:check` (approved by the owner).

## Definition of Done

- [x] `npm run verify` passes (format, typecheck, lint, unit tests with coverage thresholds, production build, e2e), and its summary is pasted in the progress log.
- [x] If a prompt, an output schema or anything in `src/lib/llm/` changed, `npm run evals` meets the suite threshold and the summary is in the progress log. — N/A: no prompt, schema or `src/lib/llm/` changes.
- [x] Every acceptance criterion has evidence under "Acceptance evidence": the test that proves it, or the command and output for what a test can't show. AC7's live GitHub run is added after the PR opens; the local run of the step stands in until then.
- [x] New behaviour was written test-first: each new test was seen failing before the code that makes it pass. One exception, logged: the `pr:check` wiring test checks the `package.json` script and was written after the script.
- [x] User-visible behaviour is covered by an e2e test, or the progress file says why not. — N/A: no app behaviour changed. The hook and `pr:check` are covered end to end by black-box tests that run real git and the CLI.
- [x] The diff serves this task's acceptance criteria and nothing else. Unrelated findings are listed under "Discovered", not fixed.
- [x] No test, assertion, lint rule or threshold was removed or loosened, and there is no new `eslint-disable`, `@ts-expect-error`, `.skip` or `.only`.
- [x] No new dependency, unless the task needed one and the user approved the install.
- [x] No secrets, API keys or `.env` contents in code, fixtures, logs or commits.
- [x] The `reviewer` subagent reviewed the diff against the spec, and every correctness gap it found is fixed or answered in the progress file. It ran as a general-purpose subagent given the reviewer's instructions, because project agents aren't loaded in an unlocked session.
- [x] Docs are updated wherever behaviour, commands or setup changed.
- [x] The work is committed on the task branch, with commit messages in the format in `CONTRIBUTING.md`.
- [x] The pull request title and body are drafted in the progress file and pass `npm run pr:check`.

## Pull request

feat(harness): enforce commit and pull request standards (task 0003)

````markdown
## Task

0003 — tasks/0003-contribution-standards.md (part 1 of 1)

## Summary

One written standard for commits and pull requests, enforced where people and agents work. A zero-dependency validator, `harness/lib/commit-message.ts`, checks `type(scope): subject (task NNNN)` headers (at most 72 characters) and exempts git's own messages. The new `.githooks/commit-msg` runs it on every commit, and requires the branch's task on a task branch. `npm run pr:check` runs the same header check on the PR title, and also checks the branch name and the five-section body from the new `.github/pull_request_template.md`. CI's new `pr-standards` job runs it on every PR and on every title or body edit. `/finish-task` now drafts the PR into the progress file and checks it with the same command before opening it. `CONTRIBUTING.md` documents the standard. `docs/harness.md` gives the squash-only GitHub settings and the `gh api` commands for the owner to run (not applied here).

## Acceptance criteria

- AC1, AC2: `harness/lib/commit-message.test.ts`, a table with a passing and a failing case per rule, plus each exemption (81 tests).
- AC3: `harness/cli/commit-msg.test.ts`, with real commits in a scratch repo: task branch, other task, non-task branch, merge/revert/fixup, detached HEAD and mid-rebase (12 tests).
- AC4: the template tests in `harness/lib/pull-request.test.ts`.
- AC5, AC6: `harness/lib/pull-request.test.ts` (31 tests) and `harness/cli/pr-check.test.ts` (7 tests): each refusal and the passing case.
- AC7: the `pr-standards` job in `.github/workflows/ci.yml`. Checked locally with a YAML parse, `shellcheck`, and the step run under `bash -e`. This PR is its first live run.
- AC8–AC12: `CONTRIBUTING.md`, `docs/harness.md`, the start-task and finish-task skills, and `docs/definition-of-done.md`. Evidence is in `progress/0003-contribution-standards.md`.

## Verification

```
harness check --full:
  ✔ tasks (0.1s)
  ✔ format (1.7s)
  ✔ typecheck (2.2s)
  ✔ lint (3.7s)
  ✔ unit (9.4s)
  ✔ e2e (4.2s)

All checks passed.
```

Also checked by hand: the hook on `git commit -v` with an editor, this branch's 11 commit headers through `checkHeader()`, and this body through `awk … | npm run pr:check`.

## Discovered

- `.githooks/pre-commit`'s `ALLOW_MAIN_COMMIT=1` hint no longer gets a commit onto main, because commit-msg refuses it. Should the hint go?
- `CONTRIBUTING.md` has no `ask` rule, so agents can edit it without approval.
- `splitSections()` doesn't know about code fences.
- The cleanup strips only `#` comments, whatever `core.commentChar` is set to.
- Editing a PR re-runs `check` and `e2e` as well.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````
