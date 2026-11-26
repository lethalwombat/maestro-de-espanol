# Contributing

Every change to this repository takes the same path, with the same commit and pull request format, whether a person or an agent makes it. These rules are enforced, not just described. The `commit-msg` git hook checks each commit as you make it, and the `pr-standards` check in CI checks each pull request before merge. Both use one validator, `harness/lib/commit-message.ts`, so they can't disagree. How each guardrail works is in [docs/harness.md](docs/harness.md).

## The task lifecycle

1. **Spec.** Every change belongs to a task spec in `tasks/` ([tasks/README.md](tasks/README.md)), harness changes included. Ask Claude with `/new-task <what you want>` and approve the draft, or write one from the template.
2. **Start.** `/start-task <id>` creates the branch `task/<id>-<slug>` from `main` and the progress file `progress/<id>-<slug>.md`, and writes a plan.
3. **Work.** Test first, one criterion at a time, committing as you go in the format below.
4. **Finish.** `/finish-task` runs `npm run verify`, has the reviewer subagent check the diff against the spec, and records the evidence and the [Definition of Done](docs/definition-of-done.md). It also drafts the pull request title and body into the progress file, and fixes the draft until `npm run pr:check` passes.
5. **Pull request.** Once you say go, Claude pushes the branch and opens the pull request from that draft.
6. **Merge.** A person reviews it and squash-merges it. Agents never merge.

## Branches

