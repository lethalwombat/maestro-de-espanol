---
task: "0005"
status: in-progress
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

## Discovered (out of scope)

- None yet.

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

## Definition of Done

(Filled in by /finish-task.)

## Pull request

(Drafted by /finish-task: the title, then the body in a fenced `markdown` block.)
