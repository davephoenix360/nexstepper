# 0001 — Migrate AI routes to Vercel AI Gateway

## Context

The rebuild plan called for `Anthropic Claude Sonnet` via `@ai-sdk/anthropic`
directly. Two weeks into the project we discovered that route hits
two friction points for a solo founder pre-launch:

1. **Key coverage gaps.** Claude Sonnet 4.5 and Claude Haiku 4.5 are paid
   only. Free-tier keys on the Gateway are explicitly blocked from them.
   Google Gemini 2.5 Flash (the planned "free escape hatch") was hitting
   30-60s latency spikes via Vertex AI routing on the Gateway. Z.AI GLM
   5.3 Flash was also blocked despite marketing claims of free-tier
   availability.
2. **No cross-provider failover.** A single bad Gemini cold start would
   surface to the user as a 30s spinner. No fallback was wired.

We needed a single entry point that (a) worked on the free tier, (b)
auto-fell-back across providers when one had a bad day, (c) didn't
require a separate key per provider, and (d) gave us a single dashboard
for spend + latency.

## Decision

Route every AI call through **Vercel AI Gateway** (`@ai-sdk/gateway@3`)
using the AI SDK 6 `generateObject` / `streamText` APIs. Model
selection lives in one file (`lib/ai/providers.ts`) with named constants
(`JD_PARSER_MODEL`, `RESUME_PARSER_MODEL`, `OPTIMIZE_MODEL`) and a
`getModel(modelId)` resolver.

Primary model is `inclusionai/ling-3.0-flash-fin-free` (verified free
tier via `npx vercel@latest ai-gateway models list --json`). The
fallback chain is the four CLI-confirmed free-tier models: three
`inclusionai/ling-3.0-flash-*` variants plus
`poolside/laguna-s-2.1-free`.

A custom `generateObjectWithFallbacks` helper in `lib/ai/fallback.ts`
walks the chain, preserves usage metadata, and skips fallback on
schema-validation failures (a model producing wrong-shape output is a
model problem, not an infra problem — switching providers won't help).

We pin `@ai-sdk/gateway@3` (AI SDK 6 compatible). `@ai-sdk/gateway@4`
is for AI SDK 7 only and returns `LanguageModelV4`, which AI SDK 6
rejects. Both `ai` and `@ai-sdk/gateway` bump together when we move to
SDK 7.

## Consequences

**Good:**

- One env var (`AI_GATEWAY_API_KEY`) gives us access to 275+ models
  across Anthropic, OpenAI, Google, Mistral, DeepSeek, etc.
- 0% markup on tokens; free tier covers our current usage
  (~$5/mo credit, no card required).
- Automatic cross-provider failover. When a model has a bad day, the
  next one in the chain picks up — user never sees a 30s spinner.
- Spend + latency observability in the Vercel dashboard for free.
- Swapping providers is a one-line change in `lib/ai/providers.ts`.
- All models confirmed-free as of 2026-09-18 are documented in
  [`docs/ai-models-reference.md`](../ai-models-reference.md) — the
  "which model should I pick?" handbook for future decisions.

**Bad:**

- Free-tier model quality is uneven. We have not A/B tested the
  selected primary against paid Sonnet for the Optimize UX; that's
  queued behind the Optimize work-highlights + tier-gate follow-up.
- The fallback chain adds latency on hard failures (each provider
  cold-start is independent). For Optimize v0 we wrap the call in a
  90s `AbortSignal` to avoid stalling the user.
- If Vercel AI Gateway goes down, we go down. No direct-provider
  escape hatch.

## Alternatives considered

- **Direct `@ai-sdk/anthropic`.** Original pick. Loses free-tier
  coverage and the failover story. We can still go this route once we
  add a credit card and want Sonnet quality — switching is a
  one-line change in `lib/ai/providers.ts`.
- **Port to LangChain.** The rebuild plan called out LangChain 1.x as
  the alternative. Rejected: it's heavier than what we need and the AI
  SDK 6 `generateObject` with Zod is a clean fit for our output
  schemas.
- **Multiple SDKs per provider.** Maximizes control, multiplies the
  number of API keys we manage. Rejected for solo-founder simplicity.
