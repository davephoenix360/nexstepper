import 'server-only';

import { randomUUID } from 'node:crypto';
import { withTracing } from '@posthog/ai';
import { gateway } from '@ai-sdk/gateway';
import type { LanguageModel } from 'ai';

import { posthogServer } from '@/lib/posthog/server';
import type { PlanId } from '@/lib/billing/types';

/**
 * Centralized AI model registry.
 *
 * Why a single file:
 *  - All model strings live in one place → swap a model by changing
 *    one constant, not by grepping the codebase.
 *  - Provider routing is consistent → every AI call in the app goes
 *    through the same gateway abstraction, so we get Vercel AI
 *    Gateway's free observability and free failover across the
 *    entire app.
 *  - Fallback chains are explicit → see `PARSER_FALLBACKS` below
 *    (used via the AI SDK's `providerOptions.gateway.models`
 *    declarative fallback chain).
 *
 * ## Why Vercel AI Gateway (not direct @ai-sdk/anthropic)
 *
 * - One key for hundreds of models (`AI_GATEWAY_API_KEY` env var).
 * - 0% markup on tokens — same provider list price.
 * - Automatic cross-provider failover via the `models` array
 *   (providerOptions.gateway.models — see AI SDK docs).
 * - Built-in spend / latency / token observability in the Vercel
 *   dashboard, with custom reporting API and budget alerts.
 * - `vercel ai-gateway budgets` gives us a metered spend ceiling per
 *   scope — use it as a backstop behind our own per-user cap.
 *
 * ⚠️ There is **no** usable "free tier credit" to rely on. Without a
 * top-up the account is on Vercel's free tier, and most paid models
 * return `403 Free tier users do not have access to this model` —
 * including `anthropic/claude-haiku-5.5` and `zai/glm-5.3-flash`
 * (both re-verified 2026-10-21). The account currently has paid
 * credits. If they run out, `CHAT_FALLBACKS` degrades to the $0
 * models rather than failing — see that chain's comments.
 *
 * Reference: `NEXTEP_REBUILD_PLAN.md` + the 2026 AI landscape
 * research in `output/deep-research/20260901_222225_ai-integration-options/`.
 *
 * ## Why mistral/mistral-nemo as primary (changed 2026-09-18)
 *
 * After extensive model churn (Claude → Gemini Flash → Z.AI →
 * inclusionai / poolside → openai/gpt-4o-mini), we landed on
 * Mistral. The trigger was a `max_output_tokens` cap on
 * `openai/gpt-4o-mini` via Vercel AI Gateway that produced
 * empty `text: ""` responses with `finishReason: length` even
 * with `max_output_tokens: 12000` set in the request — the
 * strict `response_format: json_schema` mode appears to
 * override the per-call cap with a free-tier lower limit.
 * Mistral's structured-output path doesn't have this trap.
 *
 * `mistral/mistral-nemo` is the new sweet spot:
 *   1. JSON mode handles large structured schemas reliably
 *      (the resume parser is one of the largest in the app)
 *   2. Cross-provider diversification: Mistral isn't used
 *      anywhere else in the app, so a Mistral outage is
 *      independent of OpenAI / Anthropic incidents
 *   3. Cheapest reliable structured-output model we can reach
 *   4. Fast enough for interactive use
 *
 * ## Re-verified 2026-10-21 (live calls, this account)
 *
 * It got *better* since it was adopted, which is why it stays:
 *
 * | | 2026-09-18 claim | 2026-10-21 actual |
 * |---|---|---|
 * | price | $0.04 / $0.17 per 1M | **$0.03 / $0.03** |
 * | context | 60K | **131,072** |
 * | structured output | yes | yes (schema-exact) |
 * | tool use | "yes" in catalog | ⚠️ **unreliable — see below** |
 * | TTFT | ~0.3s | 389–507ms |
 *
 * ⚠️ The catalog advertises `tool-use` for this model and it mostly
 * is, but on 2 of 3 live tool calls (2026-10-21) it narrated the
 * call as prose text with an **empty `tool_calls` array** —
 * `짐작 {"name":"rewrite_bullet","arguments":{…}}` — instead of
 * emitting a real tool call. It is therefore **parser-only here**,
 * and must never appear in `CHAT_FALLBACKS`, where an empty
 * `tool_calls` reads to the chat loop as "the model had nothing to
 * say" rather than "the model failed to call the tool".
 *
 * `openai/gpt-4o-mini` is now the LAST fallback (not the
 * primary) — when Vercel gives us credits and lifts the
 * output cap, we can swap it back as primary.
 *
 * ## STANDING RULE — these comments are historical notes, not truth
 *
 * Every price, latency and capability claim in this file is a
 * **snapshot taken on a specific date** and it rots. Model
 * availability and pricing on the Vercel AI Gateway have changed
 * under us at least four times.
 *
 * Concrete evidence of the rot, all on this account:
 *
 * | date | what we believed | reality |
 * |---|---|---|
 * | 2026-09-18 | `zai/glm-5.3-flash` is free (per the vercel.com browser page) | `403 Free tier users do not have access` |
 * | 2026-10-01 | `inclusionai/ling-3.0-flash-fin-free` is free (per the CLI's own free listing) | `403`, and the id left the catalog |
 * | 2026-10-21 | `reflection/beam-free` carries a `free` tag in the catalog | `403` until credits were added |
 * | 2026-10-21 | `inclusionai/ling-3.1-flash` is `$0/$0`, `free`-tagged (this file, below) | `$0.30/$0.90`, tag gone |
 *
 * **Re-verify before you plan against anything written here:**
 *
 * ```powershell
 * npx --yes vercel@latest ai-gateway models endpoints <model-id> --format json
 * ```
 *
 * Two rules that follow from the table:
 *
 * 1. `endpoints` (account-level, authenticated) beats `models ls`
 *    (global catalog) beats the vercel.com browser page. When they
 *    disagree, `endpoints` wins.
 * 2. A `free` tag is NOT proof a model is callable. Call it.
 *    A capability claim (structured output, tool use) is also not
 *    proof. Call it with the actual payload.
 *
 * A model is only "free for this account" when the call succeeds
 * AND the endpoint is priced at 0. When it 403s, that means the
 * account has no paid credits at all — not that the model is bad.
 *
 * ## What we've tried and why we moved away
 *
 * - `anthropic/claude-sonnet-4.5` and `anthropic/claude-haiku-4.5`:
 *     Not in Vercel's free tier. Error: "Free tier users do not have
 *     access to this model. Upgrade to paid credits."
 *
 * - `google/gemini-2.5-flash`: Was in the free tier initially but
 *     became unreliable in late Sep 2026 — Vercel's Google Vertex
 *     AI routing had a known degradation causing 30-60s latencies.
 *
 * - `zai/glm-5.3-flash`: NOT callable without paid credits (the
 *     model browser page suggests otherwise). Re-verified 403 on
 *     2026-10-21. It IS a good model once you have credits —
 *     20 healthy endpoints, verified structured output + tool use,
 *     $0.06/$0.20 on its cheapest backend. It is in `CHAT_FALLBACKS`
 *     for that reason, not in `PARSE_FALLBACKS`.
 *
 * - `inclusionai/ling-3.0-flash-fin-free` and friends: Listed in
 *     the CLI as free tier, but this account got "Free tier users
 *     do not have access" when actually calling.
 *
 * - `inclusionai/ling-3.0-flash-fin` (no `-free` suffix): callable
 *     but its structured output took **48.8 seconds** on a live call
 *     (2026-10-21). Correctness without usable latency is not a
 *     fallback.
 *
 * - `openai/gpt-4o-mini` (was primary until 2026-09-18): Hit a
 *     `max_output_tokens` cap during strict `response_format:
 *     json_schema` calls that produced empty text responses even
 *     when `maxOutputTokens: 12000` was set in the request. The
 *     Gateway appears to override the cap with a free-tier limit.
 *
 * - `minimax/minimax-m3.1-flash`: callable and $0, but on a live
 *     call (2026-10-21) it returned an empty string for a strict
 *     json_schema and **ignored a forced `tool_choice`**, replying
 *     with prose instead. Advertised `structured-output` +
 *     `tool-use` tags, delivers neither. Not usable here.
 *
 * ## The fallback chain (PARSE_FALLBACKS)
 *
 * Our fallback (see `lib/ai/fallback.ts`) walks the chain when the
 * primary fails. Every fallback is from a DIFFERENT provider so
 * we don't share a single infrastructure failure mode:
 *
 *   1. `reflection/beam-free`   — $0/$0, Reflection, 0.3-1.2s
 *   2. `amazon/nova-micro`      — $0.04/$0.14, Amazon, 0.4s
 *   3. `openai/gpt-4o-mini`     — $0.15/$0.60, OpenAI (capped)
 *
 * (`meta/llama-3.1-8b` was #1 until 2026-10-21 — removed, see
 * `PARSE_FALLBACKS` below for the live-call evidence.)
 *
 * If all four fail, we surface it as `ai_failure`.
 *
 * NOTE: this list and `app/(legal)/privacy/page.tsx` name the same
 * subprocessors. Changing one without the other leaves the privacy
 * policy describing a chain we no longer call.
 *
 * ## Switching to Claude (once the team prefers it)
 *
 * Change `PARSER_MODEL` to `'anthropic/claude-sonnet-4.5'` and
 * `PARSE_FALLBACKS` to `[Haiku]`. The call sites don't change.
 */

