/**
 * TemplateThumbnail — a stylized SVG schematic of each template's
 * layout, rendered inside the gallery card.
 *
 * Why SVG schematics (not real template renders)
 *   We considered rendering the actual `<Template.Component>` at small
 *   scale with a CSS transform. Pros: 100% fidelity. Cons: 5 templates
 *   × full DOM trees = heavy first paint, layout thrash when the user
 *   scrolls, plus the templates use `@page` print CSS that fights the
 *   constrained card width.
 *
 *   SVG schematics capture each template's *visual DNA* — accent color,
 *   serif vs sans-serif, hairline vs bold, left vs right header — at
 *   a fraction of the cost. The "Preview" CTA still opens a real-render
 *   modal for users who want the actual layout.
 *
 * Design rules per template (matches the real template's chrome):
 *   - Classic   : centered serif header, hairline rules between sections,
 *                 indigo accent on section headers
 *   - Modern    : left-aligned bold sans-serif, indigo accent bar to the
 *                 LEFT of each section title
 *   - Minimal   : left-aligned sans-serif, no borders, very thin uppercase
 *                 section labels with extra spacing
 *   - Executive : right-aligned header, serif body, small-caps section
 *                 titles with slate underline rule
 *   - Creative  : left-aligned bold sans-serif, rose accent rules
 *                 between sections, rose header rule
 *
 * The thumbnails share a 320×192 viewBox so the cards' thumbnail areas
 * stay the same aspect ratio (5:3) regardless of which template is
 * rendered — the cards stay aligned.
 *
 * Why inline SVGs (not a sprite)
 *   Each template has unique geometry. A shared sprite would mean
 *   either over-fetching (load all 5 SVGs to render 1) or runtime
 *   branching. Inlining the small (≈1KB each) SVG keeps the SSR
 *   markup self-contained and matches the project's existing
 *   pattern (icons in lucide-react are also inlined).
 */

import * as React from 'react';

import type { TemplateMeta } from './types';

interface TemplateThumbnailProps {
  templateId: string;
  /** Accent palette token from the template meta. */
  accent: TemplateMeta['accent'];
  className?: string;
}

/** Accent color tokens → Tailwind class fragments. The SVG uses
 *  these as inline hex equivalents so we don't depend on Tailwind's
 *  CSS-variable resolution at SVG-fill time. */
const ACCENT_HEX: Record<TemplateMeta['accent'], string> = {
  indigo: '#4f46e5',
  slate: '#475569',
  emerald: '#059669',
  rose: '#e11d48',
  amber: '#d97706'
};

const INK = '#0f172a'; // slate-900 — body text
const INK_MUTED = '#64748b'; // slate-500 — secondary text
const RULE = '#e4e4e7'; // zinc-200 — hairlines
const PAPER = '#ffffff';

export function TemplateThumbnail({
  templateId,
  accent,
  className
}: TemplateThumbnailProps) {
  const accentHex = ACCENT_HEX[accent];
  switch (templateId) {
    case 'classic':
      return (
        <ClassicThumbnail className={className} accent={accentHex} />
      );
    case 'modern':
      return <ModernThumbnail className={className} accent={accentHex} />;
    case 'minimal':
      return <MinimalThumbnail className={className} accent={accentHex} />;
    case 'executive':
      return (
        <ExecutiveThumbnail className={className} accent={accentHex} />
      );
    case 'creative':
      return <CreativeThumbnail className={className} accent={accentHex} />;
    default:
      // Unknown template — render a neutral page outline so the card
      // doesn't crash. The Preview modal still handles the real render.
      return <GenericThumbnail className={className} />;
  }
}

/* --------------------------------------------------------------------- *
 * Shared chrome
 * --------------------------------------------------------------------- */

/** Background "paper" with subtle drop-shadow + thin border. */
function PaperFrame({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 320 192"
      xmlns="http://www.w3.org/2000/svg"
      // preserveAspectRatio="xMidYMid meet" keeps the thumbnail
      // centered if the consumer's box has a non-5:3 aspect ratio.
      preserveAspectRatio="xMidYMid meet"
      // role="img" + aria-label so screen readers treat the SVG as
      // a single decorative image instead of walking the geometry.
      role="img"
      aria-hidden="true"
      data-testid="template-thumbnail-svg"
      className={className}
    >
      {/*
        Outer drop-shadow rectangle — gives the "page is hovering
        above the card" affordance. The shadow is baked into the SVG
        so it doesn't depend on Tailwind's shadow utility rendering
        at the right z-index over the card background.
      */}
      <rect
        x="2"
        y="2"
        width="316"
        height="188"
        rx="6"
        fill={PAPER}
        stroke={RULE}
        strokeWidth="1"
      />
      {children}
    </svg>
  );
}

