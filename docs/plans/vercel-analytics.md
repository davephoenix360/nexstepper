# Vercel Web Analytics — Plan

> Plan template: [`AGENTS.md` § Planning discipline](../../AGENTS.md#planning-discipline).
> Branch: `feat/vercel-analytics`. Commit footer: `Plan: docs/plans/vercel-analytics.md`.

## Objective

Count page views and visitors. Today the app sends **none**: PostHog
runs with `capture_pageview: false` (no SPA route-change listener is
wired), so the product analytics only ever sees button clicks and form
submits. We cannot tell whether anyone reaches the scorecard, the JD
panel or the chat.

## Scope (in)

- `@vercel/analytics` installed; `<Analytics />` mounted.
- Page views and visitors, including SPA route changes.
- The legal pages updated to match.

## Non-goals

- **Replacing PostHog.** Vercel Analytics answers "did they get here";
  PostHog answers "what did they do". Both.
- **Custom events, funnels, or user profiles.** PostHog's job.
- **Speed Insights.** A separate product, separate question.

## The decision that mattered: consent

`<Analytics />` has **no consent awareness of its own**. Mounting it
unconditionally starts collecting page views and loading Vercel's script
before the visitor has decided — which would make two promises on the
cookies and privacy pages false:

- *"One analytics tool runs only if you say yes."*
- *"PostHog is not initialised at all until you allow analytics."*

So Vercel Analytics goes through the **same gate** as PostHog
(`VercelAnalyticsGate`): not loaded, nothing sent, until there is a
decision AND that decision granted analytics.

### The helpful part

Vercel's own docs are explicit: Web Analytics *"only stores anonymized
data and does not use cookies"*. A visitor is identified by a hash
derived from the incoming request, valid for a single day and
automatically discarded after 24 hours; the data is aggregated and
cannot be traced to a person or reconstructed across sites.

So it is a **materially lighter** processor than PostHog, which sets
`ph_*` cookies for up to a year. The cookies page's cookie table does
not change — but the privacy page's processor list does, and the
cookies page's summary line ("one analytics tool" → "two") does.

## Files

### New

- `components/consent/vercel-analytics-gate.tsx` — the gate.
- `tests/interaction/vercel-analytics-gate.test.tsx` — it does not load
  before a decision, does not load when declined, loads once granted,
  and degrades safely outside a provider.

### Changed

- `app/layout.tsx` — mount the gate (never `<Analytics />` directly).
- `app/(legal)/privacy/page.tsx` — §1 and §4 name Vercel Web
  Analytics; changelog + `LAST_UPDATED`.
- `app/(legal)/cookies/page.tsx` — summary line, the analytics table
  (Vercel sets no cookie), the "neither runs until you consent"
  paragraph; changelog + `LAST_UPDATED`.
- `tests/unit/consent.test.ts` — structural guards: the layout mounts
  the gate and never the component, the gate requires a decision AND a
  grant, and the legal pages name the second provider.
- `AGENTS.md` — locked stack + roadmap.

## Risks

**1. The traffic number is biased.** Page views are only counted for
visitors who accept analytics. If the accept rate is low, the number
understates traffic — and a traffic number is exactly what people use
to judge whether something works.
*Mitigation:* none shipped, deliberately. Making it ungated is a
one-line change in the gate plus an edit to the two legal pages, and it
is a **legal-posture decision** (does cookie-less, session-scoped,
aggregated page-view counting by our own host need consent?). That call
belongs to the founder, not to a commit.

**2. A second analytics provider is a second thing to explain.** The
cookies and privacy pages both say "one analytics tool" in places.
*Mitigation:* both pages are updated, and the cookies page states
plainly that Vercel's sets no cookie and PostHog's does.

**3. Two scripts, two failure modes.** *Mitigation:* Vercel's is served
from Vercel's own edge (`/_vercel/insights/script.js`) — the same
infrastructure that serves the app — so it cannot be a third-party
outage.

## Acceptance criteria

1. With no consent decision, no analytics script is loaded.
2. With analytics declined, no analytics script is loaded.
3. With analytics granted, Vercel's script loads and page views are
   reported in the Vercel dashboard.
4. The cookies page names two analytics providers and still says
   nothing is stored on the device by Vercel's.
5. The privacy page names Vercel Web Analytics in §1 and §4.
6. `pnpm typecheck` clean, `pnpm test` green.

## Test plan

- `tests/interaction/vercel-analytics-gate.test.tsx` — the four
  consent states, in a real DOM.
- `tests/unit/consent.test.ts` — the structural guards (the repo's
  convention for the consent React layer).
- Manual: deploy, visit the site, accept analytics, navigate between
  pages, and check the Vercel dashboard for page views within 30s.

## Rollback plan

Remove `<VercelAnalyticsGate />` from the layout and the dependency.
The consent architecture is untouched, so nothing else moves.

## Open questions

1. **Should page views be counted regardless of consent?** The one
   decision that changes what the numbers mean. See Risk 1.
2. **Do we want Speed Insights too?** It answers "why was this page
   slow", which is a different question from "did they get here".