/**
 * Primary model for both parsers. Quality-critical structured
 * extraction. See the doc comment above for the rationale.
 */
export const PARSER_MODEL = 'mistral/mistral-nemo';

/**
 * Fallback chain for parser calls. The gateway tries each in
 * order when the previous model fails or times out.
 *
 * Each fallback is from a DIFFERENT provider so we get
 * independent infrastructure failure modes. They're all in
 * the cheap-tier (under $0.20/M input) so the fallback chain
 * costs essentially nothing even if exercised heavily.
 *
 * ## Why `meta/llama-3.1-8b` was removed (2026-10-21)
 *
 * It was in this chain as the first fallback. A live call on
 * 2026-10-21 proved it cannot do this chain's one job:
 *
 *   - strict `response_format: json_schema` → returned `{ }`,
 *     an object that satisfies nothing in our schema;
 *   - tool calls → `400 Bad Request`.
 *
 * A parser fallback that cannot emit valid JSON is worse than no
 * fallback at all — it converts a clean model 403 into a confusing
 * Zod validation error that looks like a prompt bug. `lib/ai/fallback.ts`
 * does skip the chain on schema-validation failure, so it degraded
 * to `ai_failure` rather than a wrong parse, but it still cost a
 * round trip to learn nothing.
 *
 * ## How each entry was verified
 *
 * `verified 2026-10-21` means: called for real against
 * `https://ai-gateway.vercel.sh/v1/chat/completions` with a strict
 * json_schema and a forced tool call, on this account, and returned
 * schema-conformant JSON. Do not add a model here on the strength of
 * a catalog `tags` array — see the standing rule in the header.
 */
