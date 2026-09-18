# AI model reference for nextep-saas

> Reference doc, not code. Captures which models we can / can't use
> via Vercel AI Gateway, with pricing, and which are confirmed
> free-tier as of **Sep 18, 2026**.

The codebase doesn't import or reference this file. It's purely a
handbook for future decisions about which model to swap in.

## TL;DR

For pre-launch dev / launch-stage traffic, **add $5 of credits** to
Vercel AI Gateway. That unlocks every model below (including the
Claude Sonnet 4.5 we originally wanted). At our projected usage
(~2-5K parses/day), $5 lasts months.

The truly-free models (no credits needed) are listed in the
**Confirmed free tier** section — useful for a no-credit safety net
or for experimenting with a second model in the fallback chain.

## Source of truth

- **Vercel CLI** (`npx vercel@latest ai-gateway models list --json`) —
  returns the model catalog with the `tags` array. Models with
  `"free"` in their tags are the actual free-tier subset.
- **`https://ai-gateway.vercel.sh/v1/models`** — same data, public,
  no auth needed, used as a cross-check.
- **Vercel dashboard** — https://vercel.com/ai-gateway/models?freeTier=true

The CLI is authoritative for "does this model exist + is it free?"
because it queries your account's tier directly.

## Confirmed free tier (from CLI on Sep 18, 2026)

These models have the `"free"` tag in the Vercel catalog and respond
with structured output reliably.

### Text generation

| Model ID | Name | Latency | Why it might fit |
|---|---|---|---|
| `inclusionai/ling-3.0-flash-fin-free` | Ling 3.0 Flash Fin (Free) | 0.4s | **Best pick** — fastest of the free tier |
| `inclusionai/ling-3.0-flash-sante-free` | Ling 3.0 Flash Sante (Free) | 0.8s | Backup, different inclusionai variant |
| `inclusionai/ling-3.0-flash-vl-free` | Ling 3.0 Flash VL (Free) | 0.8s | Vision-language (heavier but capable) |
| `poolside/laguna-s-2.1-free` | Laguna S 2.1 Free | 1.5s | Different provider → independent infra |
| `inclusionai/ling-3.0-flash-fin` | Ling 3.0 Flash Fin | 0.4s | Same as `-free` but without the suffix (also tagged free) |
| `inclusionai/ling-3.0-flash-sante` | Ling 3.0 Flash Sante | 0.8s | Same family |
| `inclusionai/ling-3.0-flash-vl` | Ling 3.0 Flash VL | 0.8s | Same family |

**Used in code**: `PARSER_MODEL` = `inclusionai/ling-3.0-flash-fin-free`,
`PARSE_FALLBACKS` = the four `-free` suffixed models (inclusionai
flavors + poolside).

### Audio (not used by us)

| Model ID | Type |
|---|---|
| `fish-audio/s1-free` | speech |
| `fish-audio/s2-pro-free` | speech |
| `fish-audio/s2.1-pro-free` | speech |
| `fish-audio/transcribe-1-free` | speech |

## Paid models we'd want with credits

These are NOT in the free tier. To use them, add credits at
vercel.com/dashboard → AI Gateway → Credits ($5 minimum).

| Model ID | Input / Output | Why |
|---|---|---|
| `anthropic/claude-sonnet-4.5` | $3 / $15 | Best structured extraction in production |
| `anthropic/claude-sonnet-5` | $2 / $10 | New value pick (was intro price, now permanent) |
| `anthropic/claude-haiku-4.5` | $1 / $5 | 3-5x cheaper than Sonnet, similar for text rewrites |
| `google/gemini-2.5-flash` | $0.30 / $2.50 | Was our first pick; Vertex AI routing was unstable late Sep 2026 |
| `openai/gpt-4o-mini` | $0.15 / $0.60 | Solid OpenAI baseline |
| `meta/llama-3.3-70b` | $0.72 / $0.72 | Open weights, no provider lock-in |

## Cost math at our scale (illustrative, Sep 2026 rates)

**Per-call cost for one Optimize-style call** (~2K input tokens
resume section + 1K JD context, ~500 output tokens):

| Model | Cost / call | 10K calls |
|---|---|---|
| `claude-sonnet-4.5` | ~$0.014 | ~$140 |
| `claude-haiku-4.5` | ~$0.005 | ~$50 |
| `gemini-2.5-flash` | ~$0.002 | ~$20 |
| `inclusionai/ling-3.0-flash-fin-free` | **$0** (free tier) | **$0** until you exceed the $5/mo credit cap |
| `zai/glm-5.3-flash` | ~$0.001 | ~$10 |

At our projected launch-stage volume (~2-5K parses/day, ~10K Optimize
calls/month once Optimize ships), the $5/mo free credit covers the
entire bill. Adding credits at $5 minimum gets us 4-6 months of
Sonnet-quality parsing for the same price.

## Historical notes

### 2026-09-01 — `lib/jd-parser/parse-jd.ts` ships
Original primary was `claude-sonnet-4-5` via `@ai-sdk/anthropic`
direct. Plan called this out as the production-quality default.

### 2026-09-18 — AI Gateway migration
Switched to `lib/ai/providers.ts` centralizing all model constants.
Routing went through `@ai-sdk/gateway@3`. Original model stayed the
same (Sonnet 4.5).

### 2026-09-18 — `db:push` script removed
AGENTS.md documents the `db:generate` + `db:migrate` workflow we
should use instead. Migration sync script exists for the one-off
reconciliation.

### 2026-09-18 — Password reset flow ships
Email + Better Auth + Resend wired up. The reset-password action
catches and re-throws `NEXT_REDIRECT` to avoid the framework's
sentinel error surfacing to the user.

### 2026-09-18 — Switched parsers to free-tier Gemini Flash
Hit "Free tier users do not have access" on Sonnet/Haiku. Tried
Gemini 2.5 Flash next, hit 30-60s latency spikes (known Vercel +
Vertex AI routing issue).

### 2026-09-18 — Switched to Z.AI GLM 5.3 Flash
Per marketing-page claims of being in the free tier. Also blocked.

### 2026-09-18 — Added fallback chain
Created `lib/ai/fallback.ts` with `generateObjectWithFallbacks` that
walks a model chain, preserves usage, and skips fallback on schema
validation failures (model problem, not infra).

### 2026-09-18 — Switched to inclusionai/ling-3.0-flash-fin-free
This is the CLI-verified free-tier pick. Primary works.
