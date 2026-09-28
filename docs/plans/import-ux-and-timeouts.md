# Import resume UX + timeout hardening — Plan

> Plan template: [`AGENTS.md`](../../AGENTS.md) §Planning discipline.
> Branch: `feat/import-ux-timeouts`. Commit footer: `Plan: docs/plans/import-ux-and-timeouts.md`.

## Audit summary (what the AI Gateway logs reveal)

Looking at the four Sep 28 runs of the resume-import flow:

| Time | Provider | Status | Latency |
|---|---|---|---|
| 12:32 | DeepInfra | **499** | 2m 33s |
| 08:35 | Novita AI | 200 | 57s |
| 08:34 | Novita AI | 200 | 1m 6s |
| 08:32 | Novita AI | **499** | 1m 31s |

Plus `formatImportError('ai_failure', rawSdkMessage)` is wired to append
the raw SDK error to the user-visible message — so users see things
like `The AI could not parse this resume. NoObjectGeneratedError: ...`.

### Two distinct problems

**A. The 499s are a UX problem, not a model problem.**
The 2 success runs (200) prove the model works fine — 57s and 1m 6s are
acceptable for "AI parsing a resume". The 499s come from Vercel's edge
proxy closing the connection, which happens when:

  1. The Next.js Server Action runs longer than the project default
     `maxDuration`. With Fluid compute (default in 2026) that's 300s.
     Without Fluid compute, Hobby = 10s / 60s max, Pro = 15s / 300s max.
     The project doesn't set `maxDuration` anywhere, so it falls back
     to whatever the dashboard project default is — easy to silently
     cap at 10/15s and silently kill every long AI call.
  2. The user closes the tab / refreshes because the UI shows a
     spinner with no progress, no ETA, no "try again" affordance, and
     no hint that "this might take 1-2 minutes". For a UX-sensitive
     user, a 60s spinner is enough to bail.

**B. The raw SDK error string is dev-facing info.**
`formatImportError('ai_failure', 'NoObjectGeneratedError: ...')` ships
the SDK error class name + stack-fragment to the user. That's debugging
output, not user copy.

## Objective

Tighten the import-resume flow on three fronts:

1. **Backend reliability** — give the Server Action room to actually
   finish, cap the AI fallback chain so it can never run unbounded,
   and strip dev-facing error strings before they reach the UI.
2. **Frontend feedback** — pre-submit ETA hint, step-based progress
   indicator (we already have the stages; just need to surface them
   more clearly), and a "Try again" button after failure so the user
   doesn't have to re-pick the file.
3. **No new deps** — pure CSS + a couple of lucide-react icons we
   already use elsewhere.

## User-visible behavior

### Before (current)

1. User picks file → clicks "Import & create" → button label switches
   to "Reading file..." then "Extracting & analyzing with AI..." then
   "Done!". Spinner spins the whole time.
2. No hint that the call takes 30-90s. Users assume it's hung.
3. On error, a one-line red message like *"The AI could not parse this
   resume. NoObjectGeneratedError: AI_NoObjectGeneratedError: ..."*
   appears below the form. The button is re-enabled. The user has to
   re-pick the file from scratch.

### After

1. Above the submit button (only on the Import tab), a muted one-liner:
   *"This usually takes 30–60 seconds — your file is processed
   server-side, not in your browser."*
2. While the action is running, the form shows:
   - The spinner button (kept)
   - A new **step indicator** below the button: `● Reading file` →
     `● Extracting & analyzing with AI` → `● Saving`. The current step
     is highlighted; completed steps show a checkmark. Each step resets
     the user's patience clock per NNG's progress-indicator research.