export const PARSE_FALLBACKS: readonly string[] = [
  'reflection/beam-free',
  'amazon/nova-micro',
  'openai/gpt-4o-mini'
] as const;

/**
 * Legacy aliases for backwards compatibility with callers that
 * imported the per-parser constants. Both parsers use the same
 * model + fallback chain today.
 *
 * Don't reference these in new code — use PARSER_MODEL and
 * PARSE_FALLBACKS directly.
 */
export const JD_PARSER_MODEL = PARSER_MODEL;
export const RESUME_PARSER_MODEL = PARSER_MODEL;

/**
 * Model for the JD Markdown formatter (Plan B,
 * `docs/plans/jd-markdown-format.md`). The formatter turns raw JD
 * text into well-structured Markdown for the variant editor's
 * right-rail panel.
 *
 * Same free-tier primary as the parsers — Markdown restructuring
 * is a small, low-risk job that doesn't justify burning a different
 * (paid) model. Swap to a higher-quality model if real-world
 * formatting quality proves insufficient (acceptance criterion #1).
 */
export const JD_FORMATTER_MODEL = PARSER_MODEL;

/**
 * Fallback chain for the JD Markdown formatter. Same chain as
 * `PARSE_FALLBACKS` so we get cross-provider diversification
 * without paying for a second fallback chain's worth of cold-cache
 * model loads. The formatter is a small job (≤16K char input,
 * ≤4K char output), so we keep latency tight and only retry once
 * before surfacing `ai_failure`.
 */
export const JD_FORMATTER_FALLBACKS: readonly string[] = PARSE_FALLBACKS;

