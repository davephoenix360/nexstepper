# Pre-launch Compliance, Data Rights, and Landing Polish — Plan

## Objective

Three launch-readiness gaps shipped in one branch:

1. **Legal pages** — Privacy Policy, Terms of Service, Cookie Policy. Currently the footer 404s on `/privacy` and `/terms`.
2. **Data rights** — true account deletion (scrubs Stripe customer + PostHog distinct_id, not just our DB row) + GDPR Art. 20 data portability export.
3. **Landing page polish** — tighten hero, add trust strip, demote secondary CTA.

Drives the last of the "Hard requirements for v1 deploy" from `docs/setup/production.md` §11.

> **Scope region:** US + Canada (PIPEDA in CA, CCPA in CA-state US visitors, no federal US cookie law). **No EU/UK launch yet**, so no cookie consent banner is built — but the Cookie Policy page exists so we can add the banner later without restructuring the footer.

## User-visible behavior

- Footer "Privacy / Terms / Cookies" links render real pages instead of 404.
- Each policy page shows the policy text + a clearly-marked "Last updated: 2026-09-24" and "This document is generated from open templates; it has not been reviewed by a lawyer. Review before relying on it commercially." notice at the top.
- `/dashboard/security` gains an **"Export your data"** button (next to "Delete Account"). Clicking it downloads a `nexstepper<userId>-<date>.json` file containing everything the user has on our platform.
- **"Delete Account"** now cancels any active Stripe subscription + deletes the Stripe customer record + scrubs PostHog user properties, in addition to the existing Better Auth user deletion. User is signed out and bounced to `/`.
- Landing page: tighter hero headline + a 3-item trust strip ("GDPR-ready · Export & delete anytime · Stripe-secured payments") directly under the CTA.

## Scope (in)

- 3 new legal pages under `app/(legal)/{privacy,terms,cookies}/page.tsx` + a shared `app/(legal)/layout.tsx` (no nav rail, just the marketing header + footer for context).
- New module `lib/data-rights/`:
  - `purge-user.ts` — server-authoritative orchestration that runs **before** the Better Auth user row delete, so cascade FKs don't fire and orphan downstream rows.
  - `export-user.ts` — server action returning a typed JSON bundle.
  - `stripe-customer.ts` — `cancelStripeCustomer(userId)` helper (idempotent; safe to call twice).
  - `posthog-user-delete.ts` — `scrubPosthogUser(userId)` helper that hits PostHog's `$delete_user` GDPR endpoint.
- Update `app/(dashboard)/dashboard/security/page.tsx` — add Export button, swap inline `authClient.deleteUser` for a server-action-first flow.
- New `lib/consent/` is **NOT** in scope (US/CA launch, no banner needed).
- Landing page copy edits only: hero headline, trust strip, demote secondary CTA. No new components, no redesign.
- Footer link updates: existing Privacy / Terms links now resolve. Add Cookies link.

## Non-goals (out of this plan)

- **Cookie consent banner.** No EU/UK traffic expected at launch; banner can be added later when we open EU marketing. The Cookie Policy page itself is built.
- **DPA / Standard Contractual Clauses / subprocessor change-notification mechanism.** Standard practice is to ship these when an enterprise customer asks. The Privacy Policy's "Subprocessors" section names them.
- **AI-output indemnification / IP ownership of generated content.** Beyond free-template scope. Add a simple "AI Output Disclaimer" section in the Terms (no warranty on AI suggestions; user is responsible for verifying before using in a job application).
- **Right to correction / right to opt-out of "sale or sharing"** — California-specific CCPA workflows. The Privacy Policy mentions these rights; the UI to exercise them lives behind `/dashboard/security` (user can update their profile + delete + export). No "Do Not Sell or Share" link banner because we don't sell or share.
- **Reviews feature, Liveblocks collab, extension API, template studio** — separate roadmap items.
- **Real testimonials** on the landing page — you don't have paying users yet. Trust strip + clearer copy fills the gap until you do.

