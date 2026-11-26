---
id: "0001"
title: Walking skeleton with sentence feedback
---

## Objective

A learner can write one Spanish sentence and get it back corrected, with an explanation for each error. The feature is deliberately small: its job is to prove the whole pipeline (UI, API route, Claude call with structured output, unit tests, e2e tests, evals and CI) so that later tasks build on something that already works.

## Acceptance criteria

- AC1: The home page shows the app title and a form for writing a sentence. The submit button stays disabled until the sentence contains something other than whitespace.
- AC2: Submitting a sentence that has errors shows the corrected sentence and one entry per error: the wrong fragment, its correction and an explanation in English.
- AC3: A correct sentence gets a confirmation, and text that isn't Spanish gets a prompt to write in Spanish.
- AC4: An empty sentence or one over 500 characters is rejected with a clear message, without calling Claude.
- AC5: If Claude declines, gets cut off, returns unusable output, is rate limited or errors, the learner sees a friendly message and the app doesn't crash.
- AC6: An eval suite for sentence feedback exists, runs the app's own entry point against the real API, and fails below its pass-rate threshold.

## Out of scope

- Accounts, saved history and progress tracking.
- Lessons, exercises or any content beyond single-sentence feedback.
- Streaming responses.
- Visual design beyond a clean, readable default.

## Notes

Model settings live in `src/lib/llm/config.ts`: Claude Opus 5.5 at medium effort, with server-side refusal fallbacks enabled.
