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
 * ## Why Z.AI GLM 5.3 Flash as primary (not Gemini, not Claude)
 *
 * Both the JD parser and the resume parser are quality-critical
 * structured-extraction calls — they use the JSON-Schema-as-output-
 * contract pattern with Zod. We need a model that:
 *
 *   1. Supports structured JSON output
 *   2. Is reliable (responds within seconds, not minutes)
 *   3. Is in Vercel AI Gateway's free tier (no paid credits needed)
 *   4. Is cheap if we exceed the free tier
 *
 * `zai/glm-5.3-flash` checks every box:
 *   - JSON-mode structured output (confirmed in Z.AI docs)
 *   - 0.4s typical latency, 219 tps — well below our 90s timeout
 *   - In Vercel AI Gateway's free-tier subset
 *   - $0.05/M input, $0.20/M output (50% off the list price)
 *
 * Previous choice was `google/gemini-2.5-flash`, which worked in
 * isolation but became unreliable in production traffic — Vercel's
 * Google Vertex AI routing had a known degradation in late Sep
 * 2026 causing 30-60s latencies. Different provider = different
 * infrastructure = independent failure modes.
 *
 * Previous choice was also `anthropic/claude-sonnet-4.5`, but
 * Sonnet/Haiku are NOT in Vercel AI Gateway's free tier — Vercel
 * returns "Free tier users do not have access to this model."
 *
 * ## The fallback chain (PARSE_FALLBACKS)
 *
 * We pass `models: [primary, fallback1, fallback2]` via the AI SDK's
 * `providerOptions.gateway.models` option. The gateway then
 * automatically tries each in order when the primary fails or
 * times out — no retry logic needed in our code.
 *
 * Fallback order rationale:
 *   1. Z.AI GLM 5.3 Flash        — primary (cheapest, fast, free tier)
 *   2. Google Gemini 2.5 Flash Lite — different provider, sibling
 *      to the Flash that was failing. Often faster than the regular
 *      Flash on cold starts.
 *   3. Google Gemini 2.5 Flash  — last resort. The one that was
 *      slow but at least we know it works.
 *
 * If all three fail, the gateway returns an error → our catch block
 * surfaces it as `ai_failure`.
 *
 * ## Switching to a paid model (Sonnet, once you add credits)
 *
 * Change `PARSER_MODEL` to `'anthropic/claude-sonnet-4.5'` and
 * update `PARSE_FALLBACKS` to a paid-only chain (e.g. Sonnet → Haiku).
 * The call sites don't change.
 */

/**
 * Primary model for both parsers. Quality-critical structured
 * extraction. See the doc comment above for the rationale.
 */
export const PARSER_MODEL = 'zai/glm-5.3-flash';

/**
 * Fallback chain for parser calls. Passed to the AI SDK as
 * `providerOptions.gateway.models`. The gateway tries each in
 * order when the previous model fails or times out.
 *
 * Different providers across the chain (Z.AI → Google → Google)
 * means independent infrastructure failures. Different model tiers
 * within the chain (flash → flash-lite → flash) means we trade
 * quality for resilience when needed.
 */
export const PARSE_FALLBACKS: readonly string[] = [
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash'
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
