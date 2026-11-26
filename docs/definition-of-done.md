# Definition of Done

A task is done when every item below is true. `/finish-task` walks through the list, the `reviewer` subagent checks the judgment calls, and `npm run tasks:check` refuses `status: done` while any item is missing or unticked in the progress file.

Copy the checklist into the task's progress file and tick only what is true. If an item doesn't apply, tick it and say why after a dash (for example "— N/A: no prompt changes").

- [ ] `npm run verify` passes (format, typecheck, lint, unit tests with coverage thresholds, production build, e2e), and its summary is pasted in the progress log.
- [ ] If a prompt, an output schema or anything in `src/lib/llm/` changed, `npm run evals` meets the suite threshold and the summary is in the progress log.
- [ ] Every acceptance criterion has evidence under "Acceptance evidence": the test that proves it, or the command and output for what a test can't show.
- [ ] New behaviour was written test-first: each new test was seen failing before the code that makes it pass.
- [ ] User-visible behaviour is covered by an e2e test, or the progress file says why not.
- [ ] The diff serves this task's acceptance criteria and nothing else. Unrelated findings are listed under "Discovered", not fixed.
- [ ] No test, assertion, lint rule or threshold was removed or loosened, and there is no new `eslint-disable`, `@ts-expect-error`, `.skip` or `.only`.
- [ ] No new dependency, unless the task needed one and the user approved the install.
- [ ] No secrets, API keys or `.env` contents in code, fixtures, logs or commits.
- [ ] The `reviewer` subagent reviewed the diff against the spec, and every correctness gap it found is fixed or answered in the progress file.
- [ ] Docs are updated wherever behaviour, commands or setup changed.
- [ ] The work is committed on the task branch with Conventional Commit messages that mention the task id.
