---
task: "0006"
status: done
---

## Plan

### Approach

- **Setup file.** `harness/vitest/hermetic-git.ts` deletes every `GIT_*` key from `process.env` before any test file loads. It's listed in `setupFiles` of both the `node` and `dom` projects, after `no-network.ts`. Because it changes `process.env` itself, every child process a test starts (git, the hook scripts in `hooks.test.ts`) inherits the clean environment.
- **Test for it.** `harness/vitest/hermetic-git.test.ts` asserts no `GIT_*` key in `process.env`, and none in the environment of a child `node` process.
- **Pre-push.** `.githooks/pre-push` unsets `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_PREFIX`, `GIT_COMMON_DIR` and `GIT_OBJECT_DIRECTORY` after the main-branch loop and before `exec npm run --silent check`. Nothing tested the hook before, so `harness/githooks/pre-push.test.ts` runs it with `sh`, a worktree-style `GIT_*` environment and a fake `npm` on `PATH` that records its arguments and environment. It covers the unset, the refusal for `main` and `master`, and the `ALLOW_MAIN_PUSH=1` override.
- **Production code untouched.** `harness/lib/git.ts` and `harness/cli/commit-msg.ts` aren't changed (AC5).

### Files likely to change

New: `harness/vitest/hermetic-git.ts`, `harness/vitest/hermetic-git.test.ts`, `harness/githooks/pre-push.test.ts`, `progress/0006-hermetic-git-in-tests.md`, `tasks/0006-hermetic-git-in-tests.md` (the spec as agreed with the owner).
Changed: `vitest.config.ts`, `.githooks/pre-push`.

### First failing test per criterion

- AC1, AC2: `harness/vitest/hermetic-git.test.ts` under `GIT_DIR=<tmp>` fails before the setup file exists.
- AC3: the spec's safe repro, before and after.
- AC4: `harness/githooks/pre-push.test.ts`, "runs check without the worktree's GIT\_\* variables", fails before the `unset`.
- AC5: `git diff main -- harness/lib/git.ts harness/cli/commit-msg.ts` is empty, and their tests pass.
- AC6: `npm run check`, `npm run verify`.
- AC7: the owner pushes from a linked worktree; I record before and after.

### Risks and open points

- `npm run check` lints the whole tree, including the untracked `.claude/worktrees/task+0005-design-system/.next/types/`, which has 100 lint errors unrelated to this task. See Discovered.

## Log

- 2026-11-26: Started in an unlocked session (the owner confirmed). Created `task/0006-hermetic-git-in-tests` from `main` 4a29c03. The spec was drafted in another session's scratchpad; I copied it unchanged into `tasks/`.
- 2026-11-26: AC1, test first. Under `GIT_DIR=$S/repo.git` both tests failed (output under AC1). `GIT_EDITOR=true` from this session's environment also showed up, which the setup file removes too.
- 2026-11-26: AC3 before the fix: 29 failed, not the 30 the spec predicted. The sentinel got `bare = true` and `name = Test`. `git config --local --list` of the real repo was the same before and after, because the sentinel absorbed the writes.
- 2026-11-26: AC2. Added the setup file and wired it into both projects. ESLint's `no-dynamic-delete` refused `delete process.env[key]`, so it uses `Reflect.deleteProperty`.
- 2026-11-26: AC6. `npm run check` in the main checkout fails lint on `.claude/worktrees/task+0005-design-system/.next/types/` only. A clean clone with a symlinked `node_modules` broke Turbopack's root detection for e2e, so the clone gets an APFS copy (`cp -cR`), and `verify` passes there.
- 2026-11-26: AC4, test first. Of the four pre-push tests, only the `GIT_*` test failed before the `unset`. The refusal and override tests passed before and after, which shows they behave as before. I checked the red again after the final assertion rewrite by stashing the hook change.

- 2026-11-26: AC7. The spec said the owner runs the worktree push, and the owner asked me to run it instead. Before pushing, I backed up `.git/config` and `git for-each-ref` to the scratchpad, switched the main checkout to `main` and added the worktree. Evidence is under AC7.