/* --------------------------------------------------------------------- *
 * Templates
 * --------------------------------------------------------------------- */

/**
 * Classic — centered name + contact, hairline rules between sections.
 */
function ClassicThumbnail({
  accent,
  className
}: {
  accent: string;
  className?: string;
}) {
  return (
    <PaperFrame className={className}>
      {/* Header — centered name + contact line */}
      <g>
        <rect x="118" y="20" width="84" height="8" rx="1" fill={INK} />
        <rect x="92" y="36" width="136" height="3" rx="1" fill={INK_MUTED} />
      </g>
      <line x1="48" y1="58" x2="272" y2="58" stroke={RULE} strokeWidth="1" />

      {/* Summary section */}
      <g>
        <rect x="48" y="70" width="40" height="4" rx="1" fill={accent} />
        <rect x="48" y="80" width="220" height="2.5" rx="1" fill={INK_MUTED} />
        <rect x="48" y="86" width="180" height="2.5" rx="1" fill={INK_MUTED} />
      </g>

      {/* Experience section — two entries */}
      <g>
        <rect x="48" y="102" width="56" height="4" rx="1" fill={accent} />
        <rect x="48" y="114" width="120" height="3" rx="1" fill={INK} />
        <rect x="48" y="121" width="180" height="2" rx="1" fill={INK_MUTED} />
        <rect x="48" y="127" width="160" height="2" rx="1" fill={INK_MUTED} />

        <rect x="48" y="140" width="120" height="3" rx="1" fill={INK} />
        <rect x="48" y="147" width="180" height="2" rx="1" fill={INK_MUTED} />
        <rect x="48" y="153" width="140" height="2" rx="1" fill={INK_MUTED} />
      </g>
    </PaperFrame>
  );
}

/**
 * Modern — left accent bar on each section title, bold sans-serif.
 */
function ModernThumbnail({
  accent,
  className
}: {
  accent: string;
  className?: string;
}) {
  return (
    <PaperFrame className={className}>
      {/* Header — left-aligned bold name, contact line below */}
      <g>
        <rect x="24" y="20" width="100" height="10" rx="1" fill={INK} />
        <rect x="24" y="38" width="160" height="3" rx="1" fill={INK_MUTED} />
      </g>
      <line x1="24" y1="54" x2="296" y2="54" stroke={accent} strokeWidth="3" />

      {/* Section with accent bar — bold title + body */}
      <g>
        <rect x="24" y="62" width="3" height="14" fill={accent} />
        <rect x="34" y="64" width="60" height="6" rx="1" fill={INK} />
        <rect x="34" y="76" width="240" height="2.5" rx="1" fill={INK_MUTED} />
        <rect x="34" y="83" width="200" height="2.5" rx="1" fill={INK_MUTED} />
      </g>

      <g>
        <rect x="24" y="100" width="3" height="14" fill={accent} />
        <rect x="34" y="102" width="80" height="6" rx="1" fill={INK} />
        <rect x="34" y="114" width="240" height="2.5" rx="1" fill={INK_MUTED} />
        <rect x="34" y="121" width="180" height="2.5" rx="1" fill={INK_MUTED} />
      </g>

      <g>
        <rect x="24" y="138" width="3" height="14" fill={accent} />
        <rect x="34" y="140" width="50" height="6" rx="1" fill={INK} />
        <rect x="34" y="152" width="220" height="2.5" rx="1" fill={INK_MUTED} />
        <rect x="34" y="159" width="160" height="2.5" rx="1" fill={INK_MUTED} />
      </g>
    </PaperFrame>
  );
}

/**
 * Minimal — no borders, lots of whitespace, thin uppercase section
 * labels with extra letter-spacing (rendered as smaller, lighter rects).
 */
function MinimalThumbnail({
  accent,
  className
}: {
  accent: string;
  className?: string;
}) {
  return (
    <PaperFrame className={className}>
      {/* Header — name with thin underline */}
      <g>
        <rect x="24" y="18" width="80" height="9" rx="1" fill={INK} />
        <rect x="24" y="32" width="40" height="1.5" fill={accent} />
        <rect x="24" y="40" width="140" height="2.5" rx="1" fill={INK_MUTED} />
      </g>

      {/* First section — extra top spacing, tiny uppercase label */}
      <g>
        <rect
          x="24"
          y="62"
          width="22"
          height="3"
          rx="0.5"
          fill={INK_MUTED}
        />
        <rect x="24" y="76" width="240" height="2" rx="1" fill={INK_MUTED} />
        <rect x="24" y="84" width="180" height="2" rx="1" fill={INK_MUTED} />
      </g>

      <g>
        <rect
          x="24"
          y="104"
          width="34"
          height="3"
          rx="0.5"
          fill={INK_MUTED}
        />
        <rect x="24" y="118" width="120" height="2" rx="1" fill={INK_MUTED} />
        <rect x="24" y="126" width="220" height="2" rx="1" fill={INK_MUTED} />
        <rect x="24" y="134" width="160" height="2" rx="1" fill={INK_MUTED} />
      </g>

      <g>
        <rect
          x="24"
          y="156"
          width="28"
          height="3"
          rx="0.5"
          fill={INK_MUTED}
        />
        <rect x="24" y="170" width="100" height="2" rx="1" fill={INK_MUTED} />
        <rect x="24" y="178" width="80" height="2" rx="1" fill={INK_MUTED} />
      </g>
    </PaperFrame>
  );
}

