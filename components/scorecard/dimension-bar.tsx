import { cn } from '@/lib/utils';

/**
 * One horizontal dimension bar — label, filled fraction, numeric
 * score, color-coded by tier (green / amber / red per plan §"User-
 * visible behavior").
 *
 * Pure presentational component. Receives the score (0-100) and the
 * label. The color tier comes from `tierFor(score)`:
 *   - green: ≥ 80
 *   - amber: 50-79
 *   - red:   < 50
 *
 * Thresholds inherited from the plan §"Open questions" #2 default
 * (80/50). Exported as a constant so a future calibration pass can
 * shift the bands without touching the component.
 */

export const SCORE_GREEN_THRESHOLD = 80;
export const SCORE_AMBER_THRESHOLD = 50;

export type ScoreTier = 'green' | 'amber' | 'red';

export function tierFor(score: number): ScoreTier {
  if (score >= SCORE_GREEN_THRESHOLD) return 'green';
  if (score >= SCORE_AMBER_THRESHOLD) return 'amber';
  return 'red';
}

const TIER_BAR_BG: Record<ScoreTier, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500'
};

const TIER_TEXT: Record<ScoreTier, string> = {
  green: 'text-emerald-700 dark:text-emerald-400',
  amber: 'text-amber-700 dark:text-amber-400',
  red: 'text-rose-700 dark:text-rose-400'
};

export function DimensionBar({
  label,
  score,
  testId
}: {
  label: string;
  score: number;
  testId?: string;
}) {
  const safeScore = Math.max(0, Math.min(100, score));
  const tier = tierFor(safeScore);

  return (
    <li
      data-testid={testId ?? `score-dim-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className="flex items-center gap-3"
    >
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width]',
            TIER_BAR_BG[tier]
          )}
          style={{ width: `${safeScore}%` }}
          aria-hidden
        />
      </div>
      <span
        data-testid={`${testId ?? label}-score`}
        className={cn(
          'w-9 shrink-0 text-right font-mono text-xs tabular-nums',
          TIER_TEXT[tier]
        )}
      >
        {Math.round(safeScore)}
      </span>
    </li>
  );
}
