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
 * To swap to a paid model (e.g. Claude Sonnet 4.5 for higher
 * quality once you've added Vercel credits), change the model
 * string in this file. The call sites never need to change.
 *
 * To swap to a different free-tier model, see the live filter at
 * https://vercel.com/ai-gateway/models?freeTier=true. Candidates:
 *   - `'google/gemini-2.5-flash'`     — best structured extraction
 *   - `'zai/glm-5.3-flash'`           — cheap, 50% off through 2026
 *   - `'google/gemma-4-31b-it'`        — open model, true free tier
 */

/**
 * Model string for the JD parser.
 *
 * Currently `google/gemini-2.5-flash` because it's in Vercel AI
 * Gateway's free tier (the $5/mo credit works for it). Claude
 * Sonnet/Haiku require paid credits — Vercel returns "Free tier
 * users do not have access to this model" if you try.
 *
 * Tradeoffs vs Sonnet 4.5:
 *   - Slightly lower quality on nuanced JSON-Schema extraction
 *     (Gemini Flash is good but Sonnet is the gold standard)
 *   - Way cheaper — covers thousands of parses within the free tier
 *   - Fast — typically <2s for our input sizes
 *
 * Swap path: when you add credits (minimum $5 top-up at
 * vercel.com/dashboard → AI Gateway → Credits), change this to
 * `'anthropic/claude-sonnet-4.5'`. The codebase uses this
 * constant everywhere; no call-site changes needed.
 */
export const JD_PARSER_MODEL = 'google/gemini-2.5-flash';

/**
 * Model string for the resume parser. Same rationale as
 * JD_PARSER_MODEL.
 */
export const RESUME_PARSER_MODEL = 'google/gemini-2.5-flash';

/**
 * Placeholder model for the Optimize tool (Phase 3, not built yet).
 * When the action lands, this should be Anthropic Haiku 4.5 with
 * a Sonnet fallback — 3-5x cheaper than Sonnet for the per-section
 * rewrite, similar quality for text transformations.
 *
 * NOTE: Haiku 4.5 is paid-only on Vercel AI Gateway. Use Gemini
 * 2.5 Flash for early dev; swap when credits are available.
 */
export const OPTIMIZE_MODEL = 'google/gemini-2.5-flash';

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
