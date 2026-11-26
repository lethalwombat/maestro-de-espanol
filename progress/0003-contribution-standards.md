---
task: "0003"
status: in-progress
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

## Discovered (out of scope)

- Recent git versions write `Reapply "…"` when you revert a revert. The spec's exemption list doesn't include it, so such a commit on a task branch has to be reworded. The owner may want it added as an exemption.
- `CONTRIBUTING.md` has no `ask` rule, so an agent can edit the written standard without approval, while the validator under `harness/` is protected. An `Edit(/CONTRIBUTING.md)` ask rule would match `CLAUDE.md`.
- `splitSections()` in `harness/lib/tasks.ts` doesn't know about code fences: a `## ` line inside a fenced block counts as a heading. That's harmless for the PR draft at the end of a progress file, but a PR body with a `## ` line inside a code block would be misread by `pr:check`.
- The commit-msg cleanup strips only `#` comment lines. With a custom `core.commentChar`, git's template lines stay in what's checked. That's harmless today, because they come after the blank line, but they aren't stripped the way git strips them.

## Acceptance evidence

- AC1:
- AC2:
- AC3:
- AC4:
- AC5:
- AC6:
- AC7:
- AC8:
- AC9:
- AC10:
- AC11:
- AC12:

## Definition of Done

(Filled in by /finish-task.)