/**
 * v2 intent extractor (ATS scoring v2 — Phase 1). Same primary model
 * as the parser / formatter (we already know Mistral Nemo handles
 * structured output reliably on the free tier, ~$0.0002/JD), same
 * fallback chain for cross-provider failover. The extractor prompt
 * is small (≤16K char input, ≤2K char output JSON) so latency is
 * tighter than the full parser.
 *
 * Plan: docs/plans/ats-scoring-v2.md
 */
export const JD_INTENT_EXTRACTOR_MODEL = PARSER_MODEL;

/**
 * Fallback chain for the v2 intent extractor. Same shape as
 * `PARSE_FALLBACKS` so we get the same cross-provider diversification
 * without paying for a second fallback chain's worth of cold-cache
 * model loads. The extractor is cheaper than the parser (smaller
 * output, fewer fields), so we keep latency tight.
 */
export const JD_INTENT_EXTRACTOR_FALLBACKS: readonly string[] = PARSE_FALLBACKS;

// ─── Chat assistant (agentic) — added 2026-10-01, swapped 2026-10-21 ──────────

/**
 * Primary model for the **chat assistant only** (NOT the parsers).
 *
 * ## Why the chat needs a different model from the parser
 *
 * `PARSER_MODEL` (mistral/mistral-nemo) is a **12B** model chosen for one-shot
 * strict-JSON extraction of a very large schema. That constraint does not
 * apply to chat, which uses plain tool definitions. Chat needs the opposite
 * qualities: multi-turn instruction following, reliable tool calls, and enough
 * context to hold a whole resume plus a conversation.
 *
 * ## Why it moved off `inclusionai/ling-3.1-flash` (2026-10-21)
 *
 * Three independent reasons, in order of severity:
 *
 *  1. **It is no longer free.** On 2026-10-01 it was verified `$0/$0` with a
 *     `free` endpoint tag. On 2026-10-21 the same command reports
 *     **`$0.30 in / $0.90 out` per 1M** and the tag is gone. At an assumed
 *     heavy-user profile (10.8M in / 1.27M out per month) that is
 *     **~$4.38/user/month** — more than a $5 Pro subscription costs.
 *  2. **It has no structured output** (`400 Bad Request` on a strict
 *     json_schema, live call). That is *why* it could never be the parser,
 *     and it stays that way.
 *  3. **It leaks its reasoning into tool arguments.** Asked to call
 *     `rewrite_bullet`, it returned
 *     `{"bulletId":"b1","text":"The user is asking me to reply with "}`.
 *     Our `executeTool` would have written that narration onto the user's
 *     resume. This is the failure that actually mattered — a wrong price is
 *     a budget problem, a corrupted resume is a trust problem.
 *
 * ## The replacement, and why it is also cheaper
 *
 * `anthropic/claude-haiku-5.5` costs **less on both axes** than the model it
 * replaces ($0.10 vs $0.30 in, $0.50 vs $0.90 out) while being a stronger
 * reasoner. This is the rare case where moving up in quality is also moving
 * down in cost — the free tier Ling flash was subsidising itself, and that
 * subsidy ended.
 *
 * Live-verified on this account 2026-10-21 (basic, strict json_schema,
 * forced tool call):
 *
 * | model                    | in/out        | ctx    | tool-use | structured-output | notes                    |
 * |--------------------------|---------------|--------|----------|-------------------|--------------------------|
 * | `anthropic/claude-haiku-5.5` | $0.10/$0.50 | 1M     | yes      | yes               | **4 endpoints**, 0.78–1.18s TTFT, 99.99% uptime 1d |
 * | `zai/glm-5.3-flash`      | $0.06–0.45/$0.20–1.50 | 1M | yes   | yes               | 20 endpoints — best failover diversity we can buy |
 * | `amazon/nova-micro`      | $0.04/$0.14   | 128K   | yes      | yes               | fast (2.0s) but hard-errors 2 of 5 on the real edit tool |
 * | `reflection/beam-free`   | $0/$0         | 1M     | yes      | yes               | $0, single free endpoint — but it stalls (asks) 3 of 5 |
 * | `nvidia/nemotron-3.5-lightning-free` | $0/$0 | 1M | yes   | weak              | $0, weak schema adherence, wasteful output, never edited in 5 tries |
 * | `mistral/mistral-nemo`   | $0.03/$0.03   | 131K   | **flaky**| yes               | ❌ parser-only — see above |
 *
 * ⚠️ **The `tool-use` column above is from a FORCED `tool_choice` call
 * against a SIMPLE tool.** That proves a model *can* emit a tool call. It
 * does not prove the model *chooses* to call one — which is the actual job
 * for the chat agent, which is never forced and which faces the large
 * nested `editResume` schema. Re-measured properly on 2026-11-01 (unforced,
 * real schema, real system prompt, 5 attempts each): see the
 * `CHAT_FALLBACKS` block below for the numbers and the resulting order.
 * A forced call is not the capability the agent needs.
 *
 * The context window matters more than it looks: every chat turn re-sends the
 * full resume, so a small window makes the agent truncate and start
 * "forgetting" the user's own data. 1M removes that failure mode entirely.
 *
 * Plan: docs/plans/chat-agent-v2.md
 * Drift: docs/drift/2026-10-21-pro-testing-and-model-swap.md
 */