3. On error, a card-style alert appears with:
   - `AlertCircle` icon
   - **Friendly headline** ("We couldn't import your resume")
   - **Friendly body** ("The AI couldn't read your file in time. Try
     again, or paste the text instead.")
   - **Try again button** — clears the error, resets stage to idle,
     re-submits with the existing file (state preserved).
   - **What happened?** disclosure — shows the raw technical detail
     for users who want to copy/paste to support, and for us to see
     in bug reports. Hidden by default.

## Scope (in)

- `export const maxDuration = 300` on the resumes page → 5-minute
  Server Action budget.
- Global `AbortSignal.timeout(180_000)` wrapper around the AI
  fallback chain → 3-minute hard cap on the AI call regardless of how
  many fallbacks fire. Without this the chain is unbounded when models
  are slow-but-not-failing.
- Server-side: when the AI fallback throws, log the raw error to
  console (dev) / Sentry (prod) and return a clean user-facing
  message instead of the SDK error string.
- Frontend: step indicator + pre-submit hint + error card + Try again.
- One unit test for the new step indicator rendering + one for the
  Try-again retry behavior.

## Non-goals (out of this plan)

- **Background jobs (Inngest)** — moving the AI parse to a background
  job with notification would let users navigate away. Documented as
  a follow-up in the "Future work" section below; not in this PR.
- **Streaming partial output** — `generateObject` doesn't stream
  partial JSON the way `streamText` does. Not worth switching to
  `streamObject` + a custom merge step for this iteration.
- **Replacing Mistral Nemo as primary** — the model itself works
  fine; the issue is the client timing out. Re-evaluate once we have
  the timeout fix in production for a week.
- **Cancel button mid-flight** — Next.js Server Actions can't be
  cancelled from the client once fired. With `maxDuration: 300` +
  the 180s AI cap, the worst-case wait is bounded and the user has
  the Try-again affordance after.
- **Per-attempt latency tracking** — `RESUME_IMPORTED` already fires
  on success; we'd add a `RESUME_IMPORT_FAILED` event. Skipped for
  this PR; can layer on later.

## Architecture

### Timeout layering

```
┌─────────────────────────────────────────────────────────────┐
│ Vercel function maxDuration = 300  (5 min)                   │  ← outer cap
├─────────────────────────────────────────────────────────────┤
│ Server Action: importResumeAction                            │
│   ├─ FormData validation + file read (≤1s typical)          │
│   ├─ extractFileText (PDF/DOCX/TXT)         (≤3s typical)   │
│   └─ parseResumeText → AI call                               │
│        ├─ Global AbortSignal.timeout(180_000)  (3 min)       │  ← inner cap
│        └─ generateObjectWithFallbacks                         │
│             ├─ mistral/mistral-nemo       (≤90s timeout)    │
│             ├─ meta/llama-3.1-8b          (≤90s timeout)    │
│             ├─ amazon/nova-micro           (≤90s timeout)    │
│             └─ openai/gpt-4o-mini         (≤90s timeout)    │
└─────────────────────────────────────────────────────────────┘
```

The 90s per-model timeout stays (handles a single hung model). The
new 180s global timeout caps the total AI wall-clock (handles the
"every model is slow" case — better to fail fast than keep the user
waiting). The 300s `maxDuration` is the outer safety net (matches
Vercel's Pro default with Fluid compute).

### Error message sanitization

Current `parseResumeText` catch:
```ts
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, code: 'ai_failure', error: message };
}
```

Change to:
```ts
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  // Always log the raw error server-side for debugging. Return a
  // sanitized user-facing message; the raw `message` is also returned
  // for support / "Show details" disclosure.
  console.error('[parseResumeText] ai_failure:', message);
  return {
    ok: false,
    code: 'ai_failure',
    error: USER_FRIENDLY_AI_FAILURE_MESSAGE,
    technical: message
  };
}
```

The `technical` field rides along to the client for the "What
happened?" disclosure. Sentry picks up the error too because it's
caught at the route level via Sentry's instrumentation.

## Files

- **New:** none.
- **Changed:**
  - `app/(dashboard)/dashboard/resumes/page.tsx` — add `export const
    maxDuration = 300;`.
  - `lib/resume-parser/parse-resume.ts` — add global 180s
    `AbortSignal.timeout` wrapper around the fallback chain.
  - `app/(dashboard)/dashboard/resumes/actions.ts` — sanitize
    `ai_failure` message in the action's catch; add a `technical`
    field for the disclosure. (Other codes already have user-friendly
    text.)
  - `app/(dashboard)/dashboard/resumes/_components/create-master-form.tsx`
    — pre-submit hint, step indicator, error card with AlertCircle +
    Try again + What Happened disclosure. Replace the
    `<p className="text-sm text-destructive">{error}</p>` block.
  - `tests/unit/import-flow-ux.test.tsx` (new) — assert the step
    indicator renders the right labels for each stage, the Try again
    button re-submits without re-picking the file, and the error
    card surfaces the friendly text without the SDK error class name
    in the main visible line.

## DB / schema

No changes.

## Dependencies

None. New icons (`AlertCircle`, `RefreshCw`, `Check`) already come
from lucide-react which is a project dep.

## Acceptance criteria

1. Hard-refresh `/dashboard/resumes` in the preview → the import tab
   shows a "this usually takes 30-60 seconds" hint above the submit
   button.
2. Submit a real PDF → while the action runs, a 3-step indicator is
   visible with the current step highlighted.
3. Force an AI failure (set `AI_GATEWAY_API_KEY` to invalid + retry)
   → the error card shows the friendly message, the SDK error class
   name is NOT in the main visible line, "Try again" is clickable, and
   clicking it re-submits without making the user re-pick the file.
4. The `importResumeAction` Server Action can run for up to 300s
   without Vercel killing it (verifiable via the Next build output's
   `maxDuration` for the segment).
5. AI fallback chain is hard-capped at 180s; even if every model in
   the chain hangs, the action returns within ~3 minutes rather than
   running unbounded.
6. All 978 existing tests pass; new tests add 3+ assertions.

## Test plan

- **Unit:** `tests/unit/import-flow-ux.test.tsx`
  - Renders the create-master form in `import` mode; asserts the
    ETA hint is visible.
  - Sets stage to `parsing` via state; asserts the step indicator
    highlights step 2.
  - Renders an error card; asserts the friendly message is in the
    visible line and the SDK error class name (`NoObjectGenerated`)
    is NOT in the visible line.
  - Simulates clicking "Try again" → asserts the error is cleared
    and the same payload is re-submitted (same file blob).

## Future work (parked)

- Move to Inngest background job for the AI parse. User submits →
  immediate `{ jobId }` response → client polls / shows progress →
  notification on completion. Frees the user to navigate away.
  Effort: 1-2 days. Requires `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`
  (already in the env-var cheat sheet per AGENTS.md). Worth doing if
  we ship Pro plans or if abandonment data justifies it.
- Switch to `streamObject` so we can render partial sections
  ("Profile parsed, working on Experience...") as the AI streams.
  Adds the step-based UX we want *for free* with minimal extra code.

## Rollback plan

Revert the commit. No schema, no env-var changes; the rollback is a
pure code revert + Vercel redeploy.

## Open questions

None. The 300s `maxDuration` is a safe default (matches Vercel Pro +
Fluid compute); the 180s inner cap is generous given observed
latencies (57s-153s on real calls in the audit).