import 'server-only';

import { gateway } from '@ai-sdk/gateway';

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
 * Placeholder model for the Optimize tool (Phase 3, not built yet).
 * When the action lands, this should be Anthropic Haiku 4.5 with
 * a Sonnet fallback — 3-5x cheaper than Sonnet for the per-section
 * rewrite, similar quality for text transformations.
 *
 * For now we point it at the same free-tier primary so import paths
 * stay stable; swap when the Optimize action ships.
 */
export const OPTIMIZE_MODEL = PARSER_MODEL;

/**
 * Resolve a model string into a gateway-backed `LanguageModelV1`
 * instance. This is the only function that knows about the
 * gateway — callers just pass model constants in.
 *
 * Centralizing the gateway import also means we only need to
 * mock one thing in unit tests (`@ai-sdk/gateway` → the `gateway`
 * function), not three.
 */
export function getModel(modelId: string) {
  return gateway(modelId);
}
