---
id: "0007"
title: Generate interactive exercises from a prompt managed in an admin panel
---

## Objective

A learner names any topic about the Spanish language ("preterite vs imperfect", "por y para", "food vocabulary") and gets an interactive exercise built for it. They answer it on the page and see, item by item, what they got right and what they got wrong, with an explanation. The prompt that generates exercises isn't fixed in code: the owner edits it in an admin panel, every save is kept as a version, and any version or the default from code can be restored, all without a redeploy.

## Acceptance criteria

### Generating an exercise

- AC1: `/exercises` has a topic field labelled "Topic" and a "Create exercise" button. Submitting an empty or whitespace-only topic, or one over 200 characters, shows a validation message and sends no request.
- AC2: Submitting a Spanish-language topic sends it to `POST /api/exercises`, which calls Claude through `requestStructured()` in `src/lib/llm/` with the active exercise prompt as the system prompt and the topic inside delimiting tags in the user message. The response is validated with zod in the route and again in the browser.
- AC3: The exercise output schema lives in code and requires a title, short instructions and 5 to 10 items. Each item is either multiple choice (a prompt, 2 to 4 options, exactly one correct option) or fill-in-the-blank (a sentence with exactly one blank, the expected answer and optional alternative accepted answers), and every item carries an English explanation. A response that breaks the schema is treated as invalid output and the learner sees an error message, never a half-rendered exercise.
- AC4: When the topic isn't about the Spanish language (for example "Python decorators"), the response says so and the page shows an info message asking for a Spanish-language topic. No exercise is rendered.
- AC5: While an exercise is being generated, the button is disabled and shows a spinner next to "Creating…", and the exercise area shows a loading placeholder with `aria-busy="true"`. Both go as soon as the exercise or an error arrives.
- AC6: A refusal, truncation, invalid output, rate limit or unavailable API shows an alert with an error message on the page, and the topic stays in the field so the learner can try again.

### Doing the exercise

- AC7: The exercise renders its title, instructions and items in order. A multiple-choice item is a radio group named by its prompt; a fill-in-the-blank item is a text input whose accessible name includes the sentence. Everything is operable by keyboard.
- AC8: The learner can answer items in any order and submit with a "Check answers" button. Unanswered items are allowed and count as wrong.
- AC9: Grading happens in code against the answer key, with no second Claude call. A multiple-choice item is right when the chosen option is the correct one. A fill-in-the-blank answer is compared with the expected answer and the alternatives after trimming, collapsing spaces and ignoring case and ¿ ¡ punctuation.
- AC10: A fill-in-the-blank answer that differs from an accepted answer only by accents (for example "esta" for "está") is marked right, with a note that shows the accented form and says to watch the accent.
- AC11: After "Check answers", each item shows whether it was right or wrong (in words and with a Lucide icon hidden from assistive technology), the learner's answer, the correct answer when wrong, and the item's explanation. A summary states the score, for example "6 of 8 right". Answers can no longer be changed.
- AC12: After checking, a "Try again" button clears the answers and results of the same exercise, and a "New exercise" control returns focus to the topic field. Neither makes a request until the learner submits again.
- AC13: The exercise page follows `docs/design.md`: shared components from `src/components/ui/`, semantic tokens only, both themes. axe (`@axe-core/playwright`) finds no WCAG 2.2 A or AA violations on `/exercises` in each state (empty, loading, exercise shown, checked, off-topic, error), in light and dark.
- AC14: The pages have a simple navigation that links the sentence checker (`/`), exercises (`/exercises`) and the prompt admin (`/admin/prompts`). The home page's existing tests pass with no change to their code.

### Managing the prompt

- AC15: The default exercise prompt lives in code in the exercise feature. With no saved version, the default is the active prompt.
- AC16: `/admin/prompts` shows the active exercise prompt in a text area, says whether it's the default or a saved version (with its save time), and has a "Save" button. Saving an empty prompt, or one over 20,000 characters, is refused with a validation message.
- AC17: Saving stores a new version with its text and save time and makes it active. The next exercise generated uses it, with no redeploy or restart.
- AC18: The admin page lists saved versions, newest first, with save time and the first line of each. Choosing "Restore" on a version saves a copy of it as the new active version (history is never rewritten). "Restore default" makes the code default active again.
- AC19: Saved versions survive a restart and scale to zero. In Azure they're stored in Azure Table Storage, in a storage account defined in `infra/main.bicep`, reached with the container app's managed identity and an RBAC role scoped to that account. No storage key or connection string is stored in the app, GitHub or the repo.
- AC20: Locally and in tests, the prompt store is an in-memory or file implementation behind the same interface, chosen by configuration. Unit and e2e tests never reach Azure.
- AC21: If the prompt store can't be read while generating an exercise, the exercise is generated with the code default and the failure is logged without the prompt text. If a save fails, the admin page shows an error alert and the editor keeps the unsaved text.
- AC22: The admin page and its API are reachable only through the app's existing Easy Auth sign-in, like every other route. `docs/deployment.md` records the new storage account, its role assignment and the admin route.

### Quality

- AC23: An eval suite in `evals/` for exercise generation runs against the default prompt in code. It checks, on a set of on-topic and off-topic topics, that on-topic topics return a valid exercise whose items are about the topic and whose answer keys are correct Spanish, and that off-topic topics are declined. Its results are recorded in the progress file (evals cost money, so the run is agreed with the owner first).

## Out of scope

- Free-text translation or open-ended items, and any grading by a second Claude call.
- Learner-chosen length, CEFR level or item types.
- Saving exercises, scores, progress or history for the learner; spaced repetition.
- Editing the output schema, model, effort or other LLM settings in the admin panel. They stay in code (`config.ts`).
- Managing the sentence-feedback prompt in the admin panel.
- Running evals against a stored prompt, or comparing prompt versions automatically.
- A separate admin role, user management or any sign-in beyond the existing Easy Auth owner-only setup.
- A database other than Azure Table Storage (Postgres, Cosmos DB), and storage keys or connection strings.
- Streaming the exercise as it is generated.
- Changing the sentence-feedback feature, its prompt or schema.

## Notes

Decisions agreed with the owner on 2026-11-26:

- Item formats: multiple choice and fill-in-the-blank, mixed as Claude sees fit, 5 to 10 items, graded in code.
- Accents: lenient. A missing or wrong accent is marked right with a note.
- Off-topic topics are declined, not turned into themed Spanish practice.
- Storage: Azure Table Storage with managed identity. The output schema stays in code, so an edited prompt can change what's asked but can't break rendering or grading.
- Access: Easy Auth already limits the app to the owner, so `/admin` has no extra gate.
- Evals measure the code default. The admin panel is for experimenting; promoting a good prompt into code (and running evals) is a separate, manual step.
- Because the stored prompt is the system prompt, a saved prompt still has the topic arrive inside tags in the user message, so a topic can't override it.
