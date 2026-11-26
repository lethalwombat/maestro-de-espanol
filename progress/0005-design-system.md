---
task: "0005"
status: done
---

## Plan

### Approach

- **Tokens.** `src/styles/tokens.css` holds one Tailwind v4 `@theme` block. It switches off the default palette (`--color-*: initial`) and defines semantic colours as `light-dark(<light>, <dark>)`, so each token's light and dark values sit side by side in one declaration. `color-scheme` drives the theme: `light dark` on `:root` follows the OS (live, without JS), and `[data-theme="light"]` / `[data-theme="dark"]` on `<html>` force one. The file also holds the font family, type scale, radii, shadows, motion durations and easings, keyframes and the content width.
- **Theme choice.** `src/components/ui/theme.ts` reads and writes `localStorage` behind try/catch and exposes a small store for `useSyncExternalStore`. The same module exports the inline script that the root layout puts in `<head>`, so a saved choice is applied before React loads. `<html>` gets `suppressHydrationWarning`.
- **Components** in `src/components/ui/`: `Button` (with `loading`), `TextArea`, `Card`, `Message` (success, info, danger, with Lucide icons, `aria-hidden`), `Spinner`, `Skeleton`, `ThemeToggle` (a `radiogroup` named "Theme" of native radios, so arrow keys work, and each radio is itself the 44 × 44 target and carries the focus ring).
- **Page.** A header with the h1 and the theme control, then `main` with the lede and the form. `globals.css` keeps only the imports and base element styles.
- **Guide.** `docs/design.md` with the twelve sections. Token tables and a contrast-pairs table are machine-read by the tests, so the guide and the code can't drift.

### Tests, first failing one per criterion

| AC        | Test                                                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1, AC2  | `src/styles/design-guide.test.ts`: section and component headings and states in `docs/design.md`; README link; CLAUDE.md Conventions lines                                                                                                                                                  |
| AC3, AC5  | `src/styles/design-guide.test.ts`: tokens and `@theme` only in `tokens.css`; `globals.css` has only imports and element selectors; old class names absent from `src/`; `postcss.config.mjs` uses `@tailwindcss/postcss`. e2e: the served stylesheet holds Tailwind utilities and the tokens |
| AC4       | e2e `e2e/design-system.spec.ts`: no default palette variable in the production CSS                                                                                                                                                                                                          |
| AC6       | `src/styles/colour-literals.test.ts`: fixtures for CSS, arbitrary value, inline style, SVG attribute; then the repo scan                                                                                                                                                                    |
| AC7       | `src/styles/contrast.test.ts`: pairs read from the guide, both themes                                                                                                                                                                                                                       |
| AC8       | `src/styles/token-sync.test.ts`                                                                                                                                                                                                                                                             |
| AC9       | e2e: font request from `/_next/static/media/`, computed body font, same-origin requests only                                                                                                                                                                                                |
| AC10      | existing unit and e2e tests, unchanged                                                                                                                                                                                                                                                      |
| AC11–AC12 | new unit tests beside the feature (the existing test file stays untouched), plus e2e                                                                                                                                                                                                        |
| AC13–AC16 | `src/components/ui/theme*.test.ts(x)` and e2e `e2e/theme.spec.ts`                                                                                                                                                                                                                           |
| AC17–AC18 | unit test on motion tokens (≤ 300 ms, spinner excepted) and no raw durations in `src/`; e2e on `getAnimations()` and reduced motion                                                                                                                                                         |
| AC19–AC21 | e2e `e2e/layout.spec.ts` at 320, 390, 768, 1280 px                                                                                                                                                                                                                                          |
| AC22      | e2e `e2e/accessibility.spec.ts` with `@axe-core/playwright`, 6 states × 2 themes                                                                                                                                                                                                            |

### Files likely to change

