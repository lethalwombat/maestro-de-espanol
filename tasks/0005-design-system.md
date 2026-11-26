---
id: "0005"
title: Add a design system and restyle the home page with it
---

## Objective

Front-end work has one reference to follow, so every screen looks and behaves the same way and the learner's attention stays on their Spanish. `docs/design.md` sets out the design code: colour, type, spacing, shape, motion, icons, components, theming, responsive behaviour and accessibility. The tokens it describes live in code, tests keep code and guide in step and catch drift, and the existing home page is restyled to the guide on phones, tablets and desktops, in light and dark themes. The look is calm and neutral (slate neutrals, one indigo accent, Inter). Motion confirms what happened and never competes with the feedback.

## Acceptance criteria

- AC1: `docs/design.md` has a section for each of: principles; colour; typography; spacing and layout; shape and elevation; motion; iconography; components; theming; responsive behaviour; accessibility; and how to add a token or a component. The components section covers the button, text area, card, status and alert messages, spinner, loading placeholder and theme toggle, each with the states that apply to it (default, hover, focus-visible, active, disabled, loading).
- AC2: `README.md` links to `docs/design.md`. The Conventions in `CLAUDE.md` say that UI work follows it, and that tokens live in `src/styles/tokens.css` and shared components in `src/components/ui/`.
- AC3: Tailwind CSS v4, through `@tailwindcss/postcss`, generates the app's styles. Every token the design system adds or overrides (semantic colours for light and dark, font family, type scale, radii, shadows, motion durations and easings, content width) is defined in one file, `src/styles/tokens.css`.
- AC4: Tailwind's default colour palette is switched off. The production stylesheet defines none of its colours (for example, no `--color-indigo-600` or `--color-red-500`), so classes can only use the semantic colour tokens.
- AC5: `src/app/globals.css` holds only the Tailwind and token imports and base element styles. The page and form are built from shared components in `src/components/ui/` styled with utility classes, and the old hand-written classes (`.page`, `.lede`, `.result`, `.explanation`, `.error`) are gone.
- AC6: A unit test fails when a colour literal (hex, `rgb()`, `hsl()`, `oklch()`, `oklab()`) appears under `src/` outside `src/styles/tokens.css` and test files. That covers a CSS file, a Tailwind arbitrary value such as `bg-[#4f46e5]`, an inline `style` prop and an SVG attribute in TSX. Fixtures show it catching each of these, and it passes on the repo.
- AC7: A unit test computes WCAG contrast from the colour tokens of both themes. It fails when a pair documented in the guide falls short: 4.5:1 for text on each background it's used on, and 3:1 for the focus ring, form-control borders and icons that carry meaning, against the colour next to them. It passes on the shipped tokens.
- AC8: A unit test fails when a token defined in `src/styles/tokens.css` is missing from the token tables in `docs/design.md`, when the guide lists a token the file doesn't define, or when a colour token's light or dark value differs between the two.
- AC9: The UI renders in Inter, self-hosted with `next/font/google`. Loading the home page fetches an Inter font file from the app's own `/_next/static/media/`, the body's computed font is Inter, and no request goes to any origin other than the app's.
- AC10: The restyle changes no copy, roles or accessible names. Every existing test in `src/features/sentence-feedback/feedback-form.test.tsx` and `e2e/sentence-feedback.spec.ts` passes with no change to its code.
- AC11: While a check is in flight, the submit button is disabled and shows a spinner next to "Checking…", and a placeholder card in the result area has `aria-busy="true"`. Both go as soon as the result or an error arrives.
- AC12: Each outcome has its own look. Corrections appear in a card, with each wrong fragment struck through in the danger colour and its correction in the success colour. A correct sentence gets a success message with a check icon, text that isn't Spanish gets an info message with an info icon, and a failure gets an alert with an alert icon. The icons are Lucide icons hidden from assistive technology (`aria-hidden`), and the words alone still say what happened.
- AC13: With no saved theme, or System chosen, the page follows the OS. Emulating `prefers-color-scheme: dark` renders the dark tokens and `light` renders the light ones, and changing the setting while the page is open switches the theme without a reload.
- AC14: The page header has a theme control: a radio group named "Theme" with System, Light and Dark options, operable by keyboard. Choosing Light or Dark applies it at once, whatever the OS setting, and after a reload the same option is checked and applied. Choosing System goes back to following the OS.
- AC15: A saved Light or Dark choice is applied before React loads. With the app's JavaScript bundles blocked, a page whose saved choice is Dark, on an OS set to light, still renders with the dark tokens.
- AC16: If `localStorage` throws or holds an unknown value, the page follows the OS, the toggle still switches the theme for the rest of the visit, and no error reaches the console.
- AC17: The result card fades and rises into place, the corrections follow one after another, and buttons respond when pressed. Every duration and easing comes from the motion tokens, and none lasts longer than 300 ms.
- AC18: With `prefers-reduced-motion: reduce`, nothing moves. The result card, corrections, buttons and spinner have no running animation or transition, and the loading state still says "Checking…".
- AC19: At viewport widths of 320, 390, 768 and 1280 px, the page doesn't scroll horizontally and the text area, button and theme control are fully visible. At 1280 px the content column is no wider than the guide's content width.
- AC20: At each of those widths, the submit button and each theme option measure at least 44 × 44 CSS px.
- AC21: Tabbing through the page shows a focus ring at least 2 px thick on each control, in both themes.
- AC22: axe (`@axe-core/playwright`) finds no WCAG 2.2 A or AA violations on the home page in each state (empty, loading, corrected, correct, not Spanish, error), in both the light and the dark theme.

