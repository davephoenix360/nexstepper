import type { Metadata } from 'next';

import {
  DEFAULT_PRINT_SETTINGS,
  coercePrintSettings,
  type PrintSettings
} from '@/lib/print-settings';

import { buildMeasurableResume } from './content';
import { MeasureClient } from './measure-client';

/**
 * Page-count measurement route — /dev/design-lab/measure
 *
 * Renders ONE template with a known amount of content, using the real
 * print CSS, so a driver script can print it to PDF and count pages.
 *
 * The point is to replace the chat assistant's guess about "is this one
 * page or three?" with a measured number. See `docs/plans/chat-agent-v3.md`
 * §"Resume craft" — the agent currently has no way to render the
 * document, so every length claim it makes is an estimate.
 *
 * Dev-only, unauthenticated, noindex (see the sibling layout).
 *
 * Query params:
 *   template   — template id (default: modern)
 *   roles      — number of work entries (default: 3)
 *   bullets    — bullets per work entry (default: 3)
 *   margin     — compact | standard | generous
 *   lineHeight — compact | standard | relaxed
 *   fontSize   — small | standard | large
 *   sectionSpacing — compact | standard | relaxed
 */
export const metadata: Metadata = {
  title: 'Page count measurement',
  robots: { index: false, follow: false }
};

type SearchParams = Record<string, string | string[] | undefined>;

function pickString(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

function pickInt(v: string | string[] | undefined, fallback: number): number {
  const s = pickString(v);
  if (s === undefined) return fallback;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export default async function MeasurePage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const templateId = pickString(params.template) ?? 'modern';
  const roles = pickInt(params.roles, 3);
  const bullets = pickInt(params.bullets, 3);
  const base = pickString(params.base) === 'minimal' ? 'minimal' : 'full';
  const hiddenSections = (pickString(params.hidden) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Build a COMPLETE settings object before Zod sees it — the schema
  // requires all four keys, so a partial would be rejected wholesale and
  // silently fall back to all-defaults.
  const raw: Record<string, string | undefined> = {
    margin: pickString(params.margin),
    lineHeight: pickString(params.lineHeight),
    fontSize: pickString(params.fontSize),
    sectionSpacing: pickString(params.sectionSpacing)
  };

  const settings: PrintSettings = coercePrintSettings({
    ...DEFAULT_PRINT_SETTINGS,
    ...Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== undefined)
    )
  });

  const data = buildMeasurableResume({ roles, bullets, base, hiddenSections });

  return <MeasureClient data={data} templateId={templateId} settings={settings} />;
}