- 2026-11-26: Docs. The "Tests can't be gamed" row of `docs/harness.md` now says unit tests can't reach the real repository, and names the setup file and the pre-push `unset` (186172c).
- 2026-11-26: Review (a general-purpose subagent given `.claude/agents/reviewer.md`'s instructions, read-only by instruction because the project agent isn't loaded unlocked). It found no correctness bugs and two gaps:
  - The `docs/harness.md` change wasn't committed. It was committed as 186172c while the review ran.
  - `hermetic-git.test.ts` only catches a regression when a `GIT_*` variable is inherited, so removing the setup file from `setupFiles` wouldn't fail CI or a plain `npm test`. AC1 asks for exactly this test, run under `GIT_DIR`, so I left the diff as it is and listed the gap under Discovered for the owner.
  - It also flagged that I ran the AC7 push rather than the owner, at the owner's request (logged above).
- 2026-11-26: `npm run verify` passed at e13f64a (summary under AC6). Since then only `progress/` and `docs/harness.md` have changed, and the pre-push `check` from the worktree passed at 1bb4bde.

## Discovered (out of scope)

- `npm run lint` runs `eslint .`, which descends into `.claude/worktrees/*/.next/types/` (Next.js generated files in a linked worktree under `.claude/worktrees/`, untracked in this repo). Once a worktree has built, `npm run check` fails in the main checkout with about 100 errors that aren't in the repo. Adding `.claude/worktrees/**` (or `**/.next/**`) to the ESLint ignores would fix it. `eslint.config.mjs` is human-owned.
- `harness/vitest/hermetic-git.test.ts` only fails when the tests inherit a `GIT_*` variable. If `hermetic-git.ts` were dropped from `setupFiles`, CI and `npm test` would stay green. A durable guard would start Vitest as a child process with `GIT_DIR` set, or check `setupFiles` directly.
- The spec predicted 30 failing tests in the AC3 repro; the run gave 29. The difference doesn't change the conclusion.

## Acceptance evidence

- AC1: `harness/vitest/hermetic-git.test.ts`. Before the setup file, `S=$(mktemp -d); GIT_DIR="$S/repo.git" npx vitest run harness/vitest/hermetic-git.test.ts`:

  ```
  FAIL  |node| harness/vitest/hermetic-git.test.ts > hermetic git > leaves no GIT_* variable in a child process's environment
  AssertionError: expected [ 'GIT_DIR', 'GIT_EDITOR' ] to deeply equal []
  Test Files  1 failed (1)
       Tests  2 failed (2)
  ```

  The `process.env` test failed the same way (2 of 2 failed).

- AC2: `harness/vitest/hermetic-git.ts`, listed in `setupFiles` of the `node` and `dom` projects in `vitest.config.ts` (807041b). The same command after it: `Test Files 1 passed (1)`, `Tests 2 passed (2)`.
- AC3: the spec's repro. Before the fix:

  ```
  Test Files  2 failed | 1 passed (3)
       Tests  29 failed | 17 passed (46)
  ls -A "$S": repo.git
  grep in $S/repo.git/config: bare = true, name = Test
  ```

  After the fix:

  ```
  Test Files  3 passed (3)
       Tests  46 passed (46)
  ls -A "$S": (nothing)
  ```

  Both times, `git config --local --list` of the real repo was the same before and after the run.

- AC4: `.githooks/pre-push` unsets the six variables before `exec npm run --silent check` (e13f64a). `harness/githooks/pre-push.test.ts` runs the hook with a worktree-style `GIT_*` environment and a fake `npm`. Without the `unset`: `AssertionError: expected [ 'GIT_DIR', 'GIT_INDEX_FILE', …(4) ] to deeply equal []`, `Tests 1 failed | 3 passed (4)`. With it: `Tests 4 passed (4)`. The refusal of `main` and `master` (exit 1, message, `npm` never called) and `ALLOW_MAIN_PUSH=1` (exit 0, `npm run --silent check` called) pass both before and after.
- AC5: `git diff --stat main -- harness/lib/git.ts harness/cli/commit-msg.ts harness/lib/git.test.ts harness/cli/commit-msg.test.ts` is empty. Neither production file mentions `GIT_` (`grep -c` gives 0 and 0). `npx vitest run harness/lib/git.test.ts harness/cli/commit-msg.test.ts`: `Tests 23 passed (23)`.
- AC6: `npm run verify` (which runs `check` first) in a clean clone of this branch at e13f64a, with `node_modules` copied in, because this checkout's lint picks up the 0005 worktree's generated files (see Discovered):

  ```
  harness check --full:
    ✔ tasks (0.1s)
    ✔ format (1.2s)
    ✔ typecheck (3.0s)
    ✔ lint (4.2s)
    ✔ unit (9.8s)
    ✔ e2e (6.1s)

  All checks passed.
  ```

  Unit tests: `Test Files 18 passed (18)`, `Tests 387 passed (387)`.

