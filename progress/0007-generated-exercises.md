---
task: "0007"
status: in-progress
---

## Plan

### Approach

Two new features, side by side with `sentence-feedback`, plus a nav and the Azure pieces.

- `src/features/exercises/`: `schema.ts` (request, exercise output schema, response union), `prompt.ts` (default system prompt, `buildUserMessage` with `<topic>` tags), `generate.ts` (`generateExercise(client, topic, system)`, used by the app and the eval), `handler.ts` (`POST /api/exercises`: validate, read the active prompt with fallback to the default, call, map failures to messages like the feedback handler), `grade.ts` (pure grading: normalise, accent-lenient match), `exercise-form.tsx`, `exercise-view.tsx` (items, "Check answers", results, "Try again", "New exercise"), tests beside each.
- Exercise schema: discriminated union on `type: "multiple_choice" | "fill_blank"`, plus `on_topic: boolean` (or a `status` enum) so an off-topic topic comes back as a declined result with no items. Constraints the structured-output grammar can't express (5 to 10 items, 2 to 4 options, exactly one correct option, exactly one blank) are enforced by zod refinements after parsing, so a breach is `invalid_output` (AC3). Check with the `claude-api` skill which constraints `betaZodOutputFormat` passes through, before writing it.
- `src/features/prompt-admin/`: `store.ts` (interface `PromptStore { listVersions(); getActive(); save(text); restoreDefault() }`, where the active state is a pointer row, so "Restore" and "Restore default" never rewrite history), `memory-store.ts`, `file-store.ts`, `table-store.ts` (`@azure/data-tables` + `DefaultAzureCredential` from `@azure/identity`), `get-store.ts` (picks the store from `PROMPT_STORE=memory|file|table` and `PROMPT_TABLE_ENDPOINT`), `handler.ts` (`GET/POST /api/admin/prompts`, `POST …/restore`, `POST …/restore-default`), `admin-page.tsx`, tests.
- `src/components/ui/`: add the shared pieces the new pages need (text input, radio option, nav), each documented in `docs/design.md` and covered by the existing token and contrast tests.
- `src/app/`: `exercises/page.tsx`, `admin/prompts/page.tsx`, `api/exercises/route.ts`, `api/admin/prompts/…/route.ts`, and the nav in `layout.tsx` or a shared header.
- Infra: a storage account (Standard_LRS, shared-key access off, TLS 1.2, no public blob) and a table in `infra/main.bicep`, system-assigned identity on the container app, the `Storage Table Data Contributor` role assignment scoped to the storage account, and the env vars `PROMPT_STORE=table` and `PROMPT_TABLE_ENDPOINT`. Register `Microsoft.Storage` in `infra/bootstrap.sh`. `docs/deployment.md` gets the storage account, the role and the admin route.
- e2e: `mock-anthropic.ts` gets canned exercises keyed by `<topic>` (on-topic, off-topic, refusal, invalid output). A canned response echoes a marker from the system prompt so AC17 can be checked end to end. Playwright runs the app with `PROMPT_STORE=memory`.
- Evals: `evals/exercises/` with `suite.json` (human-owned, so I propose cases to you), `grade.ts`, `exercises.eval.ts`, run against `DEFAULT_EXERCISE_PROMPT`.

### First failing test per criterion

