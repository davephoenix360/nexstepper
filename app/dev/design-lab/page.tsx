import Link from 'next/link';

import { DesignLabClient } from './design-lab-client';
import { listTemplates } from '@/components/resume-templates';
import {
  DEFAULT_PRINT_SETTINGS,
  coercePrintSettings
} from '@/lib/print-settings';

/**
 * Design Lab — /dev/design-lab
 *
 * Unauthenticated visual review surface: every registered template
 * rendered against `gallerySampleResumeData`, stacked top to bottom.
 *
 * Architecture: this route is a server component so it can
 *   - export `metadata` (noindex — see layout.tsx)
 *   - read `searchParams` directly on the server, with no
 *     `useSearchParams()` SSR/client dance, so the initial render
 *     already reflects `?margin=compact&...` without a flash
 * The interactive part (the print-settings panel, the template
 * rendering) lives in <DesignLabClient>, a 'use client' island.
 * The static dev banner stays here so the route chrome and the
 * template nav render without JS.
 *
 * No auth, no PII, no editor state. Linked by URL only; the layout
 * publishes `robots: noindex,nofollow` so a stray link doesn't
 * surface it in search.
 */

const PRINT_KEYS = [
  'margin',
  'lineHeight',
  'fontSize',
  'sectionSpacing'
] as const;

type PrintKey = (typeof PRINT_KEYS)[number];

export default async function DesignLabPage({
  searchParams
}: {
  // In Next.js 15, `searchParams` on a server page is a Promise. We
  // await it explicitly (older Next.js versions passed a plain object).
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // Build a complete PrintSettings object so `coercePrintSettings`
  // (which validates the whole shape with Zod) doesn't reject a
  // partial and fall back to all-defaults. Every URL key is optional;
  // anything missing keeps the default. Anything malformed (e.g.
  // ?margin=huge) still falls back to the default for that one key
  // when the string fails Zod's enum.
  const urlValues: Record<PrintKey, string | undefined> = {
    margin: pickString(params.margin),
    lineHeight: pickString(params.lineHeight),
    fontSize: pickString(params.fontSize),
    sectionSpacing: pickString(params.sectionSpacing)
  };
  const initialSettings = coercePrintSettings(
    PRINT_KEYS.reduce(
      (acc, key) => {
        const v = urlValues[key];
        if (v !== undefined) acc[key] = v;
        return acc;
      },
      { ...DEFAULTS } as Record<PrintKey, string>
    )
  );

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-amber-300 bg-amber-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
              Dev tool
            </span>
            <div>
              <h1 className="text-sm font-bold leading-tight">Design Lab</h1>
              <p className="text-[11px] leading-tight text-amber-900/70">
                Every template · shared sample data · read-only · not
                indexed
              </p>
            </div>
          </div>
          <TemplateNav />
        </div>
      </header>

      <main className="space-y-10 px-4 py-8">
        <IntroCard />
        <DesignLabClient initialSettings={initialSettings} />
      </main>
    </div>
  );
}

function TemplateNav() {
  // Server-rendered: anchor links to each template's section. The
  // section ids are built by the client island (`tpl-${ts.id}`),
  // but the server doesn't need to know the values — `href` is a
  // static fragment that the browser resolves once the client mounts.
  const templates = listTemplates();
  return (
    <nav aria-label="Templates" className="flex flex-wrap gap-1.5">
      {templates.map((t) => (
        <Link
          key={t.meta.id}
          href={`#tpl-${t.meta.id}`}
          className="rounded border border-amber-300 px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
        >
          {t.meta.name}
        </Link>
      ))}
    </nav>
  );
}

function IntroCard() {
  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-sm">
      <p>
        Visual review surface for the six registered templates. All
        of them render against the same{' '}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-[12px]">
          gallerySampleResumeData
        </code>{' '}
        fixture so layout, typography, and per-template identity can
        be compared side by side.
      </p>
      <p className="mt-2 text-[12px] text-zinc-500">
        The{' '}
        <strong className="font-semibold">Print settings</strong>{' '}
        panel applies the same{' '}
        <code className="rounded bg-zinc-100 px-1 py-0.5">
          --resume-*
        </code>{' '}
        CSS variables the editor uses, so changes here preview the
        exact WYSIWYG output the editor renders. Settings are
        reflected in the URL for shareable links.
      </p>
    </div>
  );
}

const DEFAULTS: Record<PrintKey, string> = {
  margin: DEFAULT_PRINT_SETTINGS.margin,
  lineHeight: DEFAULT_PRINT_SETTINGS.lineHeight,
  fontSize: DEFAULT_PRINT_SETTINGS.fontSize,
  sectionSpacing: DEFAULT_PRINT_SETTINGS.sectionSpacing
};

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}