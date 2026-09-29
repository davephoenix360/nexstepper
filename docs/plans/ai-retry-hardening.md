# AI retry hardening — Plan

> Plan template: [`AGENTS.md`](../../AGENTS.md) §Planning discipline.
> Branch: `feat/ai-retry-hardening`. Commit footer: `Plan: docs/plans/ai-retry-hardening.md`.

## Audit summary (Sep 28, post-deploy)

Every AI surface in the codebase goes through one of two helpers in
`lib/ai/fallback.ts`:

- `generateObjectWithFallbacks` — structured output (resume parse,
  JD parse, intent extract, bullet enrich, …)
- `generateTextWithFallbacks` — plain-text (JD markdown formatter)

Both already implement a **cross-model fallback chain** (try Mistral
Nemo → Meta Llama → Nova Micro → GPT-4o-mini in order, use the first
that succeeds). What's missing:

1. **Per-model exponential backoff.** When Mistral Nemo times out or
   gets rate-limited (429), we immediately move to Meta Llama instead
   of retrying the primary model with a 500ms → 1s → 2s backoff. The
   cross-model chain is good for "this model is permanently broken";
   backoff is good for "this model was transiently unavailable". They
   solve different problems and we want both.

3. **Try-again UX on `enrichBulletAction`.** The inline-issue popover
   shows an error string if the AI fails; the user has no way to
   retry without closing and reopening the popover.

4. **Try-again UX on `createVariantFromJdAction`.** The
   "Tailor with a JD" modal has form state (masterId + jdText), but on
   AI failure it just renders an error string — same gap as the
   resume-import flow had before Phase 1e.

Out of scope (parked):

- **Chat route idempotency** (`app/api/chat/route.ts`) — the user
  message is persisted BEFORE `streamText` runs, so a retry would
  duplicate. Needs a client-generated `messageId` + server-side
  dedupe. Bigger refactor; saved for a follow-up.
- **`saveResumeAction` retry** — saves a new revision row per call,
  so retries are safe (no idempotency gap), but client-side the
  editor already handles the "stale save" case via its own dirty
  flag. The action returns an error on network loss; the user can hit
  Ctrl+S again. No new UX needed.
- **Moving long AI work to Inngest** — already documented as a
  follow-up in `docs/plans/import-ux-and-timeouts.md §Future work`.

## Objective

Three coordinated fixes that close the gap surfaced by the Phase 1e
audit:

1. **Per-model exponential backoff** in `generateObjectWithFallbacks`
   and `generateTextWithFallbacks`. Retries only on transient
   failures (network, 429, 503, abort/timeout) — NOT on
   schema-validation failures, which fall through to the next model.
2. **Try-again UX** on the inline-issue popover for bullet
   enrichment. Re-submits the same inputs.
3. **Try-again UX** on the "Tailor with a JD" modal. Re-submits with
   the same masterId + jdText.

## User-visible behavior

### Per-model backoff

Invisible to the user when it works (the request succeeds on a retry
of the primary model with no extra latency they notice). When the
primary model is down, the cross-model fallback chain still kicks in
— backoff just adds a small delay before falling through.

### Try again on bullet enrichment

Before: popover shows error string + apply/close buttons. User has
to close + reopen to retry.

After: popover shows error + a "Try again" button that re-submits
with the same `resumeId`, `path`, `criterion`, and `currentText`.
While retrying, the popover shows the same loading state.

### Try again on JD variant creation

Before: modal shows the textarea + a one-line error if AI fails.
User has to re-paste the JD and click again.

After: modal shows the textarea (preserved) + an error card with a
"Try again" button. Same shape as the import-resume error card.

## Scope (in)

- `lib/ai/fallback.ts` — add `runWithRetry(model, options)` helper
  that wraps `generateObject` / `generateText` with exponential
  backoff. Used by both `generateObjectWithFallbacks` and
  `generateTextWithFallbacks`. Retries on transient errors only;
  validation failures short-circuit the retry loop.
- `components/inline-issue/inline-issue-popover.tsx` — add a
  "Try again" button to the error state. The popover's parent
  already manages the retry (calls `enrichBulletAction` again).
- `app/(dashboard)/dashboard/resumes/_components/create-variant-from-jd-button.tsx`
  — same error-card + Try-again pattern as
  `create-master-form.tsx`.

## Non-goals (out of this plan)

