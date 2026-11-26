---
id: "0004"
title: Add the Claude Code Review workflow
---

## Objective

Every pull request gets an automatic code review from Claude, posted as inline comments, so problems surface before a person reviews and merges. The review is advisory: it never blocks a merge, and it costs at most one run per pull request at a time.

## Acceptance criteria

- AC1: `.github/workflows/claude-code-review.yml` runs `anthropics/claude-code-action@v1` with the `code-review` plugin on pull requests that are opened, reopened, marked ready for review or pushed to, and posts its findings as inline comments on the pull request.
- AC2: It authenticates with the `CLAUDE_CODE_OAUTH_TOKEN` repository secret, and its job token is read-only apart from `id-token: write`.
- AC3: A new push to a pull request cancels that pull request's review still in progress (a `concurrency` group with `cancel-in-progress`), and the job has a timeout.
- AC4: It uses the same `actions/checkout` major version as `ci.yml`.
- AC5: The workflow file passes `npm run check`, including Prettier.

## Out of scope

- The `@claude` mention workflow (`claude.yml`) that responds to comments.
- Making `claude-review` a required status check.
- Changes to `ci.yml`, `evals.yml` or the harness.

## Notes

Created by `/install-github-app` as PR #4 and brought in line with CONTRIBUTING.md. The action skips with a passing status until the workflow file on the pull request matches the one on `main`, so the first real review happens on the pull request after this one merges.