export const CHAT_MODEL = 'anthropic/claude-haiku-5.5';

/**
 * Fallback chain for the chat assistant, tried in order.
 *
 * Every entry is from a DIFFERENT provider so one upstream incident can't take
 * chat down.
 *
 * ## How this chain is ordered (re-measured 2026-11-01)
 *
 * The previous order was sorted by COST: the $0 model first, then the cheap
 * ones. That turned out to be the wrong axis. A 2026-11-01 probe of the real
 * agent loop — an UNFORCED tool call, the real `inputSchema` for every chat
 * tool, the real system prompt, 5 attempts per model — ranked them by
 * RELIABILITY instead:
 *
 * | model                        | edited | leak | narrate | badArgs | errors | median |
 * |------------------------------|--------|------|---------|---------|--------|--------|
 * | `anthropic/claude-haiku-5.5` | 5/5    | 0    | 0       | 0       | 0      | 5.6s   |
 * | `amazon/nova-micro`          | 5/5    | 0    | 0       | 0       | 0      | 2.7s   |
 * | `zai/glm-5.3-flash`          | 5/5    | 0    | 0       | 0       | 0      | 23.0s  |
 * | `reflection/beam-free`       | 3/5    | 0    | 0       | 0       | 0      | 8.2s   |
 * | `nvidia/nemotron-3.5-lightning-free` | 3/5 | 0 | 0      | 0       | 0      | 6.4s   |
 *
 * ("edited" = the SDK's `execute` callback ran for `editResume` AND the
 * arguments parsed against the real schema. "leak" = the model put its own
 * reasoning where the resume text goes — the merge would write it onto the
 * resume. "narrate" = it replied "Done, I changed it" without calling any
 * tool at all.)
 *
 * ### What the measurement changed
 *
 *  1. **Zero narrations and zero payload leaks, everywhere.** Across every
 *     model and every attempt. The failure this file used to fear — a
 *     confident "Done, I rewrote it" with nothing changed — does not
 *     happen. The models that do not edit instead ASK a clarifying
 *     question ("the bullet already has a metric — what outcome do you
 *     want to lead with?"), which is honest and is the agent's designed
 *     `needs-you` behaviour.
 *  2. **`amazon/nova-micro` moved to first.** It edits 5 of 5 and is the
 *     fastest caller in the set at 2.7s. It used to sit second, behind a
 *     $0 model that edits 3 of 5.
 *  3. **`reflection/beam-free` moved down.** Same edit rate as
 *     `nvidia/nemotron-3.5-lightning-free`, but it is the only $0 entry
 *     with a verified schema-exact structured-output record, which the
 *     first-session analysis depends on. It stays in the chain as the
 *     $0 guarantee.
 *
 * ### The $0 guarantee is preserved
 *
 * When Gateway credits ran out on 2026-10-21, every paid model 403'd. A
 * $0 entry in the chain is what keeps the chat usable through that, so
 * `reflection/beam-free` and `nvidia/nemotron-3.5-lightning-free` are
 * both still here — they are the tail of the chain, and they are what
 * answers when the paid ones are gone.
 *
 * ## Re-verifying
 *
 * `tests/unit/ai/chat-tool-call-probe.test.ts` runs this measurement.
 * It is skipped by default so CI stays deterministic; run it deliberately:
 *
 *   RUN_AI_PROBE=1 npx vitest run tests/unit/ai/chat-tool-call-probe.test.ts
 *
 * A capability claim is not proof until the model is called with the
 * ACTUAL payload — unforced, real schema, real prompt. See the standing
 * rule in the file header and `docs/ai-models-reference.md`.
 *
 * Plan: docs/plans/chat-agent-v2.md
 * Drift: docs/drift/2026-10-21-pro-testing-and-model-swap.md
 * Drift: docs/drift/2026-11-01-chat-chain-tool-call-reliability.md
 */
