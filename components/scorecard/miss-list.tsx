'use client';

import { CheckCircle2, XCircle, Eye } from 'lucide-react';

import type { IntentCoverageBreakdown } from '@/lib/scoring/dimensions/intent-coverage';
import { cn } from '@/lib/utils';

/**
 * Per-skill miss list — surfaces the v2 Intent Coverage breakdown
 * as a priority-grouped checklist.
 *
 * Three priority buckets rendered top-to-bottom by impact:
 *
 *   1. **Must-have skills** missing from the resume.
 *   2. **Nice-to-have skills** missing.
 *   3. **Implicit skills** (deduced by the LLM extractor — not in
 *      the JD text but implied by role family) missing.
 *
 * Each bucket is capped at 20 entries (see
 * `lib/scoring/dimensions/intent-coverage.ts`) so we don't dump
 * 100 inferred skills onto a user. Empty buckets are hidden.
 *
 * **Plan:** docs/plans/ats-scoring-v2.md §"Phase 3 — UI: per-skill
 * miss list". Phase 3 ships this; the dynamic-tip renderer in
 * `lib/scoring/tips.tsx` already mentions "missing 2 must-have
 * skills" — this component makes that scrollable instead of inline.
 */

const BUCKET_LIMIT = 20;

type Bucket = {
  label: string;
  /** Bucket key — used by the inline-issue surface to pick the
   *  right path mapping. */
  key: 'mustHave' | 'niceToHave' | 'implicit';
  items: string[];
  /** Tailwind color tokens for the section header + the checkmark. */
  tone: 'rose' | 'amber' | 'sky';
  hint: string;
};

const TONE_CLASSES = {
  rose: {
    text: 'text-rose-700 dark:text-rose-400',
    bullet: 'bg-rose-500'
  },
  amber: {
    text: 'text-amber-700 dark:text-amber-400',
    bullet: 'bg-amber-500'
  },
  sky: {
    text: 'text-sky-700 dark:text-sky-400',
    bullet: 'bg-sky-500'
  }
} as const;

export function MissList({
  breakdown,
  /**
   * Inline-issue surface integration. When provided, each row gets
   * a "Show me" button that triggers `onIssueClick({ skill, bucket })`
   * — the parent (ScorecardClient) scrolls to the Skills section,
   * pulses it, and (Pro only) opens an AI rewrite popover.
   *
   * Plan: docs/plans/inline-issue-surface.md §"User-visible behavior
   * (Free + Pro)" + "What you'll build" #6.
   */
  onIssueClick
}: {
  breakdown: IntentCoverageBreakdown;
  onIssueClick?: (input: {
    skill: string;
    bucket: 'mustHave' | 'niceToHave' | 'implicit';
    criterion: 'Intent Coverage';
  }) => void;
}) {
  const buckets: Bucket[] = [
    {
      label: 'Must-have',
      key: 'mustHave' as const,
      items: breakdown.missed.mustHave.slice(0, BUCKET_LIMIT),
      tone: 'rose',
      hint:
        'Listed as required in the JD — strongest signal of a gap. ' +
        'Add these to your skills or work history if you have them.'
    },
    {
      label: 'Nice-to-have',
      key: 'niceToHave' as const,
      items: breakdown.missed.niceToHave.slice(0, BUCKET_LIMIT),
      tone: 'amber',
      hint:
        'Mentioned as a bonus. Worth adding 1-2 to your skills list ' +
        "if they're adjacent to your experience."
    },
    {
      label: 'Implicit',
      key: 'implicit' as const,
      items: breakdown.missed.implicit.slice(0, BUCKET_LIMIT),
      tone: 'sky',
      hint:
        'Inferred by the intent extractor from role family / seniority ' +
        '(e.g. "Kubernetes" for a senior platform role). Include them ' +
        'only if you actually have hands-on experience.'
    }
  ];

  const visibleBuckets = buckets.filter((b) => b.items.length > 0);

  if (visibleBuckets.length === 0) {
    return (
      <div
        data-testid="miss-list-empty"
        className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      >
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          All intent-extracted skills are covered. Nothing else the JD
          implies is missing from your resume.
        </span>
      </div>
    );
  }

  return (
    <div data-testid="miss-list" className="mt-3 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Skill gaps
      </p>
      {visibleBuckets.map((bucket) => (
        <BucketSection
          key={bucket.label}
          bucket={bucket}
          onIssueClick={onIssueClick}
        />
      ))}
    </div>
  );
}

function BucketSection({
  bucket,
  onIssueClick
}: {
  bucket: Bucket;
  onIssueClick?: (input: {
    skill: string;
    bucket: 'mustHave' | 'niceToHave' | 'implicit';
    criterion: 'Intent Coverage';
  }) => void;
}) {
  const tone = TONE_CLASSES[bucket.tone];
  const headingId = `miss-bucket-${bucket.label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <section aria-labelledby={headingId} className="rounded-md border bg-muted/30 p-3">
      <header className="mb-1 flex items-center justify-between gap-2">
        <h4
          id={headingId}
          className={cn('text-xs font-semibold', tone.text)}
          data-testid={`miss-bucket-${bucket.label.toLowerCase().replace(/\s+/g, '-')}-heading`}
        >
          {bucket.label}
        </h4>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {bucket.items.length}
        </span>
      </header>
      <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
        {bucket.hint}
      </p>
      <ul className="space-y-1">
        {bucket.items.map((skill) => (
          <li
            key={skill}
            className="flex items-start gap-2 text-xs"
            data-testid="miss-list-item"
          >
            <XCircle
              className={cn(
                'mt-0.5 h-3 w-3 shrink-0',
                tone.text
              )}
              aria-hidden
            />
            <span className="leading-tight">{skill}</span>
            {onIssueClick && (
              <button
                type="button"
                onClick={() =>
                  onIssueClick({
                    skill,
                    bucket: bucket.key,
                    criterion: 'Intent Coverage'
                  })
                }
                className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200 transition-colors hover:bg-indigo-50 dark:text-indigo-300 dark:ring-indigo-800 dark:hover:bg-indigo-950"
                data-testid={`miss-list-show-${bucket.key}-${skill.toLowerCase().replace(/\s+/g, '-')}`}
                aria-label={`Show me where to add ${skill}`}
              >
                <Eye className="h-3 w-3" aria-hidden />
                Show me
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
