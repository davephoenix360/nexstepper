# 0004 — Recharts for the ATS radar chart

## Context

Phase 3 of the ATS scoring v2 plan (`docs/plans/ats-scoring-v2.md`)
introduces a 7-dimension radar visualization next to the existing
horizontal dimension bars. The 7 dimensions are: `atsMatching`,
`structure`, `contentQuality`, `alignment` (Phase 1) plus
`intentCoverage`, `roleFit`, `seniorityFit` (Phase 2). The radar
gives users a single-glance view of where their resume is strong vs.
weak — bars force sequential reading; radar surfaces shape.

The locked UI stack is **shadcn/ui + Tailwind v4, no MUI, no extra
CSS-in-JS libs**. That tells us the chart lib must be either
Recharts (the de-facto React chart lib, paired with shadcn's chart
recipes) or a hand-rolled SVG. There is no in-stack charting option.

## Decision

Add **`recharts`** to the locked stack (`^3.x` — current stable).

- **Picked over a custom SVG radar** because:
  - Recharts is ~150 KB gzipped — a meaningful but bounded cost.
  - Built-in tooltip, legend, and accessibility wiring we'd otherwise
    have to write ourselves (radius labels, ARIA, focus handling).
  - shadcn/ui ships a `Chart` component recipe (`components/ui/chart.tsx`)
    that wraps Recharts and integrates with our Tailwind tokens —
    that's the same "thin shadcn layer over a strong primitive"
    pattern we already use for the rest of the UI.
- **Picked over alternatives** (Visx, Victory, Nivo):
  - Recharts has the best shadcn integration (the recipe above).
  - Visx is more flexible but requires more code per chart.
  - Nivo and Victory are larger and less actively maintained.

## Consequences

**Good:**
- ~30 LOC integration via `components/scorecard/radar.tsx` (vs ~200
  for a custom SVG that handles the same tooltip/legend/responsive
  concerns).
- Built-in responsive sizing (`<ResponsiveContainer>`) matches the
  right-rail's collapsible layout.
- Future phases (e.g., a "score over time" chart on the resume
  detail page) reuse the same `Chart` recipe.
- Tier-color theming via `ChartContainer`'s `config` prop aligns
  with our existing 5-tier color tokens.

**Bad:**
- New locked-stack dep. ~150 KB added to the client bundle.
- Recharts 3.x is React-19-compatible but requires `react-dom/client`
  hydration — we've already migrated so no extra work.
- Recharts' default tooltip styles ship inline; we override via
  shadcn's recipe to stay consistent with the rest of the UI.

**Forecloses:**
- Adopting a second chart library for adjacent needs (stick with
  Recharts or hand-roll).
- Trading for Visx later — would need a fresh ADR.

## Alternatives considered

- **Custom SVG radar (~200 LOC)** — Considered seriously; rejected
  because the tooltip + legend + ARIA wiring alone is ~80 LOC and
  the maintenance cost (a11y regressions, responsive quirks) is
  higher than the bundle-cost of Recharts.
- **Visx (`@visx/*`)** — More flexible, smaller core. Rejected
  because Visx is composed of ~10 sub-packages and the integration
  story with shadcn is much weaker than Recharts'.
- **No radar — keep horizontal bars only** — Rejected because the
  radar's "shape" affordance is genuinely better for comparing 7
  dimensions at a glance, and the user explicitly chose to ship it.

## Rollback

If Recharts becomes a maintenance burden (e.g., a project sunset,
unfixed React 19 regressions):
1. Remove `recharts` from `package.json`.
2. Replace `components/scorecard/radar.tsx` with a ~200 LOC SVG
   radar using the same `ScoreBreakdown.dimensionScores` data.
3. Update the locked stack note in `AGENTS.md` to remove the
   `Recharts` row.

The radar is a pure-presentation component — its data contract is
`ScoreBreakdown`, which doesn't change. Rollback is contained.
