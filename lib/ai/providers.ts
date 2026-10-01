import 'server-only';

import { randomUUID } from 'node:crypto';
import { withTracing } from '@posthog/ai';
import { gateway } from '@ai-sdk/gateway';
import type { LanguageModel } from 'ai';

import { posthogServer } from '@/lib/posthog/server';

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
 * - $5/month free credit on the free tier, no card required.
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
 *   3. Even cheaper than GPT-4o-mini: ~$0.02 / $0.03 per M tokens
 *   4. ~0.3s typical latency — fast enough for interactive use
 *
 * `openai/gpt-4o-mini` is now the LAST fallback (not the
 * primary) — when Vercel gives us credits and lifts the
 * output cap, we can swap it back as primary.
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
 * - `zai/glm-5.3-flash`: NOT in Vercel's free tier (despite the
 *     model browser page suggesting it was). Hit the same "Free
 *     tier users do not have access" error.
 *
 * - `inclusionai/ling-3.0-flash-fin-free` and friends: Listed in
 *     the CLI as free tier, but the user's account got "Free tier
 *     users do not have access" when actually calling. Could be a
 *     per-account restriction (new accounts, team policies) — only
 *     the user's actual test can confirm.
 *
 * - `openai/gpt-4o-mini` (was primary until 2026-09-18): Hit a
 *     `max_output_tokens` cap during strict `response_format:
 *     json_schema` calls that produced empty text responses even
 *     when `maxOutputTokens: 12000` was set in the request. The
 *     Gateway appears to override the cap with a free-tier limit.
 *
 * ## The fallback chain (PARSE_FALLBACKS)
 *
 * Our fallback (see `lib/ai/fallback.ts`) walks the chain when the
 * primary fails. Every fallback is from a DIFFERENT provider so
 * we don't share a single infrastructure failure mode:
 *
 *   1. `meta/llama-3.1-8b`        — $0.02/$0.05, Meta, 0.2s
 *   2. `amazon/nova-micro`        — $0.04/$0.14, Amazon, 0.4s (EU)
 *   3. `openai/gpt-4o-mini`      — $0.15/$0.60, OpenAI (capped)
 *
 * If all four fail, we surface it as `ai_failure`.
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
 */
export const PARSE_FALLBACKS: readonly string[] = [
  'meta/llama-3.1-8b',
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

// ─── Chat assistant (agentic) — added 2026-10-01 ──────────────────────────────

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
 * Verified with the authenticated CLI
 * (`npx vercel@latest ai-gateway models endpoints <id> --format json`,
 * which reports the account-level view — the thing the model-browser page got
 * wrong twice before, per the "What we've tried" section above):
 *
 * | model                    | in/out | ctx    | tool-use | structured-output | notes                        |
 * |--------------------------|--------|--------|----------|-------------------|------------------------------|
 * | `inclusionai/ling-3.1-flash` | $0/$0 | 262K | yes      | **no**            | 560B total / 25B active, agentic |
 * | `alibaba/qwen3.7-flash`  | $0.03/$0.13 | 991K | yes | yes            | paid fallback, huge ctx        |
 * | `inception/mercury-2.5`  | $0.04/$0.15 | 260K | yes      | no                | fast in-context learning       |
 * | `mistral/mistral-nemo`   | $0.04/$0.17 | 60K  | yes      | **yes**           | 12B — fine at parsing, weak at agentic |
 *
 * The `structured-output` column is the whole story: it is the only reason
 * Nemo was ever right for the parsers, and it is the reason Ling 3.1 Flash
 * *cannot* be. The two models are good at different jobs, so the split is a
 * capability boundary rather than a preference — keep the parser on Nemo,
 * move the chat to Ling.
 *
 * Ling 3.1 Flash's own description: *"hybrid reasoning language model for
 * coding, multi-step analysis, and tool-using agents."* Endpoint tags are
 * `["free","reasoning","tool-use","implicit-caching"]`, status healthy,
 * 99.96% uptime (1h), tft p50 ~2.3s, 93 tok/s.
 *
 * The context window matters more than it looks: every chat turn re-sends the
 * full resume, so on Nemo's 60K window a long resume truncates and the agent
 * starts "forgetting" the user's own data.
 *
 * Plan: docs/plans/chat-agent-v2.md
 */
export const CHAT_MODEL = 'inclusionai/ling-3.1-flash';

/**
 * Fallback chain for the chat assistant, tried in order.
 *
 * Every entry is from a DIFFERENT provider so one upstream incident can't take
 * chat down. Ordering rationale:
 *
 *  1. `alibaba/qwen3.7-flash`  — cheap, huge context, strong tool-use, and
 *                               (unlike the other two) supports structured
 *                               output too.
 *  2. `inception/mercury-2.5`  — in-context-learning model, fast TTFT; good
 *                               when the failure was latency-shaped.
 *  3. `mistral/mistral-nemo`   — the previous primary. Kept LAST on purpose:
 *                               it is the only model in this app *proven* to
 *                               work on this account, so it is the floor that
 *                               guarantees the agent still functions if every
 *                               model above it 403s.
 *
 * The chain exists because the Gateway's model browser has twice listed a
 * model as free-tier that the real account could not call
 * (`zai/glm-5.3-flash`, `inclusionai/ling-3.0-flash-fin-free` — see the
 * "What we've tried" section above). Browser metadata is a hint, not a
 * guarantee, so the agent degrades in quality rather than in function.
 */
export const CHAT_FALLBACKS: readonly string[] = [
  'alibaba/qwen3.7-flash',
  'inception/mercury-2.5',
  'mistral/mistral-nemo'
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
