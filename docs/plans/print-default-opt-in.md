# Print isolation (default opt-in) — Plan

> Plan template: [`AGENTS.md`](../../AGENTS.md) §Planning discipline.
> Branch: `feat/ai-retry-hardening` (continuing the current branch). Commit footer: `Plan: docs/plans/print-default-opt-in.md`.

## The problem

The "Pro is launching soon" banner leaks into the user's resume PDF
when they hit "Download PDF". Root cause: the dashboard layout
(`ProLaunchingSoonBanner` + sidebar + mobile top bar) wraps the
preview route, and nothing strips that chrome out of the print
output. The preview route's local chrome bar already has
`className="no-print"`, but the dashboard chrome doesn't.

The same class of bug will keep recurring as we add new dashboard
chrome (tooltips, banners, modals that escape into the print context,
chat bubble, etc.). Forgetting `no-print` on any one element silently
leaks it into the user's PDF.

## The user's suggested fix (the right one)

Flip the default. In a page that opts into print isolation, EVERYTHING
is hidden by default and only `.printable` subtrees show. This is the
inverse of the current pattern — instead of every UI element opting
out of print, only the resume content opts IN.

The result: forgetting a class on a banner / button / sidebar is
*safe* (the element is hidden by default). Forgetting a class on the
resume template is *loud* (the user sees a blank PDF — they'll tell
us in a support ticket before we ship a Slack screenshot to a
recruiter).

## Scope (in)

- **Opt-in, scoped CSS in `globals.css`.** A page declares itself a
  print-isolated context by adding `.printable-root` to its outermost
  wrapper. Inside that subtree:
    - everything is `visibility: hidden` (preserves layout flow for
      the printable subtree to position itself)
    - `.printable` and its descendants are `visibility: visible`
    - `.printable` itself is repositioned to `position: absolute;
      left: 0; top: 0; width: 100%` so it doesn't carry the
      surrounding layout's margins / sidebar widths

  This is per-page opt-in (not global). Pages that don't add
  `.printable-root` keep the current behavior — Ctrl+P on the
  dashboard list, for example, still prints the list cards. That
  matters because the dashboard has pages with legitimate print
  content (the cards, the scorecard) and pages where the user
  probably just wants to print what they see.
- **Mark the preview page** (`app/(dashboard)/dashboard/resumes/[id]/preview/page.tsx`)
  as the first `.printable-root` consumer. Wrap the `<Template />`
  in `.printable`.
- **Defense in depth on the dashboard chrome.** Even outside a
  `.printable-root` context, the Pro banner + sidebar + mobile top
  bar shouldn't print — they wrap every dashboard page. Add
  `className="no-print"` to each so they stay out of Ctrl+P output
  on every page, not just the preview route.
- **One small test** verifying the CSS rule is present in globals.css
  (we can't easily test browser print rendering in jsdom).

## Scope (out — parked)

- **Apply `.printable-root` to other dashboard pages** (resume list,
  scorecard, billing card, etc.) — these pages have legitimate
  print content and aren't part of the user's complaint. If they
  ever show print pollution, we'll add `.printable-root` to each
  individually with its own `.printable` marker on the content.
- **Per-template print CSS** — templates already render at
  `max-w-[8.5in]` to match US Letter; no per-template work needed.
- **Server-side PDF rendering** (Phase 2.4+) — the
  `/api/pdf/render-resume` route is parked in AGENTS.md §"Future
  work" because Next.js 16's App Router blocks the `react-dom/server`
  import in route handlers. The browser print engine produces
  pixel-identical output today.

## User-visible behavior

### Before

- Free user clicks "Download PDF" on a master.
- Preview route opens in a new tab with `?print=1`.
- Browser print dialog shows; user picks "Save as PDF".
- Resulting PDF contains: the resume + the preview-route chrome bar
  (correctly hidden via `no-print`) + the **Pro is launching soon**
  banner + the **sidebar** + the **mobile top bar**.
- The Pro banner is the visible bug.

### After

- Same flow.
- Resulting PDF contains: only the resume.
- The Pro banner / sidebar / mobile top bar are hidden because:
  - the preview page now opts into print isolation via
    `.printable-root`, which flips the default; AND
  - the dashboard chrome (banner + sidebar + mobile top bar) now has
    `no-print` for defense in depth on every dashboard page.
- Ctrl+P from any OTHER dashboard page (resume list, settings, etc.)
  also strips the banner + sidebar — same defense-in-depth applies.

## Files

- **Changed:**
  - `app/globals.css` — add `.printable-root` + `.printable` rules
    under `@media print`. Existing `.no-print` rule stays (both
    coexist; the new rule is opt-in per page, the old rule is the
    global escape hatch).
  - `app/(dashboard)/dashboard/resumes/[id]/preview/page.tsx` —
    add `.printable-root` to the outer wrapper; wrap `<Template />`
    in `.printable`.
  - `components/billing/pro-launching-soon-cta.tsx` — add `no-print`
    to the banner's outer `<div>`.
  - `app/(dashboard)/_components/dashboard-shell.tsx` — add `no-print`
    to the mobile top bar + sidebar (already has it on the sidebar
    today; double-check the mobile top bar).

- **Tests:**
  - `tests/unit/print-isolation.test.ts` (new) — assert that
    `globals.css` contains the `.printable-root` + `.printable`
    rules. Browser print rendering isn't easy to test in jsdom
    (Chromium's print pipeline), but a CSS-source assertion catches
    the regression of "someone deletes the rule".

## Acceptance criteria

1. PDF export from the preview route contains ONLY the resume
   content. The Pro banner, sidebar, mobile top bar, and preview
   chrome bar are all absent.
2. Ctrl+P from any dashboard page (e.g. `/dashboard/resumes`) does
   NOT include the Pro banner / sidebar / mobile top bar.
3. The preview route is still visually identical on screen — only
   the print output changes.
4. `tsc --noEmit` is clean. Existing 989 tests still pass. New test
   adds 2+ assertions.

## Test plan

- **Unit:** `tests/unit/print-isolation.test.ts`
  - `globals.css` contains the `.printable-root` rule under
    `@media print`.
  - `globals.css` contains the `.printable` rule under
    `@media print`.
  - `ProLaunchingSoonBanner` markup (rendered via `renderToStaticMarkup`
    against the component) has the `no-print` class on its
    outermost `<div>`.

- **Manual smoke (post-deploy):**
  - Sign in as a Free user, click "Download PDF" on a master → PDF
    contains only the resume.
  - Open `/dashboard/resumes` → Ctrl+P → PDF does NOT contain the
    Pro banner.
  - Open `/dashboard/resumes/[id]/preview` (no `?print=1`) → Ctrl+P
    → PDF contains only the resume.

## Rollback plan

Revert the commit. CSS-only change, no data implications.

## Open questions

None. The opt-in per-page scope is the safe default; we can promote
to global scope later if the user wants.