- AC7: the owner asked me to run the push, so I did, from the linked worktree `.claude/worktrees/task+0006-hermetic-git-in-tests` (`git rev-parse --git-dir` gave `/Users/igorchurkin/git/maestro-de-espanol/.git/worktrees/task+0006-hermetic-git-in-tests`), at 1bb4bde. I pushed with `git push origin task/0006-hermetic-git-in-tests`, without `-u`, so no upstream entry was added to the config. The pre-push hook ran `check` (tasks, format, typecheck, lint and unit all passed), and the push created the remote branch. `git config --local --list`, `git branch` and `git worktree list` from the main checkout were identical before and after (`diff` printed nothing), and `.git/config` was byte-identical to a backup taken first (`cmp`). The only ref change was the expected new `refs/remotes/origin/task/0006-hermetic-git-in-tests`. Before and after:

  ```
  core.repositoryformatversion=0
  core.filemode=true
  core.bare=false
  core.logallrefupdates=true
  core.ignorecase=true
  core.precomposeunicode=true
  core.hookspath=.githooks
  remote.origin.url=https://github.com/lethalwombat/maestro-de-espanol.git
  remote.origin.fetch=+refs/heads/*:refs/remotes/origin/*
  branch.master.remote=origin
  branch.master.merge=refs/heads/master
  user.name=Igor Churkin
  user.email=84167672+lethalwombat@users.noreply.github.com
  branch.main.remote=origin
  branch.main.merge=refs/heads/main
  branch.harness/agent-writable-deploy-workflow.remote=origin
  branch.harness/agent-writable-deploy-workflow.merge=refs/heads/harness/agent-writable-deploy-workflow
  branch.task/0002-azure-deploy.remote=origin
  branch.task/0002-azure-deploy.merge=refs/heads/task/0002-azure-deploy
  branch.task/0003-contribution-standards.remote=origin
  branch.task/0003-contribution-standards.merge=refs/heads/task/0003-contribution-standards
  branch.task/0004-claude-code-review.remote=origin
  branch.task/0004-claude-code-review.merge=refs/heads/task/0004-claude-code-review
  commit.gpgsign=false

    harness/agent-writable-deploy-workflow
  * main
    task/0002-azure-deploy
    task/0003-contribution-standards
    task/0004-claude-code-review
  + task/0005-design-system
  + task/0006-hermetic-git-in-tests

  /Users/igorchurkin/git/maestro-de-espanol                                                   4a29c03 [main]
  /Users/igorchurkin/git/maestro-de-espanol/.claude/worktrees/task+0005-design-system         ec5ac35 [task/0005-design-system] locked
  /Users/igorchurkin/git/maestro-de-espanol/.claude/worktrees/task+0006-hermetic-git-in-tests 1bb4bde [task/0006-hermetic-git-in-tests]
  ```

## Definition of Done

- [x] `npm run verify` passes (format, typecheck, lint, unit tests with coverage thresholds, production build, e2e), and its summary is pasted in the progress log. Run in a clean clone at e13f64a (see AC6). Only docs and progress have changed since.
- [x] If a prompt, an output schema or anything in `src/lib/llm/` changed, `npm run evals` meets the suite threshold and the summary is in the progress log. — N/A: no prompt, schema or `src/lib/llm/` changes
- [x] Every acceptance criterion has evidence under "Acceptance evidence": the test that proves it, or the command and output for what a test can't show.
- [x] New behaviour was written test-first: each new test was seen failing before the code that makes it pass.
- [x] User-visible behaviour is covered by an e2e test, or the progress file says why not. — N/A: test and git-hook infrastructure only, nothing user-visible
- [x] The diff serves this task's acceptance criteria and nothing else. Unrelated findings are listed under "Discovered", not fixed.
- [x] No test, assertion, lint rule or threshold was removed or loosened, and there is no new `eslint-disable`, `@ts-expect-error`, `.skip` or `.only`.
- [x] No new dependency, unless the task needed one and the user approved the install.
- [x] No secrets, API keys or `.env` contents in code, fixtures, logs or commits.
- [x] The `reviewer` subagent reviewed the diff against the spec, and every correctness gap it found is fixed or answered in the progress file.
- [x] Docs are updated wherever behaviour, commands or setup changed.
- [x] The work is committed on the task branch, with commit messages in the format in `CONTRIBUTING.md`.
- [x] The pull request title and body are drafted in the progress file and pass `npm run pr:check`.