export const CHAT_FALLBACKS: readonly string[] = [
  // 5/5 clean and the fastest caller in the set (2.7s). First because a
  // fallback chain is ordered by what happens when it engages.
  'amazon/nova-micro',
  // 5/5 clean and 20 healthy endpoints — by far the best failover
  // diversity of anything reachable here. Slow (23s median), so second:
  // reliability first, latency second.
  'zai/glm-5.3-flash',
  // $0, pinned to the single free endpoint — the entry that survives
  // credits running out. Edits 3 of 5; when it does not, it asks a
  // clarifying question rather than faking a success. It is also the
  // only $0 entry with a schema-exact structured-output record, which
  // the first-session analysis needs.
  'reflection/beam-free',
  // $0, 1M context. Edits 3 of 5. Last.
  'nvidia/nemotron-3.5-lightning-free'
] as const;

/**
 * Max output tokens for a chat turn. Raised from the old 4000 because a
 * multi-step turn (act → confirm) can legitimately exceed it, and truncating
 * mid-confirmation is exactly the "it did something weird" failure mode.
 */
export const CHAT_MAX_OUTPUT_TOKENS = 8_000;

/**
 * Max tool-calling steps per turn.
 *
 * The AI SDK defaults `stopWhen` to `stepCountIs(1)`, which means a model that
 * spends its only step calling a tool ends the turn immediately and can never
 * read the result or confirm to the user. That single missing setting is the
 * main reason the chat felt like it "didn't make the tool call" even when it
 * did. 6 leaves room for: reason → edit → verify → re-edit → confirm.
 */
export const CHAT_MAX_STEPS = 6;

/**
 * Gateway-native fallback chain for chat turns.
 *
 * Passed to `streamText` as `providerOptions.gateway.order`. Doing the
 * fallback at the *gateway* rather than in our own retry loop matters for
 * streaming: once bytes have been written to the client we cannot silently
 * restart on a different model, and the failure we most need to survive
 * (model-not-available on this account → 403) surfaces immediately.
 *
 * The chain is `[CHAT_MODEL, ...CHAT_FALLBACKS]`, best-quality first.
 */
export const CHAT_GATEWAY_PROVIDER_OPTIONS = {
  gateway: {
    order: [CHAT_MODEL, ...CHAT_FALLBACKS] as string[]
  }
};

/**
 * The chat model for FREE users, and its fallback chain.
 *
 * ## Why a separate chain
 *
 * A free user must cost us **$0**. The Pro chain is priced per token, so
 * pointing free users at it means paying for their conversations out of
 * the Pro revenue. This chain contains **only** $0 models — every entry
 * is priced at 0 on every endpoint this account can be routed to.
 *
 * `reflection/beam` would have been the better model (it edits more often
 * and has 4 endpoints), but it is NOT strictly $0: only its `reflection`
 * endpoint is free, and the gateway may route to baseten / nebius /
 * togetherai at $0.25–$0.40 in / $1.00–$1.20 out per 1M. At the free
 * plan's ceiling (20 turns and 300K tokens a day) that is roughly
 * $1.70–$4 per active free user per MONTH. `reflection/beam-free` is the
 * same model PINNED to the single free endpoint, which is exactly what
 * "free" has to mean.
 *
 * ## What free users get, honestly
 *
 * Measured on the real agent loop (2026-11-01): the free chain's models
 * edit in **3 of 5** attempts, against the Pro chain's **5 of 5**. When
 * they do not edit, they ask a clarifying question rather than faking a
 * success — the agent's `needs-you` behaviour. So the free tier gets a
 * real agent that sometimes asks a question first, not a crippled one.
 *
 * It also gets a **cheaper turn**, which is what makes the free tier's
 * daily allowance honest. A chat turn costs ~13K tokens on the free
 * chain (the `reflection` endpoint serves 11–13K of the prompt from
 * cache) against ~20.8K on the Pro chain's primary, which served none.
 * At 20 turns that is ~260K against the free plan's 300K daily token
 * cap — so the TURN limit binds, and "Free · 20/day" is true. On the Pro
 * chain it would have been ~416K, and the cap would have rejected a
 * Free user at ~14 messages a day while the badge said 20. That is the
 * concrete reason the free tier needs its own chain.
 *
 * `reflection/beam-free` leads because it is the only $0 model here with
 * a verified schema-exact structured-output record, which the
 * first-session analysis needs. `nvidia/nemotron-3.5-lightning-free` is
 * the second $0 entry: it edits in 3 of 5 too, at 6.4s, and it is the
 * one that answers when the pinned endpoint is down.
 */
