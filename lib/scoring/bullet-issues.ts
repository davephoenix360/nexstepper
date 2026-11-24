/**
 * Measured, bullet-level ATS issues.
 *
 * The scorecard's tips and the editor's attention icons must never
 * disagree about which bullets are weak. Both therefore consume this
 * resolver: it reads the persisted `jevBullets` measurements and the
 * resume envelope, and returns structured issues keyed by the dotted
 * editor path the templates actually bind.
 *
 * This module deliberately does NOT parse `DynamicTips` — those are
 * rendered React nodes for display, not a machine-readable target list.
 */
import type { ResumeData } from '@/lib/resume-schema';
import type { ScoreBreakdown } from './score';
import { collectHighlightEntries, parseWorkHighlightPath } from './highlight-paths';

/** The only bullet-level criteria surfaced in the editor in v1. */
export type BulletIssueCriterion =
  | 'Accomplishment Focus'
  | 'Action Verb Usage';

/**
 * Shared rubric thresholds.
 *
 * Level 2 on the impact rubric is "a clear accomplishment with a
 * result"; level 1 on the opening rubric is "a plain active verb".
 * Below those midpoints the Jev measurement is describing a duty or a
 * flat opening, so it is actionable.
 */
export const BULLET_ISSUE_THRESHOLDS = {
  impact: 1.5,
  opening: 1.5
} as const;

export type BulletIssue = {
  /** Dotted RHF/template path, e.g. `sections.work.0.positions.2.highlights.1`. */
  path: string;
  criterion: BulletIssueCriterion;
  dimensionLabel: 'Impact' | 'Action Verb Usage';
  reason: string;
  fix: string;
  currentText: string;
  company?: string;
  role?: string;
  /** Occurrence of this normalized text within the same position. */
  occurrence: number;
};

const ISSUE_COPY: Record<
  BulletIssueCriterion,
  Pick<BulletIssue, 'dimensionLabel' | 'reason' | 'fix'>
> = {
  'Accomplishment Focus': {
    dimensionLabel: 'Impact',
    reason: 'This reads as a task, not an outcome.',
    fix: 'Say what changed because of this work, not just what you did.'
  },
  'Action Verb Usage': {
    dimensionLabel: 'Action Verb Usage',
    reason: 'This bullet opens flatly.',
    fix: 'Lead with a stronger action verb.'
  }
};

/**
 * Trim and collapse whitespace. Used both to count duplicate bullets
 * and by Scout's `replaceWorkHighlight` operation to verify that the
 * exactly-addressed bullet has not changed since it was flagged.
 */
export function normalizeBulletText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Build every measured issue for a scored variant.
 *
 * `jevBullets` is positionally aligned with `collectHighlightEntries`,
 * which is why this resolver uses that helper rather than walking the
 * work array again. When the breakdown predates Jev (or Jev failed),
 * there is no bullet-level measurement and therefore no icon.
 */
export function buildBulletIssues(
  breakdown: ScoreBreakdown,
  resume: ResumeData
): BulletIssue[] {
  const bullets = breakdown.jevBullets;
  if (!bullets) return [];

  const entries = collectHighlightEntries(resume);
  const issues: BulletIssue[] = [];

  for (let index = 0; index < bullets.length; index++) {
    const measurement = bullets[index];
    const entry = entries[index];
    // A stale snapshot can be out of sync with a newer resume revision.
    // Never guess an icon for a bullet that no longer has a path.
    if (!measurement || !entry) break;

    const coordinates = parseWorkHighlightPath(entry.path);
    if (!coordinates) continue;

    const workEntry = resume.sections.work?.[coordinates.workIndex];
    const position = workEntry?.positions?.[coordinates.positionIndex];
    const highlights = position?.highlights ?? [];
    const normalizedTarget = normalizeBulletText(entry.text);
    let occurrence = 0;
    for (let i = 0; i < coordinates.highlightIndex; i++) {
      if (normalizeBulletText(highlights[i] ?? '') === normalizedTarget) {
        occurrence++;
      }
    }

    const flagged: BulletIssueCriterion[] = [];
    if (measurement.impact < BULLET_ISSUE_THRESHOLDS.impact) {
      flagged.push('Accomplishment Focus');
    }
    if (measurement.opening < BULLET_ISSUE_THRESHOLDS.opening) {
      flagged.push('Action Verb Usage');
    }

    for (const criterion of flagged) {
      issues.push({
        path: entry.path,
        criterion,
        ...ISSUE_COPY[criterion],
        currentText: entry.text,
        ...(workEntry?.company?.trim()
          ? { company: workEntry.company.trim() }
          : {}),
        ...(position?.title?.trim() ? { role: position.title.trim() } : {}),
        occurrence
      });
    }
  }

  return issues;
}

/** One issue per path, regardless of how many criteria flagged it. */
export function groupIssuesByPath(
  issues: BulletIssue[]
): Map<string, BulletIssue[]> {
  const grouped = new Map<string, BulletIssue[]>();
  for (const issue of issues) {
    const existing = grouped.get(issue.path);
    if (existing) existing.push(issue);
    else grouped.set(issue.path, [issue]);
  }
  return grouped;
}

/** The first measured issue for a criterion, for scorecard anchoring. */
export function firstIssueForCriterion(
  issues: BulletIssue[],
  criterion: BulletIssueCriterion
): BulletIssue | null {
  return issues.find((issue) => issue.criterion === criterion) ?? null;
}
