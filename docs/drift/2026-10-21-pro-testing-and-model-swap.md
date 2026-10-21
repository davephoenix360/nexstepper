# 2026-10-21 — Pro testing access + AI model re-verification and chat swap

## Context

We had been live for a few weeks with Pro gated behind a waitlist
(`2026-09-27-soft-launch-pro-gating.md`). The next step was turning Pro on for
the founder so the AI features it unlocks could actually be exercised, and
improving the chat agent's reasoning — which meant finally picking a chat
model on current evidence rather than on a 3-week-old snapshot.

That evidence gathering turned into the bulk of this branch.

## The trigger: doc rot, caught by calling instead of reading

`lib/ai/providers.ts` claimed `CHAT_MODEL = 'inclusionai/ling-3.1-flash'` was
`$0/$0` with a `free` endpoint tag. Re-running the account-level CLI on
2026-10-21:

```
inclusionai/ling-3.1-flash → novita, $0.30 in / $0.90 out per 1M, no `free` tag
```

At a heavy-user profile (10.8M in / 1.27M out per month) that is **~$4.38 per
user per month** — more than the subscription costs. The model had been
repriced under us and the comment had been left asserting the old number.

## What we did

### 1. Added Gateway credits, then called every candidate for real

Added credits to the Vercel AI Gateway account. Before that top-up, every paid
model returned:

```
403 Free tier users do not have access to this model. Upgrade to paid credits.
```

including `anthropic/claude-haiku-5.5` and `zai/glm-5.3-flash`. Worth stating
plainly: **there is no usable free-tier credit to rely on.** The previous
`$5/month free credit on the free tier, no card required` line in the
`providers.ts` header was simply wrong.

After the top-up, each candidate was probed with three real requests: a basic
completion, a strict `response_format: json_schema`, and a *forced*
`tool_choice`. Results:

| model | basic | strict schema | forced tool call |
|---|---|---|---|
| `anthropic/claude-haiku-5.5` | ✅ | ✅ schema-exact | ✅ clean args |
| `mistral/mistral-nemo` | ✅ | ✅ schema-exact | ⚠️ **prose narration, empty `tool_calls`, 2/3 runs** |
| `amazon/nova-micro` | ✅ | ✅ | ✅ clean, 0.41–0.63s |
| `reflection/beam-free` | ✅ | ✅ | ✅ best bullet rewrite of the set, $0 |
| `zai/glm-5.3-flash` | ✅ | ✅ | ✅, 20 healthy endpoints |
| `nvidia/nemotron-3.5-lightning-free` | ✅ | ⚠️ weak schema adherence | ✅, $0 |
| `inclusionai/ling-3.1-flash` | ✅ | ❌ `400 Bad Request` | ⚠️ **leaked reasoning into the args** |
| `meta/llama-3.1-8b` | ✅ | ❌ returned `{}` | ❌ `400 Bad Request` |
| `minimax/minimax-m3.1-flash` | ✅ | ❌ empty string | ❌ ignored `tool_choice` |

Three findings changed the plan:

- **Ling 3.1 Flash leaks its reasoning into tool arguments.** Asked to call
  `rewrite_bullet` it returned `{"bulletId":"b1","text":"The user is asking
  me to reply with "}`. `executeTool` would have written that narration onto
  the user's actual resume. A wrong price is a budget problem; a corrupted
  resume is a trust problem.
- **Nemo's tool calling is unreliable.** 2 of 3 failures. In the chat loop an
  empty `tool_calls` reads as "nothing to say", not "the call failed".
- **Nemo and `meta/llama-3.1-8b` can do strict JSON fine.** The parser side of
  the house was healthy; it only needed its fallback chain repaired.

### 2. Swapped the chat model

`CHAT_MODEL`: `inclusionai/ling-3.1-flash` → **`anthropic/claude-haiku-5.5`**.

Cheaper on **both** axes than what it replaced ($0.10 vs $0.30 in, $0.50 vs
$0.90 out), a stronger reasoner, 1M context instead of 262K, and 4 real
endpoints instead of 1. The rare case where moving up in quality is also moving
down in cost — the free-tier Ling flash was subsidising itself, and that
subsidy ended.

### 3. Rewrote both fallback chains against verified behaviour

```
PARSER_MODEL    = mistral/mistral-nemo
PARSE_FALLBACKS = reflection/beam-free → amazon/nova-micro → openai/gpt-4o-mini
CHAT_MODEL      = anthropic/claude-haiku-5.5
CHAT_FALLBACKS  = reflection/beam-free → amazon/nova-micro
                → zai/glm-5.3-flash → nvidia/nemotron-3.5-lightning-free
```

- `meta/llama-3.1-8b` **removed** from the parser chain. It cannot emit valid
  JSON for our schema, so it converted a clean model 403 into a confusing Zod
  error. Replaced with `reflection/beam-free` ($0, schema-exact).
- `mistral/mistral-nemo` **removed** from the chat chain despite being
  "proven on this account" — it's only proven for parsing.
- Every chat fallback is from a different provider, and the chain deliberately
  starts with **$0 models** so that credits running out degrades quality
  instead of taking Pro down. `vercel ai-gateway budgets ls` is empty — there
  is no Gateway-level spend ceiling either.

### 4. Added a Pro daily token cap

`PLANS.pro.chatMessagesPerDay` was `Infinity` with **no** spend ceiling. At
~$0.10/$0.50 per 1M that is an unbounded bill: one runaway agent loop could
exceed a full month of subscription revenue alone.

