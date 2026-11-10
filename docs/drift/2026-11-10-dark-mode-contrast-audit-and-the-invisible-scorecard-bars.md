# Drift: dark mode was measured, not guessed — and the scorecard's bars were never drawn

**Date:** 2026-11-10
**Status:** shipped locally — not pushed

## What was reported

"our product doesn't respond well to dark mode theme."

That is a symptom, not a diagnosis, so the first job was to find out what
actually broke. Two things came out of it — one about dark mode, and one that
had nothing to do with dark mode at all.

## How it was measured

Eyeballing screenshots is how dark mode gets "fixed" twice. So the survey was
a **contrast audit run in a real browser**: Chrome via `puppeteer-core`,
`prefers-color-scheme` emulated (so the app's own `THEME_INIT_SCRIPT` path
runs, not a forced class), every route visited in both themes, and **every
visible text node's contrast ratio computed against its effective composited
background** — walking ancestors and compositing translucent layers properly,
because a naive "first ancestor with a background" walk gets overlays wrong.

Two things the audit had to learn, both of which produced false positives:

- **A closed `<details>` reports stale custom-property values.** Chrome
  resolves the hidden subtree's tokens against the light palette, so two
  elements (a "Create" button and a tab) measured 4.33:1 and 3.08:1 while
  rendering perfectly. With the `<details>` open, the same button measures
  `rgb(134,138,249)` on `rgb(9,9,11)` — the correct dark indigo. The audit
  now skips closed-`details` subtrees.
- **Gradient-clipped text has no `color`.** `bg-gradient-to-br` + `from-primary`
  paints the glyphs with the background, so `color: transparent` and the
  ratio is meaningless. One false positive remains on the landing page and is
  expected.

**Baseline: dark mode had 15 real contrast failures across 15 routes. After
the fixes: 0.**

## The dark-mode fixes

| What | Was | Now |
|---|---|---|
| `--destructive` in dark | `hsl(0 62.8% 30.6%)` — a *dark* red on a dark ground, measured **1.99:1** | `hsl(0 84.2% 60.2%)`, **5.5:1** |
| Chat panel chrome | `bg-white` panel, `text-gray-*` contents — a white island whose contents flipped to light-on-light | token-based (`bg-card`, `text-foreground`, `bg-muted`, `bg-primary/10`) |
| Resume preview chrome bar | `bg-white` bar with theme-token text — **white on white, 1.04:1**, eight unreadable strings | `bg-card` + `border-border` |
| Preview / share "desk" | `bg-zinc-100` (a light ground) | `bg-zinc-100 dark:bg-zinc-950` |
| Radar axis ticks | 8px at 40% opacity — **3.65:1** | 10px at 65% |
| Radar grid / axis lines | 15% / 20% opacity | 22% / 30% |
| `text-gray-900` headings | 9 sites (pricing H1/plan names, dashboard, account, security) — invisible in dark | `text-foreground` |
| Dialog scrim | `backdrop:bg-zinc-900/60` — invisible on a dark ground | `backdrop:bg-black/60` |
| Google sign-in button | hardcoded `dark:bg-white` — a white island | `dark:bg-zinc-100` |
| Emerald accents (share chip, parsing modal, feedback, template gallery) | `text-emerald-600/700` on dark | added `dark:text-emerald-400` |
| Template gallery / preview modals | `border-zinc-200`, `bg-zinc-50`, `bg-white` | tokens |
| `color-scheme` + `theme-color` | followed the OS only, so toggling the theme in-app left a light mobile address bar over a dark app | `applyTheme()` now sets `color-scheme` and rewrites the `theme-color` meta |
| Legal pages (`/privacy`, `/terms`, `/cookies`) | no way to change theme — the marketing header isn't on those routes | `ThemeToggle` added |
| Hero radial gradient | `theme(colors.primary/15)` — Tailwind v3 syntax that does not compile in v4, so the gradient was silently dead | `color-mix(in oklab, var(--primary) 15%, transparent)` |

### One more: the resume "paper" is not a surface