- AC1: `exercise-form.test.tsx` "rejects an empty, blank or over-long topic without sending a request".
- AC2: `handler.test.ts` "sends the active prompt as the system prompt and the topic inside <topic> tags"; `exercise-form.test.tsx` "shows an error when the response fails the browser-side schema".
- AC3: `schema.test.ts` cases for each bound (4 and 11 items, 1 and 5 options, 0 and 2 correct options, 0 and 2 blanks); `handler.test.ts` "treats a schema-breaking response as invalid output".
- AC4: `handler.test.ts` + `exercise-form.test.tsx` "shows an info message for an off-topic topic and renders no exercise".
- AC5: `exercise-form.test.tsx` "disables the button and shows a busy placeholder while generating".
- AC6: `handler.test.ts` per failure (refused, truncated, invalid, 429, 5xx, no credential); `exercise-form.test.tsx` "keeps the topic after an error".
- AC7: `exercise-view.test.tsx` "renders items in order as named radio groups and labelled inputs".
- AC8: `exercise-view.test.tsx` "checks with unanswered items and counts them wrong".
- AC9, AC10: `grade.test.ts` (trim, spaces, case, ¿ ¡, alternatives, accent-only difference flagged with the accented form).
- AC11: `exercise-view.test.tsx` "shows right or wrong, the answers, the explanation and the score, and locks the inputs".
- AC12: `exercise-view.test.tsx` "Try again clears answers"; `exercise-form.test.tsx` "New exercise focuses the topic and sends nothing".
- AC13: `e2e/exercises-accessibility.spec.ts` axe in six states × two themes.
- AC14: `e2e/navigation.spec.ts`; the existing home tests are run unchanged.
- AC15 to AC18: `store.test.ts` (a contract suite run against the memory and file stores, plus the table store against a fake `TableClient`), `prompt-admin/handler.test.ts`, `admin-page.test.tsx`, `e2e/prompt-admin.spec.ts` (save, then generate, then the mock confirms the new system prompt was used).
- AC19: Bicep only. `az bicep build` + `what-if` evidence; a unit test that `table-store.ts` builds its client from `DefaultAzureCredential` and an endpoint, never a key or connection string; a repo grep test for `AccountKey=` / `SharedAccessSignature`.
- AC20: `get-store.test.ts` "picks memory, file or table from configuration"; e2e config uses memory.
- AC21: `handler.test.ts` "falls back to the default prompt when the store throws, and logs without the prompt text"; `admin-page.test.tsx` "shows an alert on a failed save and keeps the text".
- AC22: docs, plus an anonymous `curl` against `/admin/prompts` and `/api/admin/prompts` after deploy (expect 302 / 401).
- AC23: `evals/exercises/grade.test.ts` (reference answers pass the grader), then the eval run you agree to.

### Risks

- The deployment identity holds only Contributor on the resource group, and Contributor can't create role assignments. The Bicep role assignment for AC19 fails on deploy unless the identity is given a narrow right to assign roles (see open questions).
- Claude has no credential in Azure yet (docs/deployment.md), so generating an exercise in Azure returns the "unavailable" message until a later task adds one. The admin panel and storage will still work there.
- `betaZodOutputFormat` may drop or reject array bounds and refinements; the zod checks after parsing are the real guard either way.
- e2e runs `fullyParallel` against one server, so admin tests that change the active prompt could leak into exercise tests. Keep the exercise mock indifferent to the system prompt except in the one AC17 scenario, and restore the default at the end of admin tests.
- Two new runtime dependencies: `@azure/data-tables` and `@azure/identity`.

### Open questions

- Q1 (AC19), answered: `infra/bootstrap.sh` gives the deployment identity `Role Based Access Control Administrator` on the app resource group, with an ABAC condition so it can only assign `Storage Table Data Contributor` to service principals. Bicep owns the assignment. The owner re-runs bootstrap once before merging.
- Q2 (AC23), answered: Claude as judge, in the eval only. A second call per exercise with a rubric (on topic; each key correct and the only right answer), with the judge's reasons recorded. The judge is unit-tested against hand-written good and bad exercises.
- AC23 `suite.json` is human-owned: I'll propose the cases for your approval before writing them, and ask before running the eval.

## Log

- 2026-11-26: Started. Spec committed on the branch as its first commit (agreed with the owner).
- 2026-11-26: Owner decisions: narrow RBAC admin for the deployment identity (Q1), and Claude as judge in the eval (Q2).

## Discovered (out of scope)

## Acceptance evidence

- AC1:
- AC2:
- AC3:
- AC4:
- AC5:
- AC6:
- AC7:
- AC8:
- AC9:
- AC10:
- AC11:
- AC12:
- AC13:
- AC14:
- AC15:
- AC16:
- AC17:
- AC18:
- AC19:
- AC20:
- AC21:
- AC22:
- AC23:

## Definition of Done

(Filled in by /finish-task.)

## Pull request

(Drafted by /finish-task: the title, then the body in a fenced `markdown` block.)