## Architecture + locked tradeoffs

### 1. Policy text source: open templates adapted to Nexstepper

Generate each policy from the Termly open-source CC0 templates (https://termly.io/resources/templates/), rewritten to Nexstepper's actual data practices. Every section that involves Nexstepper-specific facts (subprocessors, retention, plan details) gets the real values from `.env.example` + `lib/db/schema.ts` + the Stripe setup doc.

Each page has a `<PolicyNotice>` banner:

> **Important:** This document was last updated **2026-09-24** and was generated from open legal templates. It has **not** been reviewed by a lawyer. Before relying on this document commercially (or before launching to EU/UK traffic), commission a one-time legal review — expect $300–500 for a SaaS policy package from a tech-transactions attorney (e.g. Promise.Legal, Terms.Law).

This is honest, not deferral. Generated templates are industry standard for self-serve SaaS at this price point; the banner ensures we're not pretending it's lawyer-drafted.

### 2. Purge order matters

GDPR Art. 17 + Recital 65 require erasure "without undue delay." For our system, the right order is:

1. **Sign-out everywhere** (Better Auth cascade: sessions + tokens → revoked on user delete). Done implicitly by `auth.api.deleteUser`.
2. **Cancel any active Stripe subscription** so no further charges happen. If you delete the customer while a subscription is `active`, Stripe's webhook will fail to fire and the local `subscriptions` row goes stale.
3. **Delete the Stripe customer record** (with `subscriptions.del` first if active, then `customers.del`).
4. **Scrub PostHog user properties** via PostHog's `$delete_user` GDPR endpoint.
5. **Delete the user row** in Postgres. The `onDelete: 'cascade'` FKs handle session, account, subscriptions (mirror row), resumes, applications, chatSessions, chatMessages, chatUsage — verified in audit 2026-09-24.
6. **Record the erasure event** in a new `erasure_log` table (`userHash` = SHA-256 of user_id, `erasedAt`, `processorsNotified`: ['stripe','posthog','postgres']). No PII.

Why record the erasure? Regulators (EDPB 2025 enforcement report) increasingly want **policy-to-action evidence**: prove which steps ran without putting deleted PII into the audit log. The hash makes the row linkable to a specific request without exposing identity.

We **do not** delete `stripe_events_processed` (by design, per `schema.ts:74` comment — append-only idempotency log). The Privacy Policy explains this is retained on a "legal obligation" basis (tax/audit).

### 3. Export format: JSON with a schema README

Per GDPR Art. 20 (right to data portability): "structured, commonly used, machine-readable." JSON is the EDPB's named example. The bundle includes a top-level `_schemaVersion`, `_exportedAt`, `_notes` (what's excluded and why), then per-data-source arrays.

The export is **self-serve**: button on `/dashboard/security` → calls server action → returns JSON as a `Blob` → browser downloads. No support-ticket round-trip. GDPR's 1-month SLA is irrelevant when the user gets it in <5 seconds.

What we include:

- `user` (profile fields only — no `password`, no OAuth tokens)
- `subscriptions` (plan, status, period, customer ID — Stripe secrets excluded)
- `resumes` + nested `revisions` + `applications` + `score_snapshots`
- `chat_sessions` + nested `chat_messages` + `chat_usage`
- `shares` (public-link tokens; user may want to revoke these too — link to share page)

What we exclude (and document why in `_notes`):

- `stripe_events_processed` (internal idempotency log, legally retained)
- Better Auth `account.access_token` / `refresh_token` (credentials; revocation through sign-out is the right path)
- `session` rows (transient; meaningless after revocation)

### 4. Landing page changes are copy-only

The 2026 best-practice audit identified five gaps; three can be fixed with copy changes only:

| Gap | Fix |
|---|---|
| Hero headline generic | "Land your next role, faster" → "Tailored, ATS-scored resumes for every job you apply to" |
| No trust signals near CTA | Add `<TrustStrip>` under the CTA: 3 small badges |
| Two equal-weight CTAs | "See pricing" demoted to text link below primary |

