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
- **CI.** `pull_request` types `opened, edited, synchronize, reopened` apply to the whole of `ci.yml`, so editing a PR re-runs `check` and `e2e` as well. Skipping them on `edited` with a job-level `if` would post a *skipped* `check`/`e2e` run on the same head SHA, and GitHub counts skipped as passing for a required check, which could hide a real failure. So they re-run. The title, body and branch reach the script through `env`, never inline `${{ }}`, to avoid script injection.
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

## Discovered (out of scope)

- None yet.

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
