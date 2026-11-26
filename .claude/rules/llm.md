---
paths:
  - "src/lib/llm/**"
  - "src/features/**/prompt.ts"
  - "src/features/**/schema.ts"
  - "evals/**"
---

- Model, effort, betas and fallbacks live only in `src/lib/llm/config.ts`. Don't change them without the user's say-so, and run the evals before and after when they agree.
- Load the `claude-api` skill before writing or changing SDK code. Don't guess API shapes, because they change often.
- Structured output goes through `requestStructured()`. Callers must handle every failure reason: `refused`, `truncated` and `invalid_output`. API errors still throw typed `Anthropic.APIError` subclasses.
- A prompt or schema change needs `npm run evals` (see /run-evals). `suite.json` files are human-owned ground truth: propose new or corrected cases to the user, and never edit expectations to match what the model said.