`package.json`, `package-lock.json` (via `npm install`), `postcss.config.mjs` (new), `src/styles/*`, `src/components/ui/*`, `src/app/{globals.css,layout.tsx,page.tsx}`, `src/features/sentence-feedback/feedback-form.tsx`, `e2e/*.spec.ts`, `e2e/mock-anthropic.ts` (a canned "not Spanish" reply for the axe scan), `docs/design.md`, `README.md`, `CLAUDE.md`.

### Risks

- Lightning CSS (inside Tailwind) may transpile `light-dark()` for older browser targets. If the e2e theme tests show that breaks the `data-theme` override, fall back to a dark block per selector.
- `next build` needs Google Fonts at build time (noted in the spec).
- The existing `findByRole("status")` tests need exactly one status region, so the loading placeholder and the spinner carry no `status` role.

### Open questions

None open. See the log for the spinner decision.

## Log

- 2026-11-26: Started. Merged `main` into the branch first to pick up PR #7 (hermetic git in tests, the worktree push fix).
- 2026-11-26: The branch had been checked out in a locked worktree under `.claude/worktrees/`, where every edit is refused (`.claude/**` is human-owned). With the user's go-ahead, removed that worktree (it was clean) and continued in the main checkout.
- 2026-11-26: Installed `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `@axe-core/playwright` (dev) and `lucide-react`, exact versions, as approved in the spec.
- 2026-11-26: Decision (user): AC17's 300 ms cap applies to one-shot motion (result card, corrections, button press). The spinner's turn uses its own token, `--duration-spin`, and the guide names it as the one exception.
- 2026-11-26: Unit tests for AC1–AC8 written first and seen failing (missing `tokens.css` and `docs/design.md`, literals in the old `globals.css`), then made to pass. Found and fixed two parser bugs along the way: table separator rows read as tokens, and a CSS comment swallowing the next declaration.
- 2026-11-26: Discovery: Tailwind's Lightning CSS step polyfills `light-dark()` for its browser targets (`--lightningcss-light` / `--lightningcss-dark` switches). The compiled `:root[data-theme=…]` rules set both switches and outrank the media query, so the plan held; the theme e2e tests confirm it.
- 2026-11-26: Component and feature unit tests (AC11, AC12, AC14, AC16) seen failing on missing modules and missing spinner/placeholder, then passing. `feedback-form.test.tsx` is unchanged.
- 2026-11-26: First e2e run: 48/49 passed. The press test failed on a real bug: Tailwind v4's `scale-[0.98]` sets the CSS `scale` property, not `transform`, so the transitions listed the wrong property. Fixed in Button and ThemeToggle.
- 2026-11-26: The e2e specs were written after the restyle, so to see them fail I ran them in a temporary worktree against earlier commits: at `74658ad` (tokens, no restyle) 28 failed and 16 passed (the passes cover what that commit already had); at `93712c5` (no tokens) the stylesheet and OS-theme tests failed; and at `825dad4` with `--color-*: initial` removed, the default-palette test failed. Worktrees removed afterwards.
- 2026-11-26: `npm run verify`:

  ```text
  harness check --full:
    ✔ tasks (0.1s)
    ✔ format (1.9s)
    ✔ typecheck (2.8s)
    ✔ lint (4.7s)
    ✔ unit (10.0s)
    ✔ e2e (7.7s)

  All checks passed.
  ```

- 2026-11-26: Reviewer: (1) the theme toggle's checked state reached only about 1.1–1.2:1 (fill) and 2.35:1 (label) against the track, below WCAG 1.4.11, and no contrast row covered it; a guide row also mislabelled the selected label's background. Fixed: a test first (seen failing), then a 1 px `--color-border-strong` ring on the checked option (about 4.1:1 light, 3.3:1 dark against the track), a new contrast pair so `contrast.test.ts` guards it, and the row relabelled. (2) The e2e specs were written after the restyle and seen failing only afterwards, against earlier commits (see above). Agreed: the DoD's test-first item is ticked with that caveat. No scope gaps.
- 2026-11-26: `npm run verify` after the review fix:

  ```text
  harness check --full:
    ✔ tasks (0.1s)
    ✔ format (2.1s)
    ✔ typecheck (2.9s)
    ✔ lint (4.7s)
    ✔ unit (9.6s)
    ✔ e2e (7.6s)

  All checks passed.
  ```

## Discovered (out of scope)

- `playwright.config.ts` (human-owned) starts the app with `next start`, which warns that it doesn't work with `output: "standalone"` and suggests `node .next/standalone/server.js`. e2e passes, but it isn't testing the server the Dockerfile ships.
- `next/font/google` with `subsets: ["latin"]` still emits `@font-face` rules for Inter's other subsets (Cyrillic, Greek, Vietnamese). Only Latin is preloaded, and the others download only if such characters appear, so it's harmless, but it's more CSS than needed.
- `npm install` warns that `fsevents` has install scripts not covered by `allowScripts`.

## Acceptance evidence

- AC1: `src/styles/design-guide.test.ts` › "has a section on %s" (12 sections) and "covers the %s and its states" (button, text area, card, status and alert messages, spinner, loading placeholder, theme toggle).
- AC2: `src/styles/design-guide.test.ts` › "README links to docs/design.md" and "CLAUDE.md conventions say UI work follows the guide, and where tokens and components live".
- AC3: `src/styles/design-guide.test.ts` › "Tailwind runs through @tailwindcss/postcss" and "defines theme tokens only in tokens.css"; `e2e/design-system.spec.ts` › "Tailwind generates the stylesheet from the tokens".
- AC4: `e2e/design-system.spec.ts` › "the production stylesheet defines none of Tailwind's default colours" (seen failing with `--color-*: initial` removed).
- AC5: `src/styles/design-guide.test.ts` › "keeps globals.css to the imports and base element styles" and "no longer uses the hand-written page classes"; components in `src/components/ui/` covered by `ui.test.tsx` and `theme-toggle.test.tsx`.
- AC6: `src/styles/colour-literals.test.ts` › "catches %s" (CSS hex, short hex, Tailwind arbitrary value, inline style prop, rgba, SVG attribute, hsl, oklab) and "has no colour literal under src/ outside tokens.css and tests".
- AC7: `src/styles/contrast.test.ts` › "meet WCAG contrast in the light theme" / "in the dark theme", over the 23 pairs in the guide's Contrast pairs table (4.5:1 text, 3:1 non-text).
- AC8: `src/styles/token-sync.test.ts` › "documents every token the file defines", "defines every token the guide lists", "gives each colour token the same light and dark values in both".
- AC9: `e2e/design-system.spec.ts` › "the page renders in self-hosted Inter and only talks to its own origin" (a `.woff2` from `/_next/static/media/`, body font Inter, no other origin).
- AC10: `src/features/sentence-feedback/feedback-form.test.tsx` and `e2e/sentence-feedback.spec.ts` unchanged (`git diff main -- <both files>` is empty) and passing in `npm run verify`.
- AC11: `src/features/sentence-feedback/feedback-states.test.tsx` › "shows a spinner and a busy placeholder while checking, and drops both on a result", "drops the loading state when an error arrives"; e2e `design-system.spec.ts` › "while checking, the button shows a spinner and a busy placeholder holds the result area", "the loading state also goes when an error arrives".
- AC12: `feedback-states.test.tsx` › "strikes each wrong fragment in the danger colour…", "gives %s its own message and icon", "gives a failure an alert with an alert icon"; `ui.test.tsx` › "a %s message has role %s and a hidden %s icon"; e2e › "corrections strike the wrong fragment and show the correction in its own colour", "%s gets its own message with a hidden icon".
- AC13: `e2e/theme.spec.ts` › "with no saved theme, an OS set to light/dark gets the light/dark tokens", "changing the OS setting switches the theme without a reload".
- AC14: `e2e/theme.spec.ts` › "is a keyboard-operable radio group named Theme", "Dark and Light override the OS at once and survive a reload", "System goes back to following the OS"; `theme-toggle.test.tsx` › "is a radio group named Theme with System, Light and Dark", "applies a choice at once and checks it".
- AC15: `e2e/theme.spec.ts` › "a saved Dark choice applies before React loads" (JS chunks aborted, OS light, dark canvas); `theme-toggle.test.tsx` › "applies a saved Light or Dark choice to <html>".
- AC16: `e2e/theme.spec.ts` › "a throwing localStorage leaves the page on the OS theme, the toggle still works, and nothing is logged", "an unknown saved value leaves the page on the OS theme"; `theme-toggle.test.tsx` › "still switches the theme for the visit when storage throws", "treats an unknown saved value as System".
- AC17: `e2e/design-system.spec.ts` › "the result card and corrections rise in, one after another, and buttons respond to a press", "every duration and easing comes from the motion tokens and lasts at most 300 ms"; `src/styles/motion.test.ts` › "cap one-shot durations at 300 ms; only the spinner's turn is exempt" and "takes every duration and easing under src/ from the motion tokens". Spinner exemption per the logged user decision.
- AC18: `e2e/design-system.spec.ts` › "nothing moves, and the loading state still says Checking…".
- AC19: `e2e/layout.spec.ts` › "at 320/390/768/1280 px › nothing scrolls sideways and every control is fully visible", "at 1280 px › the content column is no wider than the guide's content width".
- AC20: `e2e/layout.spec.ts` › "at 320/390/768/1280 px › the submit button and each theme option are at least 44 × 44 px".
- AC21: `e2e/layout.spec.ts` › "tabbing shows a focus ring at least 2 px thick on each control in the light theme" / "dark theme".
- AC22: `e2e/accessibility.spec.ts` › "axe finds no WCAG 2.2 A or AA violations: <state>, <theme> theme" for empty, loading, corrected, correct, not Spanish and error, in light and dark (12 tests).

## Definition of Done

- [x] `npm run verify` passes (format, typecheck, lint, unit tests with coverage thresholds, production build, e2e), and its summary is pasted in the progress log.
- [x] If a prompt, an output schema or anything in `src/lib/llm/` changed, `npm run evals` meets the suite threshold and the summary is in the progress log. — N/A: no prompt, schema or `src/lib/llm/` changes.
- [x] Every acceptance criterion has evidence under "Acceptance evidence": the test that proves it, or the command and output for what a test can't show.
- [x] New behaviour was written test-first: each new test was seen failing before the code that makes it pass. — Unit tests were written first and seen failing. The e2e specs were written after the restyle, then seen failing against earlier commits in a temporary worktree (see log).
- [x] User-visible behaviour is covered by an e2e test, or the progress file says why not.
- [x] The diff serves this task's acceptance criteria and nothing else. Unrelated findings are listed under "Discovered", not fixed.
- [x] No test, assertion, lint rule or threshold was removed or loosened, and there is no new `eslint-disable`, `@ts-expect-error`, `.skip` or `.only`.
- [x] No new dependency, unless the task needed one and the user approved the install.
- [x] No secrets, API keys or `.env` contents in code, fixtures, logs or commits.
- [x] The `reviewer` subagent reviewed the diff against the spec, and every correctness gap it found is fixed or answered in the progress file.
- [x] Docs are updated wherever behaviour, commands or setup changed.
- [x] The work is committed on the task branch, with commit messages in the format in `CONTRIBUTING.md`.
- [x] The pull request title and body are drafted in the progress file and pass `npm run pr:check`.

## Pull request

feat(design): add a design system and restyle the home page (task 0005)

````markdown
## Task

0005 — tasks/0005-design-system.md (part 1 of 1)

## Summary

Adds a design system and restyles the home page with it, so every screen has one reference to follow.

- **Guide:** `docs/design.md` covers principles, colour, typography, spacing, shape, motion, icons, components and their states, theming, responsive behaviour, accessibility, and how to add a token or component.
- **Tokens:** Tailwind CSS v4 through `@tailwindcss/postcss`, with every token in `src/styles/tokens.css`. The default palette is switched off. Semantic colours are `light-dark()` pairs (slate neutrals, an indigo accent, emerald and rose), so components need no `dark:` variants.
- **Components:** `src/components/ui/` holds Button (with loading), TextArea, Card, Message (success, info, danger, with Lucide icons), Spinner, Skeleton and ThemeToggle. `globals.css` keeps only imports and base styles.
- **Theme:** follows the OS by default. A System/Light/Dark radio group saves the choice in `localStorage`, and an inline script applies it before React loads. Storage failures fall back to the OS.
- **Font:** Inter, self-hosted with `next/font/google`.
- **Guards:** unit tests fail on colour literals under `src/`, on WCAG contrast shortfalls for every pair the guide lists, on drift between the guide's token tables and `tokens.css`, and on durations or easings outside the motion tokens.

No copy, roles or accessible names changed. No prompt, schema, API or `src/lib/llm/` change, so no eval run.

New dependencies, as approved in the spec: `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `lucide-react`, `@axe-core/playwright`. Decision logged in the progress file: the 300 ms motion cap covers one-shot motion; the looping spinner uses its own `--duration-spin` token.