- **Idempotency keys on Server Actions.** Every retry today is
  safe-by-construction (the action either didn't start, or it
  completed and re-running is a no-op thanks to the discriminated
  union). No action currently has a "started but not finished"
  failure mode that would duplicate side effects. (Webhook dedupe
  handles Stripe's replay; chat dedupe is its own follow-up.)
- **Client-side exponential backoff for action invocations.**
  React's `useTransition` already gates concurrent actions;
  automatic client-side retry for user-initiated actions would
  mask real errors and confuse the user when the same thing
  happens 3 times silently. The user-initiated "Try again" button
  is the right knob.
- **Replacing the cross-model fallback chain.** It's good.
  Backoff is layered on top, not a replacement.

## Architecture

### Transient vs permanent error classification

`generateObject` / `generateText` throw on four error families:

| Family | Examples | Retry? |
|---|---|---|
| **Transient** | `ETIMEDOUT`, `ECONNRESET`, `fetch failed`, `429`, `503`, `AbortError` (timeout) | **Yes** — backoff |
| **Validation** | `NoObjectGeneratedError`, `AI_NoObjectGeneratedError` | No — fall through to next model (already handled) |
| **Auth/Config** | `401`, `403`, `no_api_key` | No — surface immediately |
| **Other** | Unknown SDK errors | No — surface immediately |

The classifier lives in `isTransientError(err)` in
`lib/ai/fallback.ts`. It's intentionally conservative: if we can't
classify the error, we don't retry (avoid masking real bugs).

### Backoff schedule

```
Attempt 1: try
  ↳ transient failure → wait 500ms → retry
Attempt 2: try
  ↳ transient failure → wait 1000ms → retry
Attempt 3: try
  ↳ transient failure → throw (caller falls through to next model)
```

Two retries per model. Worst-case latency added per model: 1.5s of
sleep + up to two more full call attempts (each potentially up to 90s
if the model times out again). The 90s per-model timeout already
caps the retry attempts.

The full worst case across the 4-model chain with 2 retries each:
- 8 AI calls × 90s + 7 × 500ms = 12 minutes
- But the existing 180s global cap (`parseResumeText` adds it; we'd
  extend it to all parsers in a follow-up) trims this in practice.

For now, backoff is local to each model's retry attempt — the 180s
global cap is still enforced by the caller.

### Retry telemetry

Each retry attempt logs to console with a structured tag so the
PostHog AI observability layer can pick it up:

```
[ai] mistral/mistral-nemo attempt 1/2 failed (transient: fetch failed), retrying in 500ms
[ai] mistral/mistral-nemo attempt 2/2 failed (transient: fetch failed), giving up
[ai] falling through to meta/llama-3.1-8b-instruct
```

## Files

- **Changed:**
  - `lib/ai/fallback.ts` — add `runWithRetry` + `isTransientError`.
    Use it from `generateObjectWithFallbacks` and
    `generateTextWithFallbacks`.
  - `components/inline-issue/inline-issue-popover.tsx` — add
    "Try again" button to the error state. (Read the file first to
    understand its shape.)
  - `app/(dashboard)/dashboard/resumes/_components/create-variant-from-jd-button.tsx`
    — add `try-again` affordance matching the import-form pattern.

## DB / schema

No changes.

## Dependencies

None.

## Acceptance criteria

1. When `generateObject` throws a transient error (mocked 429),
   the fallback chain retries the same model once before falling
   through. Test mocks 2 calls on the primary, 1 call on the first
   fallback.
2. When `generateObject` throws a validation failure, no retry
   happens (falls through immediately). Test mocks 1 call on the
   primary, 1 call on the first fallback.
3. The bullet-enrichment popover shows a "Try again" button when
   the AI fails. Clicking it re-submits the same inputs.
4. The JD-variant modal preserves the textarea content on error
   and shows a "Try again" button that re-submits.
5. All 984 existing tests pass; new tests add 3+ assertions.

## Test plan

- **Unit:** `tests/unit/ai-retry.test.ts`
  - Mocks a transient error on attempt 1, success on attempt 2.
    Asserts the model is called twice, the result is returned.
  - Mocks a transient error on attempts 1 AND 2, then a success
    on the FALLBACK model. Asserts the primary is called twice,
    the fallback once, the result comes from the fallback.
  - Mocks a validation error (non-transient). Asserts no retry,
    the primary is called once, fallback once, result from the
    fallback.
  - Mocks a non-transient non-validation error (e.g. auth). Asserts
    no retry, primary called once, the error propagates immediately.

- **Unit:** `tests/unit/inline-issue-popover.test.tsx` (new)
  - Asserts the "Try again" button is NOT visible in success state.
  - Asserts the "Try again" button IS visible in error state and
    clicks re-trigger the action.

- **Manual smoke:**
  - Force `enrichBulletAction` to fail by passing an empty bullet
    and verifying the popover error path. (Real retry path needs
    a fake API key.)
  - Force `createVariantFromJdAction` to fail by passing an empty
    JD; verify the error card + Try again.

## Rollback plan

Revert the commit. Pure code change, no data implications.

## Open questions

None. The transient-error classifier is the only one with judgment
calls; we keep it conservative (default = no retry) so a wrong
classification costs the user a couple of seconds, not a hang.