## Out of scope

- A living style guide: a `/design` route, Storybook or a published design board.
- Class-order sorting (`prettier-plugin-tailwindcss`) and Tailwind lint rules. They would change the human-owned `.prettierrc.json` and `eslint.config.mjs`, so if you want them, you add them.
- Screenshot or visual-regression tests. Rendering differs between macOS and CI's Linux, so the baselines would flake.
- New pages, navigation, features or copy, and any change to the prompt, the output schema, the API or `src/lib/llm/`. Because none of these change, no eval run is needed.
- A logo, brand mark, favicon, app icons, web manifest or social preview images.
- A component library or class helpers: shadcn/ui, Radix, Headless UI, clsx, tailwind-merge, cva.
- Syncing the theme choice across tabs or devices, or keeping it in a cookie or on the server.
- Celebration effects, sound, illustrations or decorative animation.
- Browsers other than Chromium, and testing on real devices. `playwright.config.ts` is human-owned and runs Desktop Chrome only, so phone and tablet widths are emulated by viewport.
- Translating the UI, and right-to-left layouts.

## Notes

- Decisions from the interview on 2026-11-26:
  - Scope: the guide, the tokens and a restyle of the existing page, so the guide is proven against real UI.
  - Styling: Tailwind CSS v4, with tokens in `@theme`. Components use semantic tokens (`bg-surface`, `text-muted`, `bg-accent`) whose values change per theme, so they need no `dark:` variants.
  - Look: calm and neutral. Slate neutrals, an indigo accent, emerald for success and corrected fragments, and rose for danger and wrong fragments. Inter (variable, `latin` subset, which covers á é í ó ú ü ñ ¿ ¡) for everything.
  - Theme: follows the OS, plus a manual toggle that remembers the choice in `localStorage`. The three-way System/Light/Dark control is an assumption made while writing the spec: it's the usual pattern, and it keeps a way back to following the OS.
  - Lucide icons, an axe scan in e2e, and unit tests for colour literals, contrast and guide/token sync.
- New dependencies, chosen in the interview: `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `lucide-react` and `@axe-core/playwright`. Each install still asks for approval.
- Motion is subtle and functional. It confirms that something happened (a result arrived, a button was pressed) and otherwise stays out of the way. The spinner is the only motion that loops.
- `postcss.config.mjs` isn't a protected path, so it can be added in this task. `package-lock.json` is protected and changes only through the approved `npm install`.
- Tailwind v4 ships native binaries as optional dependencies. CI's `npm ci` and production build on Ubuntu show, before merge, that the lockfile carries the Linux binaries. The Docker build runs the same `npm ci`. Docker isn't installed locally.
- `next/font/google` downloads Inter at build time, so `next build` needs network access to Google Fonts locally, in CI and in the Docker build. Browsers never contact Google.
- e2e at phone and tablet widths sets the viewport with `test.use({ viewport })` in the spec file. The loading state can be held for the axe scan by delaying `/api/feedback` with `page.route`.
- One way to prove AC15: route `/_next/static/chunks/**` to abort, so only the inline script in the root layout's `<head>` can apply the theme. `<html>` then needs `suppressHydrationWarning`, because the script changes its attributes before React hydrates.
- Read the guides in `node_modules/next/dist/docs/` on fonts, scripts and CSS before writing code (AGENTS.md).
- Task 0001 left "visual design beyond a clean, readable default" out of scope. This task picks it up.
