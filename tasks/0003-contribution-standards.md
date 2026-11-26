---
id: "0003"
title: Enforce commit, pull request and workflow standards
---

## Objective

Every commit, pull request and agent session in this repo follows one written standard, and the standard is enforced, not just described. Commit headers have one shape that names their task. Pull requests are titled and described the same way every time. Main gets one clean commit per pull request. A person or an agent who gets it wrong finds out immediately: locally at commit time, or in CI before merge. The agent skills produce compliant commits and pull requests without being reminded.

## Acceptance criteria

- AC1: A commit-message validator in `harness/lib/` accepts a header of the form `type(scope): subject (task NNNN)` and rejects everything else, each with a reason naming the rule broken. `type` is one of `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `revert`. `(scope)` is optional and lowercase kebab-case. The subject is non-empty and has no trailing period. The whole header is at most 72 characters. A body, if present, is separated from the header by a blank line. A table-driven test proves each rule with at least one passing and one failing case.
- AC2: The validator exempts git's own generated messages: merge commits (`Merge …`), `Revert "…"` from `git revert`, and `fixup!`/`squash!`/`amend!` commits. Each exemption has a test case.
- AC3: `.githooks/commit-msg` runs the validator. On a `task/<id>-<slug>` branch, a commit whose message breaks AC1, or names a task id other than the branch's, is refused with the reason and exits non-zero. A compliant commit succeeds. On a branch that isn't a task branch, a non-exempt commit is refused with a pointer to `/start-task`. With a detached HEAD (for example mid-rebase), only the format is checked and the branch match is skipped. This is proven by tests that run the hook against a temporary repo.
- AC4: `.github/pull_request_template.md` holds the five sections `## Task`, `## Summary`, `## Acceptance criteria`, `## Verification` and `## Discovered`, with a one-line prompt in each, in that order. The Task section's form is `NNNN — tasks/NNNN-<slug>.md (part X of Y)`.
- AC5: `npm run pr:check -- --title … --body-file … --branch …` checks the title and the branch, and exits non-zero naming each check that failed. The title must pass AC1, the branch must be `task/<id>-<slug>`, and the title's task id must match the branch's. A test proves each refusal and the passing case.
- AC6: The same `pr:check` refuses a body, naming each problem, unless all five template headings are present with non-empty content (`None` counts) and the Task section names a `tasks/NNNN-*.md` file that exists and matches the branch's id. A body that passes every check exits 0. A test proves each refusal and the passing case.
- AC7: A `pr-standards` job in `.github/workflows/ci.yml` runs `pr:check` on every pull request. It runs again when the title or body is edited (`opened`, `edited`, `synchronize`, `reopened`), so a non-compliant PR shows a failing check and fixing the title or body turns it green without a new push. It checks the title and body only, not the individual branch commits.
- AC8: `CONTRIBUTING.md` covers the commit format with good and bad examples and the exemptions, branch naming, the PR template and when a task spans several PRs, squash merging with the PR title as the commit on main, and the task lifecycle (spec, `/start-task`, `/finish-task`, PR, a person merges). `README.md` and `CLAUDE.md` link to it.
- AC9: `docs/harness.md` lists the commit-msg hook and the `pr-standards` job in its guardrail table. Its "Recommended GitHub settings" section adds `pr-standards` to the required checks, allows squash merging only, sets the squash commit title to the PR title and the message to the PR body, and gives the `gh api` command that applies those settings.
- AC10: `/start-task` points to `CONTRIBUTING.md` for the commit format, replacing its inline example.
- AC11: `/finish-task` drafts the PR title and body from the template into the progress file, runs `pr:check` on the draft and fixes it until it passes. After the user's go-ahead, it opens the PR with `gh pr create --title … --body-file …` using that draft.
- AC12: The Definition of Done's commit item refers to `CONTRIBUTING.md`, and a new item requires the drafted PR title and body to pass `pr:check`.

## Out of scope

- New dependencies (commitlint, husky, lint-staged, semantic-release). The validators are zero-dependency TypeScript like `harness/lib/policy.ts`.
- Changelog generation, release tagging or version bumps.
- Rewording or rewriting existing commits, including task 0002's pushed ones. The new rules apply from here on.
- Checking each branch commit in CI. Squash merge means only the PR title reaches main.
- Enforcing imperative mood or subject case.
- CODEOWNERS, issue templates, Dependabot, signed commits or a DCO.
- Applying the GitHub repository settings from AC9. They're documented, and the owner runs them.
- Any change to `deploy.yml`, `evals.yml` or the app code. Also changes to other guard rules in `policy.ts` beyond what the new hook and validator need.
- Claude-based PR review (`/install-github-app`).

## Notes

- **Harness edits.** Most of this task edits harness files (`.githooks/`, `.github/`, `.claude/skills/`, `harness/`). Agents can't edit those, so the implementation session runs unlocked, `claude --setting-sources user,local`, on `task/0003-contribution-standards`, as PR #1 did. The Stop gate doesn't run in that mode, so run `npm run check` by hand before each commit and `npm run verify` before finishing. The owner reviews the harness diff before merging.
- **Approvals.** Writing `CLAUDE.md`, `docs/definition-of-done.md` and `package.json` (the `pr:check` script) still needs the owner's approval.
- **Decisions already made with the owner (2026-11-26):**
  - Keep the existing `type(scope): subject (task NNNN)` form.
  - Squash merge, with the PR title as the commit on main.
  - 72 characters for the whole header.
  - Every change needs a task, with no harness-chore exemption.
  - CI checks the PR title and body only.
  - The five-section PR template.
- **Defaults picked while drafting** (the owner can revise them):
  - The type list in AC1.
  - Scope is optional and kebab-case.
  - Subject case isn't enforced, because history has subjects like `GET /api/health …`.
  - `Co-Authored-By` and other trailers are allowed in the body.
  - The `🤖 Generated with Claude Code` footer may follow the last section.
- **Task 0002, still in progress.** Its remaining PR must use the template and a compliant title once this lands. Its existing over-length branch commits are fine because CI doesn't check branch commits.
- **One validator.** The hook, CI and `/finish-task` should all call the same validator code, so the three can't drift apart.