The remaining two (no social proof, no logo strip) require real testimonials which don't exist yet — flagged as **post-launch** in the TODO comment in `hero.tsx`.

## Files

### New

- `app/(legal)/layout.tsx` — wraps with the marketing header + footer (no nav rail)
- `app/(legal)/privacy/page.tsx` — Privacy Policy
- `app/(legal)/terms/page.tsx` — Terms of Service
- `app/(legal)/cookies/page.tsx` — Cookie Policy
- `app/(legal)/_components/policy-notice.tsx` — the "generated, not lawyer-reviewed" banner
- `app/(legal)/_components/policy-toc.tsx` — sticky table of contents for long docs
- `lib/data-rights/purge-user.ts` — server action
- `lib/data-rights/export-user.ts` — server action
- `lib/data-rights/stripe-customer.ts` — `cancelStripeCustomer(userId)` + `deleteStripeCustomer(userId)`
- `lib/data-rights/posthog-user-delete.ts` — `scrubPosthogUser(userId)`
- `lib/data-rights/schema.ts` — the export shape as a Zod schema (single source of truth, also exported for tests)
- `lib/db/migrations/0008_erasure-log.sql` — Drizzle migration adding `erasure_log` table
- `tests/unit/data-rights/export-user.test.ts` — JSON shape validation
- `tests/unit/data-rights/purge-user-helpers.test.ts` — Stripe + PostHog helper mocks
- `tests/integration/account-purge.test.ts` — full purge flow against a test DB (skipped in CI if no DB; runs locally)

### Changed

- `app/(dashboard)/dashboard/security/page.tsx` — add Export button; use new purge action
- `components/marketing/hero.tsx` — tighten headline + add `<TrustStrip>` + demote secondary CTA
- `components/marketing/footer.tsx` — add `/cookies` link
- `lib/db/queries.ts` — add `getUserExportBundle(userId)` (called by export action)
- `lib/db/schema.ts` — add `erasureLog` table
- `AGENTS.md` — refresh "Now (in flight)" entry after merge

## DB / schema

Single migration: **`0008_erasure-log.sql`**

```sql
CREATE TABLE erasure_log (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  -- SHA-256 of the user_id at erase time. Stable, non-reversible.
  user_hash    text NOT NULL,
  -- ISO timestamp the purge action ran
  erased_at    timestamp NOT NULL DEFAULT now(),
  -- JSON array naming which third parties were notified
  processors_notified jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX erasure_log_erased_at_idx ON erasure_log (erased_at);
```

No other schema changes. All existing `onDelete: 'cascade'` FKs continue to work as-is.

## Dependencies

No new npm packages. The Stripe + PostHog SDKs are already in `package.json` (per locked stack).

Optional but cheap: `nanoid` is already in the tree for the erasure_log `id`.

## Risks

| Risk | Mitigation |
|---|---|
| Generated policies miss a region-specific clause (e.g. PIPEDA-specific phrasing for Canada) | Banner explicitly says "not lawyer-reviewed"; Privacy Policy mentions PIPEDA by name and links to OPC guidance; Terms has a "Governing law: Delaware, USA" clause that covers US + EU-style choice-of-law disputes |
| Stripe customer deletion fails mid-flight (e.g. rate limit) | `cancelStripeCustomer` and `deleteStripeCustomer` are each idempotent and safe to retry; the purge action logs failure but continues (the local row delete still runs, so user data is gone from our DB even if Stripe cleanup needs a manual retry). The `erasure_log` row records which processors were notified. |
| PostHog `$delete_user` fails | Same pattern — logged but not blocking. PostHog retains the row but the user is identifiable only via internal `distinct_id`; they can't see their old events through the UI. The Privacy Policy says "PostHog user properties will be scrubbed within 30 days" — gives us a buffer. |
| Export bundle leaks PII from related rows (e.g. shared with a collaborator — not in v1, but possible later) | Schema Zod-validates the bundle; tests assert it round-trips to user-owned rows only. If we add multi-user features (collab, reviews), revisit. |
| User downloads the export then complains "this is just my data, not my friend's" | We're a single-user product today; the export reflects that. If we add shared artifacts, future versions will need to redact third-party PII per Art. 20(4). |
| Lawyer-light pass after launch surfaces material gaps | Banner makes it clear the policy is generated; rapid fix is edit-the-page, no schema impact. |

