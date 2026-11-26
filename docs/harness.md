# The agent harness

`CLAUDE.md`, skills and rules tell an agent what to do, and it follows them nearly every time. The harness handles the few things that must hold every time: hooks, permission rules, git hooks and CI that run regardless of what the model decides. This page lists each guardrail, why it exists and how to change it.

The set is deliberately small. A rule that has legitimate exceptions belongs in `CLAUDE.md`, where Claude can weigh it, not here.

## What is enforced, and where

| Guardrail                         | Mechanism                                                            | What it does                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets stay unread               | `permissions.deny` in `.claude/settings.json`                        | Claude's tools can't read `.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.production` or `.env.test`. This includes `cat .env` and similar commands. `.env.example` stays readable.                                                                                                                                                                                     |
| The harness is human-owned        | `permissions.deny` and `harness/hooks/guard-edit.ts`                 | Edits to `.claude/`, `harness/`, `.github/` (except `.github/workflows/deploy.yml`, listed in `AGENT_WRITABLE_PATHS`), `.githooks/` and the gate configs (`tsconfig.json`, `eslint.config.mjs`, `vitest*.config.ts`, `playwright.config.ts`, Prettier files, `.nvmrc`, `package-lock.json`) are refused, with a reason that tells Claude to raise it with you instead.                  |
| Definitions need approval         | `permissions.ask`                                                    | Writing a task spec (`tasks/`), `CLAUDE.md`, `AGENTS.md`, `docs/definition-of-done.md`, an eval suite (`evals/**/suite.json`), `package.json` or `next.config.ts` prompts you, even in auto mode. So do `npm install`/`uninstall`, `git push` and `gh pr create`.                                                                                                                       |
| No work on main                   | `guard-edit.ts`, `guard-bash.ts`, `.githooks/pre-commit`             | Every file edit and commit on `main` is refused, with a pointer to `/start-task`.                                                                                                                                                                                                                                                                                                       |
| Shared history is safe            | `guard-bash.ts`, `.githooks/pre-push`, `permissions.deny`            | Force pushes, remote branch deletions and pushes to `main` are refused, and so is `gh pr merge`: a person merges.                                                                                                                                                                                                                                                                       |
| One commit format                 | `.githooks/commit-msg`, `harness/lib/commit-message.ts`              | Every commit header must be `type(scope): subject (task NNNN)`, at most 72 characters, as `CONTRIBUTING.md` describes. On a task branch it must name that branch's task. On any other branch only git's own messages (merges, `git revert`, `fixup!`/`squash!`/`amend!`) get through, with a pointer to `/start-task`. With a detached HEAD, as mid-rebase, only the format is checked. |
| One pull request format           | `pr-standards` job in `.github/workflows/ci.yml`, `npm run pr:check` | The PR title must follow the same header rules and name the task of its `task/<id>-<slug>` branch. The body must fill in the five sections of `.github/pull_request_template.md`, and its Task section must name the branch's spec. The job re-runs when the title or body is edited, and `/finish-task` runs the same check on its draft. Both call the commit-msg hook's validator.   |
| Gates can't be skipped            | `guard-bash.ts`                                                      | `--no-verify`, changing `core.hooksPath`, and shell writes to protected files (`>`, `tee`, `sed -i`, `mv`, `rm`, inline `node -e` scripts) are refused.                                                                                                                                                                                                                                 |
| No escaping the session           | `guard-bash.ts`, `permissions.deny`                                  | Starting another `claude` process is refused, because it could run without this project's settings. So is piping a download into a shell.                                                                                                                                                                                                                                               |
| Work isn't silently destroyed     | `guard-bash.ts` (ask)                                                | You're asked before `git reset --hard`, `git clean -f`, `git checkout -- <path>`, `git restore <path>`, `git stash drop/clear` and `git branch -D`.                                                                                                                                                                                                                                     |
| Format and lint as you go         | `harness/hooks/post-edit.ts` (PostToolUse)                           | Each edited file is formatted with Prettier and linted with ESLint, and lint errors go straight back to Claude.                                                                                                                                                                                                                                                                         |
| Can't stop on red                 | `turn-start.ts` (UserPromptSubmit) and `stop-gate.ts` (Stop)         | If Claude changed anything this turn, it can't end the turn until `npm run check` passes. If it has been sent back and changes nothing more, the turn ends with a warning to you rather than looping.                                                                                                                                                                                   |
| The objective survives compaction | `harness/hooks/session-start.ts` (SessionStart)                      | On startup, resume, `/clear` and compaction, Claude is told the active task's objective, acceptance criteria, out-of-scope list and recent progress.                                                                                                                                                                                                                                    |
| Done means done                   | `npm run tasks:check`, part of `check`                               | `status: done` is refused unless every acceptance criterion has evidence and every Definition of Done item is ticked.                                                                                                                                                                                                                                                                   |
| Independent review                | `.claude/agents/reviewer.md` and `guard-bash.ts`                     | A subagent that didn't write the code reviews the diff against the spec. It has no Edit or Write tools, and the project Bash guard refuses any command from it that could change files.                                                                                                                                                                                                 |
| Tests can't be gamed              | `eslint.config.mjs`                                                  | No `.only` or `.skip`, no `@ts-ignore`, and every `eslint-disable` needs a reason. Unit tests can't reach the network. Coverage thresholds sit in the protected `vitest.config.ts`.                                                                                                                                                                                                     |
| Same gates in CI                  | `.github/workflows/ci.yml`                                           | `check` and `e2e` run on every pull request, and again when its title or body is edited, so a skipped run can't stand in for a failed one. `evals.yml` runs the LLM evals when prompts, schemas or `src/lib/llm/` change, if an `ANTHROPIC_API_KEY` secret exists.                                                                                                                      |

