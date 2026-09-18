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
 * ## Why openai/gpt-4o-mini as primary
 *
 * After multiple attempts at free-tier models (inclusionai /
 * poolside showed in the CLI as free but errored at runtime with
 * "Free tier users do not have access", and Google / Z.AI had
 * other problems), we switched to a cheap paid tier that's known
 * to work.
 *
 * `openai/gpt-4o-mini` is the sweet spot for our use case:
 *   1. Best-in-class structured JSON output (OpenAI's JSON mode is
 *      the most mature in the industry)
 *   2. 0.8s typical latency — fast enough for an interactive import
 *   3. $0.15/$0.60 per M tokens — at our volume (10K calls/month),
 *      total cost is ~$0.60. Essentially free.
 *   4. Cross-provider diversification (different from anything we'd
 *      use for chat or future Optimize work)
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
 * ## The fallback chain (PARSE_FALLBACKS)
 *
 * Our fallback (see `lib/ai/fallback.ts`) walks the chain when the
 * primary fails. Every fallback is from a DIFFERENT provider so
 * we don't share a single infrastructure failure mode:
 *
 *   1. `mistral/mistral-nemo`     — $0.02/$0.03, Mistral, 0.3s
 *   2. `meta/llama-3.1-8b`        — $0.02/$0.05, Meta, 0.2s
 *   3. `amazon/nova-micro`        — $0.04/$0.14, Amazon, 0.4s (EU)
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
export const PARSER_MODEL = 'openai/gpt-4o-mini';

/**
 * Fallback chain for parser calls. The gateway tries each in
 * order when the previous model fails or times out.
 *
 * Each fallback is from a DIFFERENT provider (OpenAI, Mistral,
 * Meta, Amazon) so we get independent infrastructure failure
 * modes. They're all in the cheap-tier (under $0.20/M input)
 * so the fallback chain costs essentially nothing even if
 * exercised heavily.
 */
export const PARSE_FALLBACKS: readonly string[] = [
  'mistral/mistral-nemo',
  'meta/llama-3.1-8b',
  'amazon/nova-micro'
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
