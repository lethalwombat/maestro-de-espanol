---
id: "0006"
title: Keep git in unit tests off the real repository
---

## Objective

Running the unit tests can never touch the real repository, whatever git environment they inherit. Today `.githooks/pre-push` runs `npm run check`, and a push from a linked worktree exports an absolute `GIT_DIR`. `harness/lib/git.test.ts` and `harness/hooks/hooks.test.ts` pass that environment to `git` and to the hook scripts they spawn, so git ignores their temp-dir `cwd` and rewrites the real `.git/config`, branches and worktrees (incident of 2026-11-26). After this task, every test and every child process it starts sees no `GIT_*` variable, and the pre-push hook doesn't hand them to `check` in the first place.

## Acceptance criteria

- AC1: A unit test asserts that no `GIT_*` key is present in `process.env` inside a test. Run with `GIT_DIR` set in the environment before the fix, it fails; the failing output is recorded in the progress file.
- AC2: A new Vitest setup file (`harness/vitest/hermetic-git.ts`, or an addition to `harness/vitest/no-network.ts`) deletes every `GIT_*` key from `process.env`, and `vitest.config.ts` lists it in `setupFiles` of both the `node` and `dom` projects. With it, the AC1 test passes under `GIT_DIR=<somewhere>`.
- AC3: The safe repro passes every test and leaves the sentinel untouched:
  ```sh
  S=$(mktemp -d)
  GIT_DIR="$S/repo.git" npx vitest run harness/lib/git.test.ts harness/hooks/hooks.test.ts harness/cli/commit-msg.test.ts
  ls -A "$S"
  ```
  Vitest reports 0 failed, and `ls -A "$S"` prints nothing (no `repo.git` was created). Before the fix the same command fails 30 tests and writes `bare = true` and `user.name = Test` into the sentinel config; both outputs are recorded.
- AC4: `.githooks/pre-push` unsets `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_PREFIX`, `GIT_COMMON_DIR` and `GIT_OBJECT_DIRECTORY` before `exec npm run --silent check`. Its existing main-branch refusal and `ALLOW_MAIN_PUSH=1` override behave as before.
- AC5: Production code that runs inside real git hooks (`harness/lib/git.ts`, `harness/cli/commit-msg.ts`) still honours the inherited `GIT_*` variables: neither file strips them, and their existing tests pass unchanged.
- AC6: `npm run check` and `npm run verify` pass.
- AC7: After the fix is in place, the owner runs `git push` of the task branch from a linked worktree. `git config --local --list`, `git branch` and `git worktree list`, captured before and after the push, are identical. The outputs are recorded in the progress file.

## Out of scope

- Stripping `GIT_*` in production harness code (`harness/lib/git.ts`, `harness/cli/commit-msg.ts`). Inside real hooks `GIT_DIR` is correct and needed.
- Rewriting the per-file `env` handling in `harness/cli/commit-msg.test.ts` or the `git()` helpers in the other test files. The central setup file covers them; removing the local copy is a refactor for another day.
- Changes to other git hooks (`commit-msg`, and any others) or to CI workflows.
- Any further clean-up of the 2026-11-26 incident, including removing `commit.gpgsign=false` from `.git/config`. That's the owner's call.
- Changes to the Stop hook, `harness/hooks/guard-edit.ts` or other guardrails beyond the files named above.
- Making `npm run tasks -- --next-id` aware of ids reserved on unmerged task branches (found while drafting this spec: it offered 0005, which `task/0005-design-system` already uses).
- Reproducing the bug by pushing from a worktree before the fix.

## Notes

- **Harness edits.** `harness/`, `vitest.config.ts` and `.githooks/` are human-owned. The implementation session runs unlocked, `claude --setting-sources user,local`, on `task/0006-hermetic-git-in-tests`, as task 0003 did. The Stop gate doesn't run in that mode, so run `npm run check` by hand before each commit and `npm run verify` before finishing. The owner reviews the harness diff before merging.
- **Push check (AC7).** Pushing from a worktree is what corrupted the repo, so the owner runs it, only after AC3 passes. The agent records the before and after outputs.
- **Why the main checkout was safe.** From the main checkout git passes a relative `GIT_DIR` (`.git`), which resolves inside each temp repo. From a linked worktree it's absolute, so it points every test's git at the real repo.
- **Pattern already in the tree.** `harness/cli/commit-msg.test.ts` builds `env = { ...process.env }` with every `GIT_*` key set to `undefined`. The setup file applies the same idea once, to `process.env` itself, so child processes such as the hook scripts in `hooks.test.ts` inherit the clean environment too.
- **Decisions made with the owner (2026-11-26):** setup-file guard plus pre-push hardening; unlocked implementation session; owner runs the worktree push check.
