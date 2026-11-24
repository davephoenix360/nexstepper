/**
 * Server-side builder for `MatchBreakdown` rows.
 *
 * The surviving inline-issue surface sends scorecard Tip events to the
 * editor; those rows anchor the pulse to an EditableText leaf. The
 * column's TypeScript shape is pinned at
 * `lib/db/queries.ts > MatchBreakdown`:
 *
 *   Array<{
 *     path: string;            // EditableText RHF path
 *     weight: number;          // 0..1 — how much this leaf matters
 *     criterion: SubCriterionKey; // which dim bar to highlight
 *     tipKind: 'gap' | 'rewrite'; // legacy label; no popover is opened
 *   }>
 *
 * This module produces that array from a `ScoreBreakdown`
 * (lib/scoring) so the server can persist it in lock-step with the
 * score it just computed. We emit ONE entry per scored sub-dimension
 * (7 today), pointing at the dimension's most-relevant leaf. For the
 * bullet criteria the leaf comes from `buildBulletIssues()`, the same
 * structured source as the attention icons and the tooltip counts.
 *
 * Computing this server-side means every writer produces the same
 * shape. The client falls back to `defaultPathForCriterion` only when
 * the column is missing (legacy rows + first-load edge cases).
 */

import type { ScoreBreakdown } from '@/lib/scoring';
import {
  defaultPathForCriterion,
  defaultPathForSkill
} from '@/lib/inline-issue/criterion-to-path';
import { mapPathToSection } from '@/lib/inline-issue/map-path-to-section';
import {
  buildBulletIssues,
  firstIssueForCriterion
} from '@/lib/scoring/bullet-issues';
import type { ResumeData } from '@/lib/resume-schema';
import type { MatchBreakdown, SubCriterionKeyForBreakdown } from '@/lib/db/queries';
import type { SubCriterionKey, TipKind } from '@/lib/inline-issue/types';

/**
 * Per-dimension scoring map — the inline-issue surface pairs each dim
 * bar with the sub-criterion whose tip and anchor it shows. Kept here
 * (not in the components) because it's the writer's input → output
 * map; components consume the rendered `MatchBreakdown`, not this map.
 *
 * If a future dim bar needs a different criterion mapping, edit this
 * table. The order doesn't matter.
 */
const DIM_TO_CRITERION: Record<string, SubCriterionKey> = {
  Keywords: 'ATS Keyword Match',
  Format: 'Section Completeness',
  Impact: 'Accomplishment Focus',
  'Experience match': 'Tailoring',
  'Intent coverage': 'Intent Coverage',
  'Role fit': 'Role Fit',
  'Seniority fit': 'Seniority Fit'
};

/**
 * Compute the weight for a single breakdown entry. The weight
 * is "how much this leaf needs help", so a low score → high
 * weight. The formula emphasizes the gap by squaring the
 * normalized score and subtracting from 1 — a 50% dimension
 * score → 0.75 weight, not 0.50, so the worst dimensions are
 * visibly prioritized at a glance.
 *
 *   score 100 → 0
 *   score  80 → 0.36
 *   score  50 → 0.75
 *   score   0 → 1
 *
 * `null` / `undefined` / `NaN` are coerced to 100 (perfect
 * score, weight 0). The legacy sync-only engine doesn't emit
 * v2 dims, so those rows read as "no signal" rather than as
 * NaN-gaps. We could skip the row entirely; emitting it with
 * weight 0 keeps the per-dim mapping in the column stable
 * across engine versions.
 *
 * Rounded to 2 decimals so the JSONB is stable + readable.
 */
function weightFromScore(score: number | undefined | null): number {
  const safe = Number(score);
  if (!Number.isFinite(safe)) return 0;
  const clamped = Math.max(0, Math.min(100, safe));
  const normalized = clamped / 100;
  const weight = 1 - Math.pow(normalized, 2);
  return Math.round(weight * 100) / 100;
}

/**
 * Legacy tip-kind label for the criterion — mirrors the
 * `tipKindFor(criterion, _slug)` in
 * `lib/inline-issue/map-path-to-section.ts`. Kept inline (not
 * imported) so this module stays a pure function of the input
 * shape and doesn't import UI-side helpers. No popover is opened
 * from this value now; `TipKind='rewrite'` is still its historical
 * name.
 */
function tipKindFor(criterion: SubCriterionKey): TipKind {
  switch (criterion) {
    case 'ATS Keyword Match':
    case 'Intent Coverage':
      return 'gap';
    default:
      return 'rewrite';
  }
}

