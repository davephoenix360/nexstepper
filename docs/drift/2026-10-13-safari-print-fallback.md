# Safari / iOS print fallback — drift memo (2026-10-13)

## What shipped

Branch `fix/safari-print-fallback`. No migration. No infra change.
Pure client-side UX:

- `lib/print/detect-safari.ts` — pure UA-sniffing helpers,
  injected `BrowserProbe` keeps the suite environment-agnostic.
  Honours iPadOS 13+ Mac-disguise via
  `navigator.maxTouchPoints > 0`.
- `lib/print/safe-print.ts` — `triggerPrint()` calls
  `window.print()` synchronously, catches exceptions, returns
  a `PrintResult` union tagged with `'safari-ios' | 'safari-mac' | 'other'`.
  `getPrintHint(probe)` returns a branch-specific hint or `null`.
- `components/print/print-help-dialog.tsx` — a `Dialog` (built on
  the existing native-`<dialog>`-based `components/ui/dialog.tsx`)
  that renders the hint's steps plus a permanent
  `Cmd+P / Ctrl+P` keyboard-shortcut fallback. A tiny
  `<PrintHelpTrigger>` renders the "Not opening?" link inline next
  to the toolbar Print button.
- `app/(dashboard)/dashboard/resumes/[id]/print-button.tsx` —
  wires the help trigger; button itself still calls
  `window.print()` synchronously inside the click handler (the
  existing and correct path).
- `components/editable/editable-resume.tsx` — the in-editor
  "Print / Save as PDF" button now also goes through
  `triggerPrint()`, so both call sites share one safe-print code
  path with the future-attribution union intact.
- 54 new tests: `detect-safari.test.ts` (26),
  `safe-print.test.ts` (14), `print-help-dialog.test.tsx` (10),
  `print-button.test.tsx` (4). Total: **1613 passing**.

## What this memo is documenting

A first-time Apple-using customer reported "I clicked Print and
nothing happened." Investigation found Safari *did* open the
system print sheet, but on iPhone it appears as a small toolbar
at the bottom of the screen — easy to miss on a first attempt,
especially if the user's habit is the desktop-style modal that's
universal everywhere else.

The print call itself was already correct: `window.print()`
fires synchronously inside the click handler. Per Apple's
documented Safari behaviour, that *is* the user-activation
context that Safari needs; the call is fine. The defect was
zero contextual help, so the user had no way to know where
Safari was rendering the sheet.

## Why a new branch and not the `fix/print-page-break-quality` chain

The two existing print branches (`fix/print-page-break-quality`,
`fix/design-lab-and-page-settings`) are about output quality —
page breaks, margins, font sizes, section spacing. The Safari
fallback is about *finding the dialog*, which is unrelated to
output quality and would have been confusing to land in the same
branch.

## Why we don't gate behaviour on UA sniffing (just copy)

UA sniffing is brittle by design:

- iPadOS 13+ deliberately returns a Macintosh UA to defeat UA
  fingerprinting.
- Chromium flags Safari as "Safari" because the WebKit engine
  is in play.
- Future iOS versions will keep evolving.

If we gated behaviour on UA sniffing (e.g. "only call
`window.print()` on Safari" or "skip the dialog on iPhone"), a
wrong classification would silently break something real on the
next iOS release. Instead, we use the probe *informational only*
— the same `triggerPrint()` runs on every browser; the platform-
specific *copy* appears next to the button on Apple branches.

A wrong hint costs a sentence of extra text. Gating on UA would
silently break something on the next iOS version.

## Honest dev note on the way there

The first cut of the dialog bound its "Try again" button to
`window.print()` directly. That meant a future contributor who
wanted to add analytics on print failures would need to patch
*two* places (the toolbar PrintButton + the dialog's retry
button), and a second contributor could land only one. We routed
the retry button through `triggerPrint()` for the same reason
the toolbar does — one print call site = one place to fix. The
test pins that wiring at the source level so a refactor that
moves it back to `window.print()` fails the suite.

## Acceptance evidence

- `pnpm test` → 1613 passed (53.06s).
- `pnpm typecheck` → clean.
- `pnpm build` → compiled + 25/25 static pages generated.

The new tests run identically on Windows, Mac, and Linux because
they accept an injected `BrowserProbe` — verified by running the
detection suite on a Windows runner and seeing the iPhone test
return `true` for the iPhone UA.
