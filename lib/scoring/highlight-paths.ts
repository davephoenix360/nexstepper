/**
 * Every work bullet, with the editor path that addresses it.
 *
 * ## Why this exists
 *
 * The Content Quality dimension and the tip builder both flatten
 * `work[*].positions[*].highlights` into one list, and the breakdown's
 * `jevBullets` are aligned to THAT list positionally. So the index of
 * a weak bullet in the list is known — but the list is flattened, so
 * the index alone does not say WHICH bullet it is.
 *
 * That mattered because the inline-issue popover anchored to
 * `defaultPathForCriterion`, which for every bullet-shaped criterion
 * was **bullet #1** — while the advice beside it named three specific
 * bullets. So the AI rewrite could rewrite a line the advice never
 * mentioned.
 *
 * This module keeps the coordinates, so a bullet's index in the
 * flattened list and the path that addresses it travel together.
 *
 * ## The flattening is deliberately identical to the engine's
 *
 * `lib/scoring/dimensions/content-quality.ts > collectHighlights` and
 * `lib/scoring/tips.tsx > collectHighlights` flatten the same way and
 * filter the same way (non-empty strings only). If this module's
 * order or filter ever diverges, the index would point at a different
 * bullet — so the rule is repeated here and asserted in the tests.
 */
import type { ResumeData } from '@/lib/resume-schema';

export type HighlightEntry = {
  /** The bullet's text. */
  text: string;
  /**
   * The editor path that addresses this bullet:
   * `sections.work.{w}.positions.{p}.highlights.{b}`.
   *
   * DOTTED, because that is the spelling the templates bind and the
   * one `readLeafText` looks up (see `lib/inline-issue/criterion-to-path.ts`).
   */
  path: string;
};

/**
 * Every work bullet with its editor path, in the same order as the
 * engine's flattened list.
 *
 * Projects are excluded, exactly as the Content Quality dimension
 * excludes them: they are optional, and they do not carry the same
 * "this is what I did every day" signal.
 */
export function collectHighlightEntries(resume: ResumeData): HighlightEntry[] {
  const out: HighlightEntry[] = [];
  const work = resume.sections.work ?? [];
  for (let w = 0; w < work.length; w++) {
    const positions = work[w]?.positions ?? [];
    for (let p = 0; p < positions.length; p++) {
      const highlights = positions[p]?.highlights ?? [];
      for (let b = 0; b < highlights.length; b++) {
        const text = highlights[b];
        if (typeof text !== 'string' || text.trim().length === 0) continue;
        out.push({
          text,
          path: `sections.work.${w}.positions.${p}.highlights.${b}`
        });
      }
    }
  }
  return out;
}

/**
 * The path of the bullet at `index` in the flattened list, or null.
 *
 * `index` is an index into the SAME list the breakdown's `jevBullets`
 * are aligned to.
 */
export function pathForHighlightIndex(
  resume: ResumeData,
  index: number
): string | null {
  if (!Number.isInteger(index) || index < 0) return null;
  return collectHighlightEntries(resume)[index]?.path ?? null;
}