The guard logic lives in `harness/lib/policy.ts`, and `harness/lib/policy.test.ts` is its specification: every row there is a command and the decision it must get. The hooks are covered end to end by `harness/hooks/hooks.test.ts`, which runs each one the way Claude Code does.

## Changing the harness

Protected files are protected from agents, not from you.

- **Edit them yourself** in your editor, on a branch, and open a pull request like any other change.
- **Or let Claude help, deliberately**: start a session without the project's settings with `claude --setting-sources user,local`. Project hooks and permission rules aren't loaded, so the harness files are editable. Do this on a branch and review the diff before merging.
- **Adding a guard rule**: write the failing case in `policy.test.ts`, then implement it in `policy.ts`. A new protected path goes into `PROTECTED_PATHS` and into the `Edit(...)` deny rules in `.claude/settings.json`; a test fails if the two drift apart.
- **Letting agents write one protected file**: add it to `AGENT_WRITABLE_PATHS` in `policy.ts`, and replace any blanket `Edit(/dir/**)` deny rule over it with file-level deny rules, because a deny rule always beats an allow. `policy.test.ts` checks both.

After changing hooks, run `/hooks` in a session to confirm Claude Code loaded them. For a misbehaving hook, `claude --debug` writes hook execution details to `~/.claude/debug/<session-id>.txt`.

## Limits

- The Bash guard reads command text and parses it on a best-effort basis: chains, pipes, `$(...)`, `bash -c`, wrappers and heredocs. It catches what an agent would plausibly write, not a determined adversary. For OS-level enforcement, turn on the sandbox with `/sandbox`.
- Hooks in `.claude/settings.json` run once you accept the workspace trust dialog for the folder, and always in `claude -p`. Deny and ask rules apply right away. Allow rules are ignored until the folder is trusted, so in a fresh clone you get extra prompts, never fewer guardrails. Open the folder interactively once and accept the dialog.
- Claude Code overrides a Stop hook after eight blocks in a row with no tool call in between (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`).
- Passing checks don't make code correct. That's what the reviewer subagent and your review of the pull request are for.

## Running Claude unattended

Answer the five questions from Anthropic's best practices before leaving a run alone: what done looks like (the task spec), how it checks its work (the Stop gate and `verify`), what it can touch (the rules above, plus a worktree), what stops it, and who signs off (you, on the pull request).

```bash
claude -p "/start-task 0002, then /finish-task. End with DONE or BLOCKED: <reason>." \
  --worktree task-0002 \
  --permission-mode auto \
  --max-turns 100 \
  --max-budget-usd 15
```

In `-p` mode nothing can wait for your approval, so anything covered by an `ask` rule (pushing, installing dependencies, editing a task spec) is refused, and the run stops short of them. A worktree created by a `-p` run isn't cleaned up automatically: remove it with `git worktree remove <path>`.

## Recommended GitHub settings

These live on GitHub, not in the repo:

- **Protect `main`**: require a pull request before merging, require the `check`, `e2e` and `pr-standards` status checks, block force pushes and deletions, and don't allow bypassing these settings. This is the backstop for every local guardrail.
- **Squash merging only**: allow squash merging and turn off merge commits and rebase merging. Set the squash commit title to the pull request title and its message to the pull request body. `main` then gets one commit per pull request, with the header `pr-standards` checked.
- **Add an `ANTHROPIC_API_KEY` repository secret** if you want the eval workflow to run on pull requests. It costs money on every PR that touches prompts.
- **Optional**: run `/install-github-app` in Claude Code to get Claude reviewing pull requests.

To apply the merge settings and the `pr-standards` requirement, run these from a clone once `pr-standards` is in `ci.yml` on `main`. Adding the required check earlier blocks any pull request whose CI doesn't run it yet. `{owner}/{repo}` is filled in from the clone.

```bash
# Squash merging only: the PR title and body become the commit on main.
gh api --method PATCH repos/{owner}/{repo} \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY

# Required checks on main: check, e2e and pr-standards, branch up to date (strict).
gh api --method PATCH repos/{owner}/{repo}/branches/main/protection/required_status_checks --input - <<'JSON'
{ "strict": true, "checks": [{ "context": "check" }, { "context": "e2e" }, { "context": "pr-standards" }] }
JSON

# Confirm both.
gh api repos/{owner}/{repo} --jq '{allow_squash_merge, allow_merge_commit, allow_rebase_merge, squash_merge_commit_title, squash_merge_commit_message}'
gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks --jq '{strict, checks: [.checks[].context]}'
```