export const FREE_CHAT_MODEL = 'reflection/beam-free';

export const FREE_CHAT_FALLBACKS: readonly string[] = [
  'nvidia/nemotron-3.5-lightning-free'
] as const;

export const FREE_CHAT_GATEWAY_PROVIDER_OPTIONS = {
  gateway: {
    order: [FREE_CHAT_MODEL, ...FREE_CHAT_FALLBACKS] as string[]
  }
};

/**
 * The model chain a plan gets.
 *
 * One function, so the plan → model decision has a single owner and can
 * be asserted in a test rather than being re-derived at each call site.
 */
export type ChatModelPlan = {
  /** The primary model for this plan. */
  model: string;
  /** The fallback chain, tried in order. */
  fallbacks: readonly string[];
  /** What gets passed to `streamText` as `providerOptions`. */
  providerOptions: { gateway: { order: string[] } };
};

/**
 * Resolve the model chain for a plan.
 *
 * Free gets a $0-only chain; Pro gets the full chain. The two never mix,
 * because "free" has to mean $0 on every endpoint — a single paid
 * backend reachable from the chain is money we spend on someone else's
 * behalf.
 */
export function resolveChatModelPlan(plan: PlanId): ChatModelPlan {
  if (plan === 'pro') {
    return {
      model: CHAT_MODEL,
      fallbacks: CHAT_FALLBACKS,
      providerOptions: CHAT_GATEWAY_PROVIDER_OPTIONS
    };
  }
  return {
    model: FREE_CHAT_MODEL,
    fallbacks: FREE_CHAT_FALLBACKS,
    providerOptions: FREE_CHAT_GATEWAY_PROVIDER_OPTIONS
  };
}

/**
 * Resolve a model string into a gateway-backed `LanguageModelV1`
 * instance. This is the only function that knows about the
 * gateway — callers just pass model constants in.
 *
 * Centralizing the gateway import also means we only need to
 * mock one thing in unit tests (`@ai-sdk/gateway` → the `gateway`
 * function), not three.
 */
export type AiObservabilityContext = {
  distinctId?: string;
  sessionId?: string;
  traceId?: string;
};

const processAiSessionId = `process-${randomUUID()}`;

export function observeModel<T extends LanguageModel>(
  model: T,
  context: AiObservabilityContext
): T {
  if (!posthogServer) {
    if (process.env.NODE_ENV === 'development') {
      throw new Error(
        'POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_KEY is configured'
      );
    }
    return model;
  }

  return withTracing(model as never, posthogServer, {
    posthogDistinctId: context.distinctId,
    posthogTraceId: context.traceId ?? randomUUID(),
    posthogProperties: {
      $ai_session_id: context.sessionId ?? processAiSessionId
    },
    // Privacy mode ON: capture metadata only (model, latency, tokens,
    // errors). Do NOT capture prompt inputs or model outputs.
    // Rationale: Nextep is a resume builder — users paste job
    // descriptions that may contain internal company info, salary
    // ranges, or other confidential data, and resume content with
    // personal PII. Sending prompt/response content to PostHog would
    // create a second processor receiving that data, expanding the
    // privacy surface area without operational benefit. Cost tracking
    // and reliability still work in privacy mode. Flip to false only
    // if you intentionally need prompt capture for AI quality eval.
    posthogPrivacyMode: true
  });
}

export function getModel(
  modelId: string,
  observability: AiObservabilityContext = {}
): LanguageModel {
  return observeModel(gateway(modelId), observability) as LanguageModel;
}