## Pull request

fix(harness): keep git in unit tests off the real repository (task 0006)

```markdown
## Task

0006 — tasks/0006-hermetic-git-in-tests.md (part 1 of 1)

## Summary

A push from a linked worktree runs `.githooks/pre-push` with an absolute `GIT_DIR`. The hook passed it to `npm run check`, and the git tests in `harness/lib/git.test.ts` and `harness/hooks/hooks.test.ts` then ignored their temp-dir `cwd` and rewrote the real `.git/config`, branches and worktrees (incident of 2026-11-26).

- New Vitest setup file `harness/vitest/hermetic-git.ts` deletes every `GIT_*` variable from `process.env`. It runs in both the `node` and `dom` projects, so tests and every process they start see a clean environment.
- `.githooks/pre-push` unsets `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_PREFIX`, `GIT_COMMON_DIR` and `GIT_OBJECT_DIRECTORY` before `check`. The main-branch refusal and `ALLOW_MAIN_PUSH=1` are unchanged, and a new test covers the hook.
- Production code (`harness/lib/git.ts`, `harness/cli/commit-msg.ts`) is untouched and still honours `GIT_*` inside real hooks.
- `docs/harness.md` records the guard.

Harness files changed in an unlocked session; please review the harness diff.

## Acceptance criteria

- AC1: `harness/vitest/hermetic-git.test.ts` asserts no `GIT_*` key in `process.env` or in a child's environment. Under `GIT_DIR=$S/repo.git` before the fix: 2 of 2 failed (`expected [ 'GIT_DIR', 'GIT_EDITOR' ] to deeply equal []`).
- AC2: `harness/vitest/hermetic-git.ts` in `setupFiles` of both projects. The same run passes 2 of 2.
- AC3: the spec's sentinel repro. Before: 29 failed | 17 passed, and the sentinel got `bare = true` and `name = Test` (the spec predicted 30). After: 46 passed, and `ls -A "$S"` prints nothing.
- AC4: `harness/githooks/pre-push.test.ts` runs the hook with worktree `GIT_*` and a fake `npm`. The unset test failed before the change and passes after. The refusal and override tests pass before and after.
- AC5: no diff to `harness/lib/git.ts` or `harness/cli/commit-msg.ts` (neither mentions `GIT_`). Their tests pass, 23 of 23.
- AC6: `npm run verify` passes (below).
- AC7: pushed from the linked worktree `.claude/worktrees/task+0006-hermetic-git-in-tests` at the owner's request. `git config --local --list`, `git branch` and `git worktree list` were identical before and after, and `.git/config` was byte-identical to a backup. Full output is in the progress file.

## Verification

`npm run verify` in a clean clone of the branch at e13f64a:

    harness check --full:
      ✔ tasks (0.1s)
      ✔ format (1.2s)
      ✔ typecheck (3.0s)
      ✔ lint (4.2s)
      ✔ unit (9.8s)
      ✔ e2e (6.1s)

    All checks passed.

Unit: 18 files, 387 tests passed. By hand: the AC3 sentinel repro before and after, and the AC7 worktree push.

## Discovered

- `npm run lint` (`eslint .`) descends into `.claude/worktrees/*/.next/types/`, so once a worktree has built, `npm run check` fails in the main checkout with about 100 errors from files outside the repo. An ESLint ignore for `.claude/worktrees/**` would fix it.
- `hermetic-git.test.ts` only fails when a `GIT_*` variable is inherited, so dropping the setup file from `setupFiles` wouldn't turn CI red. A durable guard would start Vitest as a child process with `GIT_DIR` set.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
