---
task: "0001"
status: in-progress
---

## Plan

Bootstrap task: built together with the agent harness as the repository's first commit, so it went straight onto `main` rather than a task branch.

1. LLM boundary in `src/lib/llm/`: one config, one client, and `requestStructured()`, which checks the stop reason before reading content and turns every failure into a typed result.
2. Feature in `src/features/sentence-feedback/`: schema, prompt, entry point, request handler, form.
3. Tests at each level: SDK-level unit tests through a fake transport, handler tests, component tests, Playwright e2e against a mock Messages API.
4. Eval suite: hand-checked seed cases with gold answers, code-graded atomic checks, a grader test suite (oracle passes, null baseline fails).

## Log

- 2026-11-26: Built the skeleton and the harness together. `npm run verify`: tasks, format, typecheck, lint, unit (238 tests, coverage above thresholds) and e2e (4 tests) all green.
- 2026-11-26: Smoke-tested the harness in real headless Claude Code sessions against a copy of the repo. The edit on main was refused; the harness edit and the force push were refused; the Stop gate sent back a deliberate type error until it was fixed; SessionStart injected the task context; the reviewer's write attempts were refused.
- 2026-11-26: Seed eval cases reviewed for ambiguity. Replaced "es cansada" ("tiresome" is a valid reading) and "por aprobar" (defensible in some registers) with clear-cut cases.
- 2026-11-26: Not yet done: evals haven't been run against the real API (that needs credentials and the user's go-ahead to spend), and the reviewer subagent hasn't reviewed the work.

## Discovered (out of scope)

- The system prompt is probably under the model's minimum cacheable prefix (roughly 300 tokens against a 512-token minimum), so its `cache_control` breakpoint likely does nothing yet. Check `cacheReadTokens` in the first eval results. It pays off once the prompt grows, for example with worked examples.

## Acceptance evidence

- AC1: e2e `the home page introduces the tutor`; `feedback-form.test.tsx` "keeps the button disabled until there is something to check"
- AC2: e2e `a sentence with errors comes back corrected, with an explanation per error`; `feedback-form.test.tsx` "sends the sentence and shows each correction with its explanation"
- AC3: e2e `a correct sentence is confirmed`; `feedback-form.test.tsx` "congratulates a correct sentence" and "says so when the text isn't Spanish"
- AC4: `handler.test.ts` "rejects an empty sentence / a sentence over the limit / ... without calling Claude"
- AC5: `handler.test.ts` refusal (422), truncation, schema failure and API error (502), rate limit (503); `structured.test.ts` covers each failure path; e2e `a declined request shows a friendly message instead of failing`
- AC6: `evals/sentence-feedback/sentence-feedback.eval.ts` with `suite.json` (minPassRate 0.9); `grade.test.ts` checks the grader against gold answers and baselines. Not yet run against the API.

## Definition of Done

(Filled in by /finish-task.)