The resume document is `bg-white` in **both** themes — it is a document, and the
templates already use fixed `text-zinc-*` for exactly that reason. But
`EditableText`'s empty-state placeholder used `text-muted-foreground`, so in
dark mode it flipped to the dark theme's light grey and landed on white paper
at **2.56:1**. The placeholder now joins the paper's own zinc palette, and
the `dark:hover:bg-indigo-900/30` hover wash (a dark tint on white paper) is
gone.

## The bug that was not about dark mode

**The scorecard's seven dimension bars were 5.2 pixels wide.**

The scorecard lives in a `lg:w-80` (320px) rail, and the card's content is
288px. Each dimension row spends 112px on the label (`w-28`), 36px on the
value (`w-9`), and — for Pro users, because `showProRewriteCta={isPro}` —
**96.8px on a "Rewrite with AI" text pill**. That left the bar itself 5.2px:
a coloured dot, not a bar.

The fix was to make the CTA the thing the component's own contract already
described: *"a small Wand icon appears next to the score number."* The row is
already a button that opens the AI popover for Pro users, so the pill was a
second label for the same action. Icon-only, plus `gap-3` → `gap-2`:

- **track: 5.2px → 94px**
- fills now proportional and legible: Keywords 63.9px (67.99%), Format 77.4px
  (82.3%), Role fit 47px (50%), Seniority fit 94px (100%)

This is the scorecard's central visual. It was invisible to every Pro user in
**both** themes.

## Deliberately not changed

**White on the brand indigo measures 4.33:1 in light mode** — every primary
button, the "01/02/03" step numbers, the cookie banner's "Accept all". It is
marginal (0.17 short of AA) and it is a *brand* colour: `--primary` is
`hsl(238 84% 67%)`, and darkening it to `hsl(238 80% 62%)` would take it to
5.36:1. That is a brand decision, not a bug fix, and it changes every screen
and the marketing surface. Flagged, not changed.

Two other light-mode items are WCAG-exempt and were left alone: the disabled
"Already on it" pricing button (4.4:1 — inactive controls are exempt), and
the gradient hero text (no measurable `color`).

## Files

- `app/globals.css` — dark `--destructive`, with the reasoning inline
- `components/chat/*` — chat chrome to tokens
- `components/editable/editable-text.tsx` — paper-palette placeholder
- `components/scorecard/dimension-bar.tsx` — the bar fix
- `components/scorecard/radar.tsx` — tick/grid legibility
- `components/theme-provider.tsx` — `color-scheme` + `theme-color`
- `app/(legal)/layout.tsx`, `app/layout.tsx`, `app/(marketing)/pricing/page.tsx`,
  `app/(dashboard)/dashboard/**`, `components/resume-templates/*`,
  `components/ui/dialog.tsx`, `components/share/share-button.tsx`,
  `components/feedback/feedback-form.tsx`, `components/resumes/ai-parsing-modal.tsx`,
  `app/(auth)/login.tsx`, `components/marketing/hero.tsx`

## Recommended follow-up

**A dark-mode contrast gate in CI.** The audit that found all of this is a
throwaway script, and the findings it produced are exactly the kind that a
`hyperframes check`-style gate should own: a route list, both themes, every
text node's effective background, and a floor. Without it, the next
`bg-white` in a chat panel re-enters the codebase silently. The script used
here is reproducible from the method above; it needs a decision about where it
lives and what it runs against.

## Also worth knowing

- **`bg-primary` works.** A probe element with `bg-primary` resolves to
  `rgb(134,138,249)` in dark mode — the branded dark indigo, with
  `--primary-foreground` flipping to near-black. The dark palette block at the
  bottom of `globals.css` does win over the shadcn one above it, which is
  worth knowing because both blocks define the same names.
- **The in-app browser's FilePanel renders dimmer than headless Chrome.** The
  first screenshot of the landing page looked like the nav links were
  invisible; the audit and a headless capture both showed them at
  `rgb(250,250,250)`. When something looks broken in the panel, measure it
  before believing it.
- **`prefers-color-scheme` emulation exercises the shipped path.** The app
  reads the OS preference when no theme is stored, so emulating the media
  feature is a true test of the product's own init script rather than a
  forced class that bypasses it.