/**
 * The public builder — produces a `MatchBreakdown` array from a
 * `ScoreBreakdown`. One entry per dim bar in the scorecard.
 *
 * Returns an empty array when the breakdown is null (defensive —
 * the writer is called from the recompute flow which already
 * checks for null, but a future caller might not).
 *
 * The `path` defaults to the inline-issue surface's standard
 * heuristic (`defaultPathForCriterion`). Bullet criteria override it
 * with the exact path from `buildBulletIssues()` so the anchor and the
 * attention icon agree on the same measured leaf.
 */
export function buildMatchBreakdown(
  breakdown: ScoreBreakdown | null | undefined,
  /**
   * The resume envelope, when the caller has it.
   *
   * ## Why
   *
   * Without it every bullet-shaped criterion anchors to bullet #1 —
   * while the advice beside it names three SPECIFIC bullets. The Tip
   * event would then pulse a section unrelated to the advice.
   *
   * With it, the Impact row anchors to the first bullet the advice
   * names: `buildBulletIssues()` reads `jevBullets`, which are aligned
   * positionally to the flattened work-bullet list, and
   * `collectHighlightEntries` keeps that list's coordinates.
   */
  resume?: ResumeData | null
): MatchBreakdown {
  if (!breakdown) return [];
  const scores = breakdown.dimensionScores;
  const dimPairs: Array<[string, number]> = [
    ['Keywords', scores.atsMatching],
    ['Format', scores.structure],
    ['Impact', scores.contentQuality],
    ['Experience match', scores.alignment],
    ['Intent coverage', scores.intentCoverage],
    ['Role fit', scores.roleFit],
    ['Seniority fit', scores.seniorityFit]
  ];

  // The path that addresses a bullet the advice names — for the Impact
  // dimension, the first bullet Jev judged below the "accomplishment
  // with a result" bar (the same < 1.5 threshold the tip uses, so the
  // Tip anchor lands on a bullet the tip lists).
  const weakBulletPath = !resume
    ? null
    : firstIssueForCriterion(
        buildBulletIssues(breakdown, resume),
        'Accomplishment Focus'
      )?.path ?? null;

  const rows: MatchBreakdown = [];
  for (const [label, score] of dimPairs) {
    const criterion = DIM_TO_CRITERION[label];
    if (!criterion) continue; // safety — shouldn't happen
    const path =
      criterion === 'Accomplishment Focus' && weakBulletPath
        ? weakBulletPath
        : defaultPathForCriterion(criterion);
    // Sanity: only emit rows whose paths resolve to a real
    // section. An unknown path would produce a Tip event the editor
    // cannot anchor — better to skip.
    const target = mapPathToSection(path, criterion);
    if (!target) continue;
    rows.push({
      path,
      weight: weightFromScore(score),
      // Cast is safe — DIM_TO_CRITERION only ever returns keys
      // that are in the SubCriterionKeyForBreakdown union. The
      // table is the single source of truth.
      criterion: criterion as SubCriterionKeyForBreakdown,
      tipKind: tipKindFor(criterion)
    });
  }

  // Sort by weight DESC so consumers reading the array can
  // pick the top-N issues without re-sorting. Stable for tests.
  rows.sort((a, b) => b.weight - a.weight);
  return rows;
}

/**
 * Insert one extra "skill gap" entry pointing at the first
 * skills keyword slot. The scorecard's `MissList` rows surface
 * specific skill names; the `defaultPathForSkill` path is the
 * anchor we hand the editor. We don't try to map each skill to
 * its own path — the surface is "show me the skills section".
 *
 * Returns `null` (no row added) when the breakdown's intent-
 * coverage signal was the fallback (no v2 signals). This keeps
 * the breakdown small and lets the UI skip the affordance when
 * there's no actionable gap data.
 */
export function maybeAppendSkillGapEntry(
  rows: MatchBreakdown,
  breakdown: ScoreBreakdown | null | undefined
): MatchBreakdown {
  if (!breakdown) return rows;
  // Defensive — v1 mock breakdowns (and the legacy sync-only path)
  // don't carry `intentCoverageBreakdown`. Treat absence as
  // "no signal available" → don't append the skill-gap row.
  // The real hybrid path always populates it.
  const intent = breakdown.intentCoverageBreakdown;
  if (!intent || intent.fallback) return rows;
  return [
    ...rows,
    {
      path: defaultPathForSkill(),
      weight: weightFromScore(breakdown.dimensionScores.intentCoverage),
      criterion: 'Intent Coverage',
      tipKind: 'gap'
    }
  ];
}
