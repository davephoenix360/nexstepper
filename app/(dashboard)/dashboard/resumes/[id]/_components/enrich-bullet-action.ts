'use server';

import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { requirePro, ProRequiredError } from '@/lib/billing';
import { generateObjectWithFallbacks } from '@/lib/ai/fallback';
import { PARSER_MODEL, PARSE_FALLBACKS } from '@/lib/ai/providers';
import { getResume } from '@/lib/db/queries';
import { flattenResumeText } from '@/lib/scoring/similarity';
import { buildRewritePrompt, extractVocabulary } from '@/lib/inline-issue/prompts';
import { mapPathToSection } from '@/lib/inline-issue/map-path-to-section';
import type { JobPosting } from '@/lib/resume-schema';
import type {
  EnrichBulletResult,
  SubCriterionKey
} from '@/lib/inline-issue/types';
import { trackServer } from '@/lib/posthog/server';
import { PostHogEvents } from '@/lib/posthog/events';

/**
 * Server Action: AI rewrite a single bullet to better match the JD.
 *
 * Pro-gated via the `subscriptions` table — Free callers always
 * receive `{ ok: false, proRequired: true }`. Client cosmetic
 * gating is unreliable (race conditions, devtools tampering); the
 * `requirePro()` helper reads the subscription row directly and
 * is the only authoritative check.
 *
 * Plan: docs/plans/inline-issue-surface.md §"Architecture" +
 * "What you'll build" #2 + ADR 0006 §"Server-authoritative tier gate".
 *
 * Hard constraints from the plan + drift memo:
 *   - No new AI model constants. Use `PARSER_MODEL` + `PARSE_FALLBACKS`
 *     (Mistral Nemo + the 4-model fallback chain).
 *   - No per-popover-open quota. AI cost is ~$0.000005 / call; we
 *     can absorb it.
 *   - The prompt forbids fabricating skills not in the bullet or
 *     JD vocabulary (lib/inline-issue/prompts.ts).
 *   - Regenerate uses fresh AI calls (no prior rewrites are fed
 *     back into the prompt — see prompt.ts for the rationale).
 *
 * Inputs are Zod-validated at the top. Anything that fails validation
 * returns `{ ok: false, error: 'Invalid input' }` — never throws.
 * Server Actions are public endpoints; we re-check auth + ownership
 * even when the UI already gates the affordance.
 */

const enrichBulletInputSchema = z.object({
  resumeId: z.string().min(1),
  path: z.string().min(1),
  criterion: z.string().min(1),
  // Empty `currentText` is allowed here so the action can return
  // a friendly, specific error instead of the generic "Invalid
  // input" message. The handler below checks for the empty case
  // and returns a "bullet is empty — add some content first"
  // error that the popover can render directly.
  currentText: z.string().max(2000)
});

/**
 * The Zod schema for the LLM output. Mistral Nemo handles this
 * cleanly via the Vercel AI SDK structured-output mode. We
 * deliberately use a top-level `rewrites` array of 3 strings
 * (not a discriminated union) so the model can swap order.
 */
const rewriteSchema = z.object({
  rewrites: z.array(z.string().min(1).max(1000)).length(3)
});