Each task has one branch, named `task/<id>-<slug>` after its spec: `tasks/0003-contribution-standards.md` is worked on in `task/0003-contribution-standards`. Commits on `main` are blocked. The `commit-msg` hook also refuses commits on any branch that isn't a task branch, except git's own messages (see [Exemptions](#exemptions)).

## Commit messages

```text
type(scope): subject (task NNNN)

Optional body: why the change was made, after a blank line.

Co-Authored-By: Name <email>
```

- **type** is one of:

  | Type       | For                                            |
  | ---------- | ---------------------------------------------- |
  | `feat`     | new behaviour                                  |
  | `fix`      | a bug fix                                      |
  | `docs`     | documentation only                             |
  | `test`     | tests only                                     |
  | `refactor` | a code change that doesn't change behaviour    |
  | `perf`     | a speed-up                                     |
  | `build`    | the build, dependencies or the container image |
  | `ci`       | CI workflows                                   |
  | `chore`    | upkeep that fits none of the above             |
  | `revert`   | undoing an earlier change by hand              |

- **scope** is optional: the area the commit touches, in lowercase kebab-case, like `harness`, `infra` or `sentence-feedback`.
- **subject** says what the commit does. It can't be empty or end with a period. Its case isn't checked, so `GET /api/health reports the commit` is fine.
- **(task NNNN)** ends the header, with the task's four-digit id. On a task branch it must be that branch's task.
- The whole header is at most **72 characters**.
- A **body** is optional. If there is one, a blank line separates it from the header. Trailers such as `Co-Authored-By:` go at its end.

These pass:

```text
feat(sentence-feedback): explain each error in the reply (task 0004)
fix: answer 502 when Claude has no credential (task 0002)
docs(deploy): rollback steps (task 0002)
ci: run e2e against the production build (task 0005)
```

These are refused:

| Header                                                                                 | Why                                          |
| -------------------------------------------------------------------------------------- | -------------------------------------------- |
| `Add the health endpoint`                                                              | It isn't `type(scope): subject (task NNNN)`. |
| `feature(health): add the endpoint (task 0002)`                                        | `feature` isn't a type.                      |
| `feat(Health): add the endpoint (task 0002)`                                           | The scope isn't lowercase kebab-case.        |
| `feat(health):add the endpoint (task 0002)`                                            | There's no space after the colon.            |
| `feat(health): add the endpoint. (task 0002)`                                          | The subject ends with a period.              |
| `feat(health): add the endpoint`                                                       | There's no `(task NNNN)`.                    |
| `feat(health): add the endpoint (task 2)`                                              | The task id isn't four digits.               |
| `feat(health): add GET /api/health, reporting status and the build commit (task 0002)` | It's 84 characters, over the 72 limit.       |
| `feat(health): add the endpoint (task 0002)`, on `task/0003-contribution-standards`    | It names a different task from the branch's. |

When the hook refuses a commit, it lists each broken rule and says where your message was saved, usually `.git/COMMIT_EDITMSG`. Fix it with `git commit -e -F .git/COMMIT_EDITMSG`. `npm ci` installs the hooks: the `prepare` script points `core.hooksPath` at `.githooks`.

### Exemptions

Git writes some messages itself. The hook lets these through on any branch:

- merge commits, `Merge …`, from `git merge`, `git pull` or GitHub;
- `Revert "…"` from `git revert`;
- `fixup! …`, `squash! …` and `amend! …` from `git commit --fixup` or `--squash`, which a rebase then squashes away.

With a detached HEAD, for example mid-rebase, the hook checks only the format. There's no branch to compare the task id with.

## Pull requests

**Title.** It uses the same format as a commit header and names the branch's task, for example `ci(harness): enforce commit and pull request standards (task 0003)`. It becomes the commit on `main`, so write it for the whole pull request. The commit exemptions don't apply to titles.

**Body.** GitHub fills the description with `.github/pull_request_template.md`. Fill in all five sections, in this order, and write `None` where nothing applies. The prompts are HTML comments, so a section holding only its prompt counts as empty.

| Section                  | What goes in it                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `## Task`                | `NNNN — tasks/NNNN-<slug>.md (part X of Y)`: the spec, and which part of the task this is. Use `(part 1 of 1)` when one pull request covers it all. |
| `## Summary`             | What changed and why.                                                                                                                               |
| `## Acceptance criteria` | Each criterion this pull request covers, with the test or command that proves it.                                                                   |
| `## Verification`        | The summary `npm run verify` printed, plus anything checked by hand.                                                                                |
| `## Discovered`          | Out-of-scope findings from the progress file, or `None`.                                                                                            |

A `🤖 Generated with Claude Code` footer may follow the last section.

**Checks.** CI's `pr-standards` job runs `npm run pr:check` on every pull request, and again whenever the title or body is edited. Fixing either on GitHub turns the check green without a new push. It checks four things:

- the title follows the commit-header rules;
- the branch is `task/<id>-<slug>`;
- the title names the branch's task;
- the body has all five sections with content, and its Task section names a spec in `tasks/` that exists and matches the branch's id.

It doesn't check the branch's individual commits, because squash merging puts only the title on `main`. Run it yourself before opening a pull request (`--body-file -` reads the body from stdin):

```bash
npm run pr:check -- --title "ci(harness): enforce commit and pull request standards (task 0003)" \
  --body-file pr-body.md --branch "$(git branch --show-current)"
```

### A task in several pull requests

Split a task when part of it must be on `main` before the rest can be done or proven, or when it's too big to review in one go. For example, task 0002's deploy workflow only runs from `main`.

- Each part is a pull request from the task branch, with `(part X of Y)` in its Task section and a title naming the same task.
- Every part passes `npm run pr:check` before it's opened. `/finish-task` drafts and checks the last part. Draft the earlier ones the same way.
- The progress file stays `in-progress` until the last part, which is the one `/finish-task` closes.
- A squash merge puts a part on `main` as one new commit, so the branch's own commits for that part never reach `main`. Before continuing, move the branch's newer commits onto `main`: `git fetch origin && git rebase --onto origin/main <last commit of the merged part>`. GitHub deletes merged branches here, so the next push creates the branch afresh rather than needing a force push.

## Merging

Pull requests are squash-merged. `main` gets one commit per pull request: its header is the pull request title and its message is the body. GitHub appends the number, as in `… (task 0003) (#3)`. A person merges once `check`, `e2e` and `pr-standards` pass. The repository settings that enforce this are in [docs/harness.md](docs/harness.md#recommended-github-settings).
