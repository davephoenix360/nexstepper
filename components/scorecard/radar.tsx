'use client';

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

import type { ScoreBreakdown } from '@/lib/scoring';
import { tierFor, type ScoreTier } from './dimension-bar';

/**
 * 7-dimension radar chart for the ATS scorecard.
 *
 * **Plan:** docs/plans/ats-scoring-v2.md §"Phase 3 — UI: radar
 * chart (Recharts)".
 *
 * Renders the seven `dimensionScores` (4 v1 + 3 v2) as a single-glance
 * "shape" view that complements the horizontal bars. The fill/stroke
 * color follows the **overall** tier so the user sees both the
 * per-dim breakdown (the bars) and the headline score (the badge)
 * in one radar.
 *
 * **Why Recharts:** see `docs/decisions/0004-recharts-for-ats-radar.md`.
 * Built-in tooltip, legend, and responsive sizing; pairs with
 * shadcn's chart recipe if we adopt it later.
 *
 * **SSR caveat:** `ResponsiveContainer` measures the parent on mount,
 * so this is a Client Component (matches the parent scorecard).
 */

// Display labels are slightly shortened from the canonical dimension
// keys so they fit inside the radar's angle-axis labels without
// truncation. Tooltips show the full name.
const RADAR_DIMENSIONS: Array<{
  key: keyof ScoreBreakdown['dimensionScores'];
  short: string;
  full: string;
}> = [
  { key: 'atsMatching', short: 'Keywords', full: 'ATS matching' },
  { key: 'structure', short: 'Format', full: 'Structure' },
  { key: 'contentQuality', short: 'Impact', full: 'Content quality' },
  { key: 'alignment', short: 'Experience', full: 'Experience match' },
  { key: 'intentCoverage', short: 'Intent', full: 'Intent coverage' },
  { key: 'roleFit', short: 'Role', full: 'Role fit' },
  { key: 'seniorityFit', short: 'Seniority', full: 'Seniority fit' }
];

const TIER_STROKE: Record<ScoreTier, string> = {
  strong: '#10b981', // emerald-500
  good: '#84cc16', // lime-500
  partial: '#f59e0b', // amber-500
  limited: '#f97316', // orange-500
  'needs-work': '#f43f5e' // rose-500
};

const TIER_FILL: Record<ScoreTier, string> = {
  strong: 'rgba(16, 185, 129, 0.25)',
  good: 'rgba(132, 204, 22, 0.25)',
  partial: 'rgba(245, 158, 11, 0.25)',
  limited: 'rgba(249, 115, 22, 0.25)',
  'needs-work': 'rgba(244, 63, 94, 0.25)'
};

type TooltipPayload = {
  payload: { dimension: string; score: number };
};

function RadarTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0]?.payload;
  if (!entry) return null;
  return (
    <div
      data-testid="radar-tooltip"
      className="rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm"
    >
      <p className="font-medium">{entry.dimension}</p>
      <p className="tabular-nums text-muted-foreground">
        {Math.round(entry.score)} / 100
      </p>
    </div>
  );
}

export function AtsRadar({ breakdown }: { breakdown: ScoreBreakdown }) {
  const data = RADAR_DIMENSIONS.map((d) => ({
    dimension: d.short,
    dimensionFull: d.full,
    score: breakdown.dimensionScores[d.key]
  }));

  const tier = tierFor(breakdown.overallScore);
  const stroke = TIER_STROKE[tier];
  const fill = TIER_FILL[tier];

  return (
    <div
      data-testid="ats-radar"
      className="mt-3 rounded-md border bg-muted/20 p-2"
      aria-label="7-dimension ATS score radar"
    >
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <PolarGrid
            stroke="currentColor"
            strokeOpacity={0.15}
            gridType="polygon"
          />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 10, fill: 'currentColor' }}
            tickLine={false}
          />
          <PolarRadiusAxis
            domain={[0, 100]}
            tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.4 }}
            tickCount={4}
            axisLine={false}
            stroke="currentColor"
            strokeOpacity={0.2}
          />
          <Radar
            name="ATS score"
            dataKey="score"
            stroke={stroke}
            fill={fill}
            fillOpacity={1}
            strokeWidth={2}
            isAnimationActive={false}
            dot={{ r: 2, fill: stroke }}
          />
          <Tooltip content={<RadarTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
