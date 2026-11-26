---
task: "0006"
status: in-progress
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
- 2026-11-26: AC4, test first. Of the four pre-push tests, only the `GIT_*` test failed before the `unset`. The refusal and override tests passed before and after, which shows they behave as before. I checked the red again after the final assertion rewrite by stashing the hook change.

## Discovered (out of scope)

- `npm run lint` runs `eslint .`, which descends into `.claude/worktrees/*/.next/types/` (Next.js generated files in a linked worktree under `.claude/worktrees/`, untracked in this repo). Once a worktree has built, `npm run check` fails in the main checkout with about 100 errors that aren't in the repo. Adding `.claude/worktrees/**` (or `**/.next/**`) to the ESLint ignores would fix it. `eslint.config.mjs` is human-owned.
- The spec predicted 30 failing tests in the AC3 repro; the run gave 29. The difference doesn't change the conclusion.

## Acceptance evidence

- AC1:
- AC2:
- AC3:
- AC4:
- AC5:
- AC6:
- AC7:

## Definition of Done

(Filled in by /finish-task.)

## Pull request

(Drafted by /finish-task: the title, then the body in a fenced `markdown` block.)
