# 0002 — Use browser print-to-PDF (not a managed PDF API)

## Context

The rebuild plan called for **Playwright (Chromium) via a managed API**
(Browserless / PDF4.dev / Firecrawl's PDF endpoint) for PDF rendering.
Mid-session, after a full ~3000-line adapter was already in place, a
"let's just verify the native flow first" thought experiment convinced
us to abandon the managed-API approach.

Three UX concerns had to be addressed before browser print could
replace the managed-API pipeline:

1. **Button UX** — the user has to know "Save as PDF" is the
   destination before the print dialog snaps in. Otherwise they get
   dropped into the OS print panel and have to figure it out.
2. **Filename** — Chromium uses `document.title` as the default
   `Content-Disposition: filename`. The saved PDF has to have a
   reasonable name.
3. **Background colors** — Chromium strips backgrounds by default in
   print. Our templates use indigo section accents, chip backgrounds,
   and divider rules. They'd disappear in the PDF.

## Decision

The "Download PDF" affordance opens `/dashboard/resumes/[id]/preview?print=1`
in a new tab. The preview page auto-runs `window.print()` once on
mount. The user picks "Save as PDF" in the browser's native dialog.
Two clicks total.

The three UX concerns are handled in the preview route:

1. **Help text chrome bar** above the preview reads "Destination:
   **Save as PDF** in the print dialog" inline. Hidden in print via
   `.no-print` (`@media print` in `app/globals.css`).
2. **`generateMetadata()`** sets `document.title` to `"${resumeName} —
   Resume"`, which Chromium uses as the default filename.
3. **`print-color-adjust: exact`** in `globals.css` keeps the
   backgrounds visible in the PDF. Verified visually with
   `output/playwright/12-print-color-check.png` and a real 64 KB PDF
   in `output/playwright/13-print-pipeline.pdf`.

All `lib/pdf-render/` adapter code, the `app/api/pdf/` routes, the
Tailwind-compile pipeline (`app/print.css` + `pdf:css:build` script),
and the smoke-test scripts were **removed in the same session** as a
clean cut. No orphans. `package.json`, `pnpm-lock.yaml`,
`vitest.config.ts`, `.env.example`, and `.gitignore` updated to drop
the dead config.

## Consequences

**Good:**

- **$0 forever.** No Browserless / DocRaptor / Cloudflare bill, no
  free-tier cliff to design around.
- **No paywall on a core feature.** Every user exports PDFs forever;
  gating it behind Pro would be hostile.
- **Pixel-identical to the on-screen preview.** The PDF is the same
  Chromium engine rendering the same `app/globals.css` — no pipeline
  drift, no "looks different than what I saw" surprises.
- **Privacy-friendly.** Resume data is PII. Browser print keeps it
  on the user's machine; nothing leaves our servers.
- **No env vars, no API keys, no third-party auth surface.**

**Bad:**

- **Headless / server-generated PDFs are out of reach.** Use cases
  like "recruiter clicks the public share link and gets an automatic
  PDF attachment" can't be served from this flow. Deferred to the
  "Future server-side rendering" note in AGENTS.md Phase handoff.
- **Bulk export doesn't work.** Same constraint — if a user wants to
  generate 50 PDFs, the browser-print flow is wrong.
- **Print UX is a coin flip on some mobile browsers.** iOS Safari
  behaves fine; some Android browsers hide the destination choice.
  Acceptable for v1; not a tablet/mobile product anyway (out of v1
  per the locked non-goals).

## Alternatives considered

- **Playwright via managed API (Browserless).** Original pick. The
  adapter was working end-to-end (real 47 KB PDF from Browserless).
  Rejected because the cost ($) and privacy (resume bytes leave our
  server) outweighed the convenience.
- **Self-hosted Playwright on Vercel.** Out of the question — Vercel
  doesn't run a Chromium build for you; you'd pay for a serverless
  function cold start on every export.
- **`@react-pdf/renderer`.** Was in the legacy `nextep/` repo but
  unused. Renders PDFs in JS without a browser, but loses CSS fidelity
  (no flex, no grid, no modern CSS) and the templates would need
  parallel authoring — one for screen, one for PDF. Rejected.
- **LaTeX export (the original `nextep/` way).** Was the legacy
  primary. Deferred per the rebuild plan — LaTeX is power-user export
  only if/when requested.

## When to revisit

If we ever need server-generated PDFs — anonymous share links with
attached PDF, email attachments, bulk export, recruiter integrations —
the right shape is a **separate worker process** that owns the
template registry + a headless renderer. NOT `react-dom/server`
inside a Next.js app route (Next.js 16 reserves that module for its
own RSC pipeline). The `DownloadPdfButton` JSDoc captures this seam.