## Acceptance criteria

- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` all green, including new tests
- [ ] `pnpm build` clean
- [ ] `/privacy`, `/terms`, `/cookies` render with policy text + the "not lawyer-reviewed" banner
- [ ] Footer on `/`, `/dashboard/*`, and the legal pages shows working links to all three
- [ ] `/dashboard/security` shows an **"Export your data"** button. Clicking it downloads a valid JSON file matching `exportUserDataSchema` (Zod). File includes all user-owned rows + the `_schemaVersion` / `_exportedAt` / `_notes` envelope. Excludes the documented set.
- [ ] `/dashboard/security` **"Delete Account"** button:
  1. Cancels active Stripe subscription if any (idempotent if none).
  2. Deletes Stripe customer record.
  3. Calls PostHog `$delete_user`.
  4. Deletes the user row (Better Auth cascade handles dependents).
  5. Inserts an `erasure_log` row with the SHA-256 hash + processors notified.
  6. Redirects to `/` and signs the user out.
- [ ] PostHog/Sentry/Stripe API calls are stub-mocked in unit tests; full integration test runs locally with a test DB.
- [ ] Landing page hero:
  - Headline is more category-specific (no longer just "Land your next role, faster")
  - Trust strip shows "GDPR-ready · Export & delete anytime · Stripe-secured payments"
  - "See pricing" is a text link, not a button
- [ ] All changes ship on `feat/pre-launch-compliance`, merged --no-ff into main, pushed to origin

## Test plan

- **Unit:**
  - `tests/unit/data-rights/export-user.test.ts` — schema validation; sample user fixture; assert excluded fields are absent; assert all documented tables appear.
  - `tests/unit/data-rights/purge-user-helpers.test.ts` — mock Stripe SDK + PostHog SDK, assert idempotency, assert order of operations, assert erasure_log row shape.
- **Integration (local only, requires DB):**
  - `tests/integration/account-purge.test.ts` — create test user + dependents → call purge → assert user gone + cascade applied + erasure_log row present + Stripe/PostHog stubs called.
- **Visual smoke:**
  - Manually open each policy page in the dev server, check rendering.
  - Manually open landing page on mobile + desktop viewport, check trust strip + CTA hierarchy.

## Rollback plan

- **Single revert** — revert the merge commit. All changes are in a single branch with no DB migration applied to prod yet (the `erasure_log` table is new; if you haven't run migrations on prod, just don't deploy this branch). Once you DO deploy, the `erasure_log` table stays (it's append-only, harmless). The data-rights logic is callable only from `/dashboard/security`, so a bad export won't take down the site — users just see a broken button.
- **Partial rollback** — if only one package misbehaves, revert the file(s) within `lib/data-rights/`, `app/(legal)/`, or the marketing components individually.

## Open questions

None at ship-time. The pre-plan questionnaire resolved the region (US/CA), template source (free templates), and landing scope (polish only). If a lawyer review surfaces material gaps in the policy text, post-merge we ship a follow-up commit adjusting the affected page.

## References

- `docs/setup/production.md` §11 — done criteria for v1 deploy
- `AGENTS.md` — locked stack, planning discipline, drift audit format
- `docs/setup/stripe.md` — Stripe live-mode setup
- GDPR Art. 17 (erasure), Art. 20 (portability), Recital 65
- CCPA / CPRA — Right to Delete, Right to Know (California only — covered in Privacy Policy)
- PIPEDA — Canadian federal privacy law (covered in Privacy Policy)
- EDPB 2025 coordinated enforcement report on right to erasure