export async function enrichBulletAction(
  input: unknown
): Promise<EnrichBulletResult> {
  const parsed = enrichBulletInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input' };
  }
  const { resumeId, path, criterion, currentText } = parsed.data;

  // Empty bullet check — applied BEFORE the auth + Pro-gate
  // round-trip so we don't burn a DB read on a no-op. The error
  // string is rendered verbatim by `<InlineIssuePopover>`'s
  // ErrorBody, so keep it user-facing.
  if (currentText.trim().length === 0) {
    return {
      ok: false,
      error:
        'This bullet is empty — add some content first, then we can rewrite it to better match the job.'
    };
  }

  // 1. Auth — server actions are public endpoints regardless of
  // where they appear in the UI.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'Not signed in' };
  }

  // 2. Pro gate — authoritative. Reads the `subscriptions` table
  // directly; client-side `useIsPro()` is cosmetic only and we
  // never trust it for gating. Free users get the explicit
  // `proRequired: true` discriminator so the popover can show the
  // "upgrade to use AI rewrites" CTA.
  try {
    await requirePro();
  } catch (err) {
    if (err instanceof ProRequiredError) {
      return { ok: false, error: 'Pro required', proRequired: true };
    }
    throw err;
  }

  // 3. Ownership — fetch the resume to confirm the user owns it
  // AND to pull the JD text. We use the current text the popover
  // sent us as the bullet content (avoids re-resolving the path
  // through the form data); we still need the resume to verify
  // ownership + read the JD.
  const result = await getResume(resumeId, session.user.id);
  if (!result) {
    return { ok: false, error: 'Resume not found' };
  }
  const { data } = result;

  if (!data.jobContext) {
    return {
      ok: false,
      error:
        'No job description attached to this variant. Attach a JD before requesting AI rewrites.'
    };
  }

  // 4. Map the path to a section so the prompt template can pick
  // the right framing (rewrite vs. gap).
  const target = mapPathToSection(path, criterion as SubCriterionKey);
  if (!target) {
    // Defensive — the popover only calls us with paths the
    // mapper accepts, but a future path shape could change.
    return { ok: false, error: `Unsupported path: ${path}` };
  }

  // 5. Build the prompt.
  const jdVocabulary = collectJdVocabulary(data.jobContext);
  // `flattenResumeText` reads `resume.basics` / `resume.skills` /
  // `resume.work` — but the saved envelope wraps those in
  // `resume.sections` (JSON Resume convention). Pass the unwrapped
  // shape so the vocabulary extractor sees the same fields the
  // scorer sees. The cast is `unknown` → narrow shape because
  // `flattenResumeText`'s narrow type doesn't include
  // `sections.*`.
  const resumeEnvelope = data as unknown as {
    sections: Parameters<typeof flattenResumeText>[0];
  };
  const resumeVocabulary = extractVocabulary(
    flattenResumeText(resumeEnvelope.sections)
  );
  const { system, prompt } = buildRewritePrompt({
    criterion,
    tipKind: target.tipKind,
    sectionTitle: target.sectionTitle,
    currentBullet: currentText,
    jdVocabulary,
    resumeVocabulary
  });

  // 6. Call the model via the standard fallback chain.
  // Generate three rewrites in one call (single round-trip —
  // latency is the budget constraint per plan §"AI model choice").
  try {
    const ai = await generateObjectWithFallbacks({
      models: [PARSER_MODEL, ...PARSE_FALLBACKS],
      system,
      prompt,
      schema: rewriteSchema,
      temperature: 0.4,
      observability: {
        distinctId: session.user.id,
        sessionId: resumeId,
        traceId: randomUUID()
      }
    });

    // Light post-validation — the schema already enforces shape,
    // but a defensive .trim() + dedupe keeps the popover from
    // showing identical rows after a degenerate model output.
    const rewrites = dedupeRewrites(
      ai.data.rewrites.map((s) => s.trim()).filter((s) => s.length > 0)
    );

    trackServer(session.user.id, PostHogEvents.BULLET_ENRICHED, {
      resumeId,
      modelUsed: ai.modelUsed
    });

    return {
      ok: true,
      data: {
        rewrites: rewrites.slice(0, 3),
        modelUsed: ai.modelUsed
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `AI rewrite failed: ${message}`
    };
  }
}

/**
 * Pull a focused vocabulary list from the JD — title, requirements,
 * and nice-to-haves are the words the rewriter is allowed to weave
 * in. We deliberately exclude `description` (too noisy; contains
 * generic phrases that pollute the allow-list).
 */
function collectJdVocabulary(job: JobPosting): string[] {
  const parts: string[] = [];
  if (job.title) parts.push(job.title);
  if (job.requirements) parts.push(...job.requirements);
  if (job.niceToHaveSkills) parts.push(...job.niceToHaveSkills);
  if (job.niceToHaves) parts.push(...job.niceToHaves);
  if (job.mustHaveSkills) parts.push(...job.mustHaveSkills);
  return extractVocabulary(parts.join(' '), { cap: 60 });
}

/**
 * Dedupe a 3-element rewrite list — case-insensitive comparison
 * so the popover never shows visually-identical rows. The model
 * occasionally returns the same suggestion twice when the bullet
 * is short; this also normalizes whitespace.
 */
function dedupeRewrites(rewrites: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rewrites) {
    const key = r.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  // Pad to 3 if dedupe collapsed below the schema's length(3).
  // The schema already rejected a length < 3, so we only hit
  // this branch when dedupe collapsed duplicate rows.
  while (out.length < 3) {
    out.push('');
  }
  return out;
}