---
name: run-evals
description: Run and interpret the LLM eval suites in evals/. Use when a prompt, an output schema, the model config or anything under src/lib/llm/ changes, or when the user asks how well the model is doing.
---

1. Evals call the real Claude API and cost money. The sentence-feedback suite is 12 cases × 3 reps on Claude Opus 5.5, on the order of $0.50 per run (the summary prints the real figure). Get the user's OK first, unless they asked for the run in this conversation.
2. Run `npm run evals`. For a sweep, override one setting at a time: `EVAL_EFFORT=low npm run evals`, `EVAL_MODEL=<id> npm run evals`, `EVAL_REPS=5 npm run evals`.
3. Read the printed summary and `evals/results/<suite>/latest.json`. Report the pass rate against the threshold, the per-check pass rates, refusals, truncations, infra errors (these are not model failures), cost and latency.
4. Before concluding anything from a failed case, read its rows in `evals/results/<suite>/<run>/results.jsonl`. If the model's answer looks right and the case or grader looks wrong, report it to the user as a likely case bug. `suite.json` is human-owned, so never edit it to match the model.
5. When comparing two runs, call a change real only if it's bigger than the rep-to-rep spread the summary reports.
6. Put the summary in the task's progress log.