/**
 * Executive — right-aligned header, serif body, slate underline
 * beneath small-caps section titles.
 */
function ExecutiveThumbnail({
  accent,
  className
}: {
  accent: string;
  className?: string;
}) {
  return (
    <PaperFrame className={className}>
      {/* Right-aligned header — name + contact */}
      <g>
        <rect x="148" y="20" width="148" height="10" rx="1" fill={INK} />
        <rect x="180" y="38" width="116" height="3" rx="1" fill={INK_MUTED} />
      </g>
      <line x1="48" y1="56" x2="296" y2="56" stroke={accent} strokeWidth="1" />

      {/* Section with underline */}
      <g>
        <rect
          x="48"
          y="68"
          width="40"
          height="5"
          rx="1"
          fill={INK}
        />
        <rect x="48" y="78" width="248" height="0.75" fill={accent} />
        <rect x="48" y="90" width="120" height="3" rx="1" fill={INK} />
        <rect x="48" y="98" width="220" height="2" rx="1" fill={INK_MUTED} />
        <rect x="48" y="105" width="180" height="2" rx="1" fill={INK_MUTED} />
      </g>

      <g>
        <rect
          x="48"
          y="124"
          width="56"
          height="5"
          rx="1"
          fill={INK}
        />
        <rect x="48" y="134" width="248" height="0.75" fill={accent} />
        <rect x="48" y="146" width="120" height="3" rx="1" fill={INK} />
        <rect x="48" y="154" width="200" height="2" rx="1" fill={INK_MUTED} />
        <rect x="48" y="161" width="160" height="2" rx="1" fill={INK_MUTED} />
      </g>
    </PaperFrame>
  );
}

/**
 * Creative — bold sans-serif header, rose accent rules between
 * sections, rose contact strip.
 */
function CreativeThumbnail({
  accent,
  className
}: {
  accent: string;
  className?: string;
}) {
  return (
    <PaperFrame className={className}>
      {/* Header — bold name + small rose square (matches Creative's
          "small colored square next to the name" chrome) */}
      <g>
        <rect x="20" y="20" width="6" height="6" fill={accent} />
        <rect x="32" y="20" width="100" height="10" rx="1" fill={INK} />
        <rect x="20" y="40" width="200" height="3" rx="1" fill={accent} />
      </g>

      {/* Section title with rose rule underneath */}
      <g>
        <rect x="20" y="62" width="80" height="6" rx="1" fill={INK} />
        <rect x="20" y="74" width="280" height="1" fill={accent} />
        <rect x="20" y="84" width="120" height="3" rx="1" fill={INK} />
        <rect x="20" y="92" width="220" height="2" rx="1" fill={INK_MUTED} />
        <rect x="20" y="99" width="180" height="2" rx="1" fill={INK_MUTED} />
      </g>

      <g>
        <rect x="20" y="118" width="80" height="6" rx="1" fill={INK} />
        <rect x="20" y="130" width="280" height="1" fill={accent} />
        <rect x="20" y="140" width="120" height="3" rx="1" fill={INK} />
        <rect x="20" y="148" width="220" height="2" rx="1" fill={INK_MUTED} />
        <rect x="20" y="155" width="160" height="2" rx="1" fill={INK_MUTED} />
      </g>
    </PaperFrame>
  );
}

/** Fallback for unknown template ids — a neutral "page" outline. */
function GenericThumbnail({ className }: { className?: string }) {
  return (
    <PaperFrame className={className}>
      <rect x="48" y="40" width="224" height="3" rx="1" fill={INK_MUTED} />
      <rect x="48" y="60" width="80" height="6" rx="1" fill={INK} />
      <rect x="48" y="74" width="224" height="2" rx="1" fill={INK_MUTED} />
      <rect x="48" y="82" width="180" height="2" rx="1" fill={INK_MUTED} />
      <rect x="48" y="100" width="80" height="6" rx="1" fill={INK} />
      <rect x="48" y="114" width="224" height="2" rx="1" fill={INK_MUTED} />
      <rect x="48" y="122" width="160" height="2" rx="1" fill={INK_MUTED} />
    </PaperFrame>
  );
}