- `PLANS.*.chatTokensPerDay` added — `500_000` for Pro, `300_000` for Free as
  a safety net (20 turns × ~10K tokens is ~200K, so the turn limit still binds
  first for ordinary users).
- The gate lives inside the existing `tryConsumeChatTurn` upsert, as a second
  predicate on the same `ON CONFLICT ... WHERE`. Putting it in the route would
  have reintroduced the exact TOCTOU race that function exists to prevent.
- **It is a soft cap, deliberately.** `tokens_used` is only written after a
  stream drains, so the gate reads the previous turn's total and a user can
  overshoot by roughly one turn. Bounding worst-case spend is worth more here
  than exact metering; the alternative is holding a row lock open across a
  multi-second model call.

### 5. Made the cap visible

Wiring the cap exposed a bug before anyone hit it. The only user-facing quota
surface is `ChatInput`'s *"N / M messages remaining today"* — a **turn**
counter, which is `null` on an unlimited-turn Pro plan. So the cap would have
rejected a Pro user's send with **nothing on screen**, and the send would look
like it silently did nothing.

- `lib/billing/chat-quota.ts` — pure `decideChatQuotaRejection()` returning
  `TOKEN_LIMIT_REACHED` vs `RATE_LIMITED`, so the two events are
  distinguishable and unit-testable without standing up the route.
- `notice` threaded `chat-bubble → chat-window → chat-input`, rendered above
  the readout and cleared optimistically on the next send.

### 6. Fixed the privacy policy

`app/(legal)/privacy/page.tsx` names our AI subprocessors explicitly and was
listing `meta/llama-3.1-8b` as first fallback. Corrected to the real chain.

⚠️ **This adds Anthropic as a new subprocessor**, and the same page promises
*"30 days' notice via email before adding a new subprocessor that handles
personal data."* Chat already sent resume content to a third-party model
provider before this change, so Anthropic is not a new *category* — but it is
a new named processor, and the notice obligation is real. **Send the notice
before this ships to production.**

### 7. `scripts/grant-founder-pro.cjs`

Flips a user's `subscriptions` row to `pro`/`active` without a Stripe
purchase. Lists users when run bare; refuses to run against a host that looks
like production. Note the explicit tradeoff in the script header: this does
**not** exercise `createCheckoutSession` or the webhook, so the upgrade path
stays unverified until a real customer buys.

## Pricing decision: Pro is $5/mo

| | avg heavy user | worst case (cap maxed daily) |
|---|---|---|
| AI cost/user/mo | ~$1.68 | ~$2.10 |
| **margin at $3** | 44% | **30%** |
| **margin at $5** | 66% | **58%** |

At $3 we're betting no user ever maxes the cap. At $5 there's ~2.4x headroom
while real usage is still unknown. The pricing page reads the amount live from
Stripe (`getStripePrices()`), so this is a Dashboard change, not a code change.

## Honest notes

- **The chat model swap is not visually verified.** No end-to-end run of the
  assistant against a real resume. It is verified at the API layer (real tool
  calls, clean args) and by unit tests, but the actual editing flow needs a
  human pass before trusting it.
- **The token cap number is an estimate.** 500K/day is derived from assumed
  usage profiles, not measured ones. PostHog AI observability will produce the
  real distribution; recalibrate once there's a week of data.
- **`zai/glm-5.3-flash` is not fully evaluated.** It has 20 healthy endpoints
  at $0.06/$0.20 — potentially the best margin play in the catalogue. We only
  smoke-tested it. A proper A/B against Haiku using the existing 50-triple
  corpus at `tests/fixtures/ats-corpus.json` is the obvious next step and is
  deliberately *not* done here.
- **Two Neon projects, one host.** Both `.env` and `.env.local` resolve to the
  same endpoint, `ep-long-base-ajm4kkqm...`, which does not match AGENTS.md's
  claim of separate dev/prod projects. The founder row on that database is
  already `plan: 'pro', status: 'trialing'`. **No subscription write was
  performed** — which database production reads from needs confirming first,
  and `trialing` already satisfies `isProEffective()`.
- **`vercel ai-gateway budgets ls` is empty.** No Gateway-level spend ceiling
  exists. Recommended, not done.

## Verification

- `pnpm typecheck` — clean.
- `pnpm test` — **1678 passed / 127 files**.
- `pnpm build` — clean.
- 19 new tests: 9 pinning live-verified model properties (including that
  `ling-3.1-flash` never returns as `CHAT_MODEL`, that `mistral-mistral-nemo`
  never returns to the chat chain, and that a $0 model is always present), 10
  pinning the quota decision and the `PLANS` margin invariant.

## Files

- **New:** `docs/drift/2026-10-21-pro-testing-and-model-swap.md`,
  `lib/billing/chat-quota.ts`,
  `tests/unit/billing/chat-quota.test.ts`,
  `scripts/grant-founder-pro.cjs`
- **Changed:** `lib/ai/providers.ts`, `lib/db/schema.ts`, `lib/db/queries.ts`,
  `app/api/chat/route.ts`, `components/chat/chat-bubble.tsx`,
  `components/chat/chat-window.tsx`, `components/chat/chat-input.tsx`,
  `app/(legal)/privacy/page.tsx`, `docs/ai-models-reference.md`, `AGENTS.md`