## Acceptance criteria

- AC1–AC2: `src/styles/design-guide.test.ts` (sections, component states, README and CLAUDE.md pointers).
- AC3, AC5: `design-guide.test.ts` (PostCSS plugin, tokens only in `tokens.css`, slim `globals.css`, old classes gone); e2e "Tailwind generates the stylesheet from the tokens".
- AC4: e2e "the production stylesheet defines none of Tailwind's default colours".
- AC6: `src/styles/colour-literals.test.ts` (fixtures for CSS, arbitrary value, inline style, SVG attribute; repo scan).
- AC7: `src/styles/contrast.test.ts` (23 documented pairs, both themes).
- AC8: `src/styles/token-sync.test.ts`.
- AC9: e2e "the page renders in self-hosted Inter and only talks to its own origin".
- AC10: `feedback-form.test.tsx` and `e2e/sentence-feedback.spec.ts` unchanged and passing.
- AC11–AC12: `feedback-states.test.tsx`, `ui.test.tsx`, and the e2e "states" tests.
- AC13–AC16: `e2e/theme.spec.ts` (OS following, live switch, keyboard radio group, persistence, before-React with JS blocked, broken storage) and `theme-toggle.test.tsx`.
- AC17–AC18: e2e "motion" and "reduced motion" tests; `src/styles/motion.test.ts`.
- AC19–AC21: `e2e/layout.spec.ts` at 320, 390, 768 and 1280 px.
- AC22: `e2e/accessibility.spec.ts`, axe in 6 states × 2 themes.

## Verification

```text
harness check --full:
  ✔ tasks (0.1s)
  ✔ format (2.1s)
  ✔ typecheck (2.9s)
  ✔ lint (4.7s)
  ✔ unit (9.6s)
  ✔ e2e (7.6s)

All checks passed.
```

The e2e specs were also run against earlier commits in a temporary worktree to confirm they fail without the feature. The reviewer subagent found one gap, the theme toggle's checked state below 3:1, which is fixed and now guarded by the contrast test.

## Discovered

- `playwright.config.ts` (human-owned) starts the app with `next start`, which warns that it doesn't work with `output: "standalone"`. e2e passes, but it doesn't test the server the Dockerfile ships.
- `next/font/google` with `subsets: ["latin"]` still emits `@font-face` rules for Inter's other subsets. Only Latin is preloaded, so it's harmless but more CSS than needed.
- `npm install` warns that `fsevents` has install scripts not covered by `allowScripts`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````
