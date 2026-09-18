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
 *  - Fallback chains are explicit → see `OPTIMIZE_MODEL` below for
 *    the pattern; same approach can be added to the parsers later
 *    if cost / quality need it.
 *
 * ## Why Vercel AI Gateway (not direct @ai-sdk/anthropic)
 *
 * - One key for hundreds of models (`AI_GATEWAY_API_KEY` env var).
 * - 0% markup on tokens — same provider list price.
 * - Automatic cross-provider failover.
 * - Built-in spend / latency / token observability in the Vercel
 *   dashboard, with custom reporting API and budget alerts.
 * - $5/month free credit on the free tier, no card required.
 *
 * Reference: `NEXTEP_REBUILD_PLAN.md` + the 2026 AI landscape
 * research in `output/deep-research/20260901_222225_ai-integration-options/`.
 *
 * ## Why Sonnet 4.5 for the parsers
 *
 * Both the JD parser and the resume parser are quality-critical —
 * they seed the entire downstream experience (variants, Optimize,
 * sharing). Sonnet 4.5 is the current Anthropic default for
 * structured extraction and is reliable on the JSON-Schema-as-
 * output-contract pattern that the parsers use. Haiku 4.5 is
 * cheaper but we keep Sonnet here until we have head-to-head data.
 *
 * ## Why a placeholder for OPTIMIZE_MODEL (not yet wired)
 *
 * The Optimize tool hasn't been built yet (queued, Phase 3). When
 * it ships, the rewrite should run on Haiku 4.5 with Sonnet 5 as a
 * fallback — 3x cheaper, similar quality for text transformations.
 * Centralizing the model string now means the change is one line.
 *
 * ## Switching providers
 *
 * To use Google's Gemini 2.5 Flash for local dev (free tier, no
 * card), swap `JD_PARSER_MODEL` and `RESUME_PARSER_MODEL` to
 * `'google/gemini-2.5-flash'`. The gateway supports it natively
 * and the API surface is identical.
 */

/**
 * Model string for the JD parser. Quality-critical structured
 * extraction — keep on Sonnet until we have head-to-head data.
 */
export const JD_PARSER_MODEL = 'anthropic/claude-sonnet-4.5';

/**
 * Model string for the resume parser. Quality-critical structured
 * extraction — same rationale as JD_PARSER_MODEL.
 */
export const RESUME_PARSER_MODEL = 'anthropic/claude-sonnet-4.5';

/**
 * Placeholder model for the Optimize tool (Phase 3, not built yet).
 * When the action lands, swap this to a two-model fallback chain
 * — `gateway('anthropic/claude-haiku-4.5', { fallback: 'anthropic/claude-sonnet-5' })`.
 *
 * Keeping the constant in place means the Optimize action can
 * `import { OPTIMIZE_MODEL } from '@/lib/ai/providers'` from day
 * one; we change the constant, not the call site.
 */
export const OPTIMIZE_MODEL = 'anthropic/claude-haiku-4.5';

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
