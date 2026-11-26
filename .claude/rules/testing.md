---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "e2e/**"
---

- Unit tests are hermetic: `fetch` to any non-local host throws. For Claude, use `fakeAnthropic()` from `src/lib/llm/testing.ts`. It runs the real SDK against an in-memory transport, so request shape and response handling are both tested. For browser requests in component tests, use `vi.stubGlobal("fetch", ...)`.
- Query the DOM the way a user would (`getByRole`, `getByLabelText`, visible text). Reach for test ids only when nothing else is unique.
- e2e runs against a production build. Claude is replaced by `e2e/mock-anthropic.ts`, and each scenario needs its own canned response there, keyed by the learner's sentence. e2e never calls the real API.
- Name tests after the behaviour ("rejects an empty sentence without calling Claude"). The acceptance evidence in progress files quotes these names.
