# Design system

Every screen in Maestro de Español follows this guide, so the app looks and behaves the same way everywhere and the learner's attention stays on their Spanish. The tokens live in [`src/styles/tokens.css`](../src/styles/tokens.css) and the shared components in [`src/components/ui/`](../src/components/ui/). Tests in [`src/styles/`](../src/styles/) read the tables below, so the guide and the code can't drift apart:

- `token-sync.test.ts` fails when a token is in the file but not in these tables, or the other way round, or when a colour's light or dark value differs.
- `contrast.test.ts` computes WCAG contrast for every pair in [Contrast pairs](#contrast-pairs), in both themes.
- `colour-literals.test.ts` fails when a colour literal (hex, `rgb()`, `hsl()`, `oklch()`, `oklab()`) appears under `src/` outside `tokens.css` and tests.

## Principles

- **The learner's Spanish comes first.** The page is calm and neutral: slate neutrals, one indigo accent and Inter. Colour carries meaning (success, danger, info) and is never decoration.
- **Words carry the meaning.** Icons and colour reinforce a message, but the text alone always says what happened.
- **Motion confirms, it doesn't perform.** A result arriving or a button being pressed gets a short, subtle response. Nothing loops except the spinner, and nothing moves at all when the learner asks for reduced motion.
- **Semantic tokens only.** Components use `bg-surface`, `text-fg-muted`, `bg-accent`, never a raw colour. A token's value changes per theme, so components need no `dark:` variants.
- **Accessible by default.** WCAG 2.2 AA is the floor: contrast, focus, target size and keyboard use are checked by tests, not by eye.

## Colour

Tailwind's default palette is switched off (`--color-*: initial`), so a class can only use these tokens. Each one is written `light-dark(<light>, <dark>)` in `tokens.css`. Values are hex, drawn from Tailwind's slate, indigo, emerald and rose scales.

| Token                    | Light     | Dark      | Use                                                  |
| ------------------------ | --------- | --------- | ---------------------------------------------------- |
| `--color-canvas`         | `#f8fafc` | `#020617` | Page background                                      |
| `--color-surface`        | `#ffffff` | `#0f172a` | Cards, the text area, the selected theme option      |
| `--color-surface-muted`  | `#f1f5f9` | `#1e293b` | The theme toggle's track, loading placeholders       |
| `--color-fg`             | `#0f172a` | `#f1f5f9` | Body text and headings                               |
| `--color-fg-muted`       | `#475569` | `#94a3b8` | Secondary text: the lede, explanations, placeholders |
| `--color-border`         | `#e2e8f0` | `#1e293b` | Decorative borders: cards and messages               |
| `--color-border-strong`  | `#64748b` | `#64748b` | Borders that identify a control: the text area       |
| `--color-accent`         | `#4f46e5` | `#818cf8` | The primary button                                   |
| `--color-accent-hover`   | `#4338ca` | `#a5b4fc` | The primary button on hover and press                |
| `--color-on-accent`      | `#ffffff` | `#020617` | Text and icons on the accent                         |
| `--color-ring`           | `#4f46e5` | `#818cf8` | Focus rings                                          |
| `--color-success`        | `#047857` | `#34d399` | Corrected fragments, the success icon                |
| `--color-success-subtle` | `#ecfdf5` | `#022c22` | Success message background                           |
| `--color-danger`         | `#be123c` | `#fb7185` | Wrong fragments, the alert icon                      |
| `--color-danger-subtle`  | `#fff1f2` | `#4c0519` | Alert message background                             |
| `--color-info`           | `#4338ca` | `#a5b4fc` | The info icon                                        |
| `--color-info-subtle`    | `#eef2ff` | `#1e1b4b` | Info message background                              |

### Contrast pairs

Each pair below is checked in both themes. Text needs 4.5:1 against every background it's used on (WCAG 1.4.3). Focus rings, control borders and icons that carry meaning need 3:1 against the colour next to them (WCAG 1.4.11). Add a row whenever a component puts a colour on a new background.

| Foreground              | Background               | Kind     | Where                                             |
| ----------------------- | ------------------------ | -------- | ------------------------------------------------- |
| `--color-fg`            | `--color-canvas`         | text     | Headings and body text on the page                |
| `--color-fg`            | `--color-surface`        | text     | Text in cards and the text area                   |
| `--color-fg`            | `--color-surface-muted`  | text     | Unselected theme option labels on hover           |
| `--color-fg`            | `--color-success-subtle` | text     | Success message text                              |
| `--color-fg`            | `--color-danger-subtle`  | text     | Alert message text                                |
| `--color-fg`            | `--color-info-subtle`    | text     | Info message text                                 |
| `--color-fg-muted`      | `--color-canvas`         | text     | The lede                                          |
| `--color-fg-muted`      | `--color-surface`        | text     | Explanations, text area placeholder               |
| `--color-fg-muted`      | `--color-surface-muted`  | text     | Unselected theme option labels                    |
| `--color-on-accent`     | `--color-accent`         | text     | Button label                                      |
| `--color-on-accent`     | `--color-accent-hover`   | text     | Button label on hover and press                   |
| `--color-success`       | `--color-surface`        | text     | Corrected fragments in the card                   |
| `--color-danger`        | `--color-surface`        | text     | Wrong fragments in the card                       |
| `--color-ring`          | `--color-canvas`         | non-text | Focus ring on the page                            |
| `--color-ring`          | `--color-surface`        | non-text | Focus ring on the selected theme option           |
| `--color-ring`          | `--color-surface-muted`  | non-text | Focus ring on the theme toggle's track            |
| `--color-border-strong` | `--color-surface`        | non-text | Text area border against its fill                 |
| `--color-border-strong` | `--color-canvas`         | non-text | Text area border against the page                 |
| `--color-border-strong` | `--color-surface-muted`  | non-text | The checked theme option's edge against the track |
| `--color-accent`        | `--color-canvas`         | non-text | The button's edge against the page                |
| `--color-success`       | `--color-success-subtle` | non-text | Success icon                                      |
| `--color-danger`        | `--color-danger-subtle`  | non-text | Alert icon                                        |
| `--color-info`          | `--color-info-subtle`    | non-text | Info icon                                         |

## Typography

Inter is the only typeface. `next/font/google` self-hosts the variable font (the `latin` subset, which covers á é í ó ú ü ñ ¿ ¡) from `/_next/static/media/`, so the browser never contacts Google. It sets `--font-inter` on `<html>`.

| Token                      | Value                                                     | Use                               |
| -------------------------- | --------------------------------------------------------- | --------------------------------- |
| `--font-sans`              | `var(--font-inter), ui-sans-serif, system-ui, sans-serif` | Everything                        |
| `--text-sm`                | `0.875rem`                                                | Theme options, explanations       |
| `--text-sm--line-height`   | `1.5`                                                     |                                   |
| `--text-base`              | `1rem`                                                    | Body text, form controls, buttons |
| `--text-base--line-height` | `1.6`                                                     |                                   |
| `--text-lg`                | `1.125rem`                                                | The lede, the corrected sentence  |
| `--text-lg--line-height`   | `1.6`                                                     |                                   |
| `--text-3xl`               | `1.875rem`                                                | The page heading                  |
| `--text-3xl--line-height`  | `1.2`                                                     |                                   |

Weights: 400 for body text, 500 for labels and controls, 600 for the corrected sentence and corrections, 700 for the page heading. Text never goes below `text-sm`.

## Spacing and layout

Spacing follows Tailwind's 4 px scale (`p-4` is 1rem). Use steps from 1 to 12, preferring 2, 3, 4, 6, 8 and 12. The content sits in one centred column no wider than `max-w-content`, with `px-4` gutters on phones and `px-6` from `sm` up.

| Token                 | Value     | Use                                                  |
| --------------------- | --------- | ---------------------------------------------------- |
| `--spacing`           | `0.25rem` | The base step of every margin, padding and gap       |
| `--container-content` | `40rem`   | The content column's maximum width (`max-w-content`) |

## Shape and elevation

Corners are gently rounded: `rounded-md` for controls, `rounded-lg` for cards and messages, `rounded-sm` for theme options inside their track. Elevation is quiet: cards get `shadow-sm` and a border, and only the selected theme option gets `shadow-md`. On the dark theme shadows mostly disappear, so borders carry the edge.

| Token         | Value                                                                    | Use                              |
| ------------- | ------------------------------------------------------------------------ | -------------------------------- |
| `--radius-sm` | `0.375rem`                                                               | Theme options                    |
| `--radius-md` | `0.5rem`                                                                 | Buttons, the text area           |
| `--radius-lg` | `0.75rem`                                                                | Cards, messages, the theme track |
| `--shadow-sm` | `0 1px 2px 0 rgb(15 23 42 / 0.06)`                                       | Cards                            |
| `--shadow-md` | `0 1px 3px 0 rgb(15 23 42 / 0.08), 0 4px 12px -2px rgb(15 23 42 / 0.08)` | The selected theme option        |

## Motion

Motion confirms that something happened and otherwise stays out of the way.

- The result card fades and rises into place (`animate-rise`).
- Corrections rise one after another, each delayed by `--delay-stagger` times its position.
- Buttons and theme options respond to a press with a slight scale (`active:scale-[0.98]`) and fade colours on hover, over `--duration-fast` with `--ease-out`.
- The spinner is the only motion that loops.

Every duration and easing comes from these tokens: write `duration-(--duration-fast)` and `ease-(--ease-out)`, never a number. One-shot motion lasts at most 300 ms. The spinner's turn, `--duration-spin`, is the one exception, because a full turn every 300 ms looks frantic. With `prefers-reduced-motion: reduce`, `globals.css` switches off every animation and transition, and the loading state still says "Checking…".

| Token             | Value                                            | Use                                           |
| ----------------- | ------------------------------------------------ | --------------------------------------------- |
| `--duration-fast` | `120ms`                                          | Hover and press feedback                      |
| `--duration-base` | `200ms`                                          | Colour and theme changes                      |
| `--duration-slow` | `300ms`                                          | The result card and corrections entering      |
| `--duration-spin` | `800ms`                                          | One turn of the spinner (exempt from the cap) |
| `--delay-stagger` | `60ms`                                           | The gap between corrections entering          |
| `--ease-out`      | `cubic-bezier(0.2, 0, 0, 1)`                     | Anything entering or responding to input      |
| `--ease-in-out`   | `cubic-bezier(0.4, 0, 0.2, 1)`                   | Anything moving between two resting states    |
| `--animate-rise`  | `rise var(--duration-slow) var(--ease-out) both` | Fade and rise into place                      |
| `--animate-spin`  | `spin var(--duration-spin) linear infinite`      | The spinner                                   |

## Iconography

Icons come from [Lucide](https://lucide.dev) (`lucide-react`): 20 px (`size-5`) in messages and the theme toggle, 16 px (`size-4`) inside buttons, with the default 2 px stroke. An icon always sits next to words that say the same thing, so every icon is `aria-hidden="true"` and is never the only way to tell what happened. An icon that carries meaning (success, danger, info) takes that colour and needs 3:1 against its background.

| Meaning | Icon          |
| ------- | ------------- |
| Success | `CircleCheck` |
| Info    | `Info`        |
| Alert   | `CircleAlert` |
| System  | `Monitor`     |
| Light   | `Sun`         |
| Dark    | `Moon`        |

## Components

Shared components live in `src/components/ui/`, one per file, styled with utility classes. A feature composes them and adds no colours of its own.

### Button

`<Button>`: the primary action. Accent fill, `text-on-accent`, `rounded-md`, at least 44 × 44 px.

- **Default:** `bg-accent`, medium weight.
- **Hover:** `bg-accent-hover`, over `--duration-fast`.
- **Focus-visible:** a 2 px `--color-ring` outline, offset 2 px.
- **Active:** `bg-accent-hover` and `scale-[0.98]`.
- **Disabled:** 50% opacity, `cursor-not-allowed`, no hover change. A disabled button isn't focusable.
- **Loading:** pass `loading`. The button is disabled and shows a spinner before its label ("Checking…"); the spinner is hidden from assistive technology, so the label is the accessible name.

### Text area

`<TextArea>`: multi-line input, full width, `bg-surface`, `border-border-strong`, `rounded-md`, `text-base`. It always has a visible `<label>`.

- **Default:** a 1 px `--color-border-strong` border; the placeholder uses `--color-fg-muted`.
- **Hover:** the border darkens towards `--color-fg-muted`.
- **Focus-visible:** a 2 px `--color-ring` outline, offset 2 px. A text area shows it on any focus, as browsers do.
- **Disabled:** 50% opacity, `cursor-not-allowed`.

### Card

`<Card>`: a container for a result. `bg-surface`, a `--color-border` border, `rounded-lg`, `shadow-sm`, `p-4` (`sm:p-5`).

- **Default:** static, not interactive.
- An entering card can take `animate-rise`.

### Status and alert messages

`<Message tone="success" | "info" | "danger">`: a short message with an icon. Subtle tone background, a `--color-border` border, `rounded-lg`, text in `--color-fg`, the icon in the tone's colour.

- **Default:** `success` (`CircleCheck`) for a correct sentence and `info` (`Info`) for text that isn't Spanish, both with `role="status"`. `danger` (`CircleAlert`) for a failure, with `role="alert"`.
- The words say what happened; the icon is `aria-hidden`.

### Spinner

`<Spinner>`: a 16 px ring that turns with `animate-spin`, in `currentColor`.

- **Default:** turning, `aria-hidden`. It never stands alone: the text next to it says what is loading.
- With reduced motion it stops, and the text still says "Checking…".

### Loading placeholder

`<Skeleton>`: a card-shaped placeholder that holds the result area while a check is in flight, with `aria-busy="true"`. Bars of `bg-surface-muted` stand in for lines of text.

- **Default:** static (no shimmer: the spinner is the only looping motion).
- It goes as soon as the result or an error arrives.

### Theme toggle

`<ThemeToggle>`: a radio group named "Theme" with System, Light and Dark options, each an icon and a word. Native radio inputs, so arrow keys move between options. Each option is at least 44 × 44 px. The track is `bg-surface-muted`, `rounded-lg`.

- **Default:** unselected options are transparent, with `--color-fg-muted` labels.
- **Hover:** the label turns `--color-fg`.
- **Focus-visible:** a 2 px `--color-ring` outline on the focused option, offset 2 px.
- **Active:** `scale-[0.98]` while pressed.
- **Checked:** `bg-surface`, `--color-fg` label, `shadow-md`, and a 1 px `--color-border-strong` ring. The ring is what reaches 3:1 against the track (WCAG 1.4.11); the fill alone doesn't.

## Theming

The app has a light and a dark theme, and every colour token holds both values. `color-scheme` decides which one applies:

- **System** (the default, and when nothing valid is saved): `:root { color-scheme: light dark }` follows the OS, live, with no JavaScript.
- **Light or Dark:** `<html data-theme="light">` or `data-theme="dark"` forces one.

The choice is saved in `localStorage` under `theme`. An inline script in the root layout's `<head>` applies a saved choice before React loads, so there's no flash of the wrong theme, and `<html>` carries `suppressHydrationWarning` because that script changes it before hydration. If `localStorage` throws or holds an unknown value, the page follows the OS and the toggle still works for the rest of the visit. The choice isn't synced across tabs or devices.

## Responsive behaviour

The layout is one column, designed for 320 px first and checked at 320, 390, 768 and 1280 px.

- The page never scrolls horizontally, and the text area, button and theme control are always fully visible.
- The header wraps: the theme toggle drops below the heading on narrow screens and sits beside it from `sm` up.
- From `sm` up, gutters and card padding grow a step. The content column stops at `max-w-content`.
- Touch targets are at least 44 × 44 CSS px at every width.

## Accessibility

- WCAG 2.2 A and AA. axe (`@axe-core/playwright`) scans the home page in every state, in both themes, in e2e.
- Contrast: see [Contrast pairs](#contrast-pairs).
- Focus: every control shows a focus ring at least 2 px thick, in `--color-ring`, in both themes. Never remove an outline without replacing it.
- Targets: buttons and theme options are at least 44 × 44 CSS px.
- Keyboard: everything works with Tab, Shift+Tab, arrow keys (in the theme toggle), Space and Enter.
- Meaning never rests on colour or an icon alone. Struck-through text (`<del>`) and inserted text (`<ins>`) mark wrong and corrected fragments, as well as colour.
- Status updates use `role="status"`, failures `role="alert"`, and loading regions `aria-busy="true"`.
- Reduced motion switches off all animation and transition.

## Adding a token or a component

**A token.**

1. Check that an existing token can't do the job. Prefer a semantic name (`--color-warning`) over a scale name (`--color-amber-600`).
2. Add it to the `@theme` block in `src/styles/tokens.css`. Write colours as `light-dark(<light>, <dark>)` in hex.
3. Add a row to the matching table in this guide, with the same values. `token-sync.test.ts` fails until you do.
4. For a colour, add a row to [Contrast pairs](#contrast-pairs) for every background it will sit on, and run `npx vitest run src/styles`.

**A component.**

1. Add it to `src/components/ui/`, styled with utility classes on semantic tokens only: no colour literals, no `dark:` variants, no durations or easings outside the motion tokens.
2. Give it a test beside it, querying by role, label or visible text.
3. Add a `###` section under [Components](#components) with each state that applies (default, hover, focus-visible, active, disabled, loading).
4. If it's interactive, check focus ring, target size and keyboard use, and cover it in the e2e axe scan.
