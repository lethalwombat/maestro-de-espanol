# Tasks

Every change to this repo belongs to a task. A task has two files:

| File                      | Owner                                                                        | Holds                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `tasks/<id>-<slug>.md`    | People. Agents can propose one, but writing or editing it asks for approval. | What should be true and how we'll know: objective, acceptance criteria, out of scope. |
| `progress/<id>-<slug>.md` | The agent doing the work.                                                    | How it's going: status, plan, log, discoveries, evidence, Definition of Done.         |

Keeping the spec separate from the progress notes means an agent can't quietly redefine "done" while it works.

## Lifecycle

1. **Spec.** Write `tasks/<id>-<slug>.md` from [TEMPLATE.md](TEMPLATE.md), or ask Claude: `/new-task <what you want>`. It interviews you, then drafts the spec for your approval. `npm run tasks -- --next-id` gives the next id.
2. **Start.** `/start-task <id>` creates the branch `task/<id>-<slug>` and the progress file, then writes a plan before touching code.
3. **Work.** For each criterion: failing test, code, green, commit. The SessionStart hook restates the task's objective and scope at the start of every session and after every compaction.
4. **Finish.** `/finish-task` runs `npm run verify`, has the `reviewer` subagent check the diff against the spec, records evidence and the [Definition of Done](../docs/definition-of-done.md), and commits.
5. **Merge.** A person reviews the pull request and merges it. Agents never merge.

## Writing good acceptance criteria

- Number them `AC1`, `AC2`, ... in order. The progress file refers to them by id.
- Make each one observable: an input or action and the expected result. "Shows the corrected sentence and one explanation per error" works; "good feedback" doesn't.
- One behaviour per criterion, so evidence maps one to one.
- Put tempting adjacent work under "Out of scope". It is the agent's main defence against scope creep.

## Status

`npm run tasks` lists every task with its status: `todo` (no progress file yet), `in-progress`, `blocked` or `done`. `npm run tasks:check`, which is part of `npm run check`, validates the format and refuses `done` while evidence or checklist items are missing.
