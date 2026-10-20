import type { Metadata } from 'next';

import { getTemplate } from '@/components/resume-templates';
import { ReorderLabClient } from './reorder-client';

/**
 * Editor-mode verification surface — /dev/design-lab/reorder.
 *
 * Mirrors the contract from `fix/template-edit-affordances`'s
 * design-lab idea: an unauthenticated dev route that exercises an
 * editor-only behavior so a reviewer can verify it in the browser
 * without signing in, opening the gallery, or building a fake
 * resume. The main `/dev/design-lab` page renders templates with
 * `editable={false}` (read-only review surface); this sub-page
 * mounts one template in `editable={true}` so the drag handles and
 * click-to-edit fields are present.
 *
 * `?template=<id>` selects which one (defaults to `modern`, which is
 * what this route was built for). It was hardcoded to Modern until
 * Jake shipped and there was no way to eyeball Jake's EDITOR surface
 * without signing in — a real gap, because the read-only lab cannot
 * show editability at all. Any registry id works.
 *
 * Why a sub-page and not a new section on the main page:
 *  - Drag needs a FormProvider ancestor; mounting it on the main
 *    design-lab page would mean every template runs through RHF,
 *    which adds cost to a route whose whole point is "look at the
 *    paint."
 *  - Separating it keeps the read-only review surface predictable:
 *    when you open /dev/design-lab you see static templates.
 *
 * Layout: this page is a server component so it can publish the
 * noindex meta tag and the route noindex shield, then hand off to
 * <ReorderLabClient />, a client island that owns the live RHF
 * state and the template render.
 */

export const metadata: Metadata = {
  title: 'Drag-to-reorder Lab — Nexstepper',
  description:
    'Internal verification surface — a template with editable=true so drag-to-reorder handles and click-to-edit fields render.',
  robots: { index: false, follow: false }
};

export default async function ReorderLabPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // `page.tsx` is a server component in Next 16 — `searchParams` is
  // async and must be awaited (same pattern as /dev/design-lab).
  const params = await searchParams;
  const raw = params.template;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  // Unknown ids fall back to modern rather than throwing — this is a
  // dev convenience route, not a user-facing surface.
  const resolved = requested && getTemplate(requested) ? requested : 'modern';
  const meta = getTemplate(resolved).meta;

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-amber-300 bg-amber-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
              Dev tool
            </span>
            <div>
              <h1 className="text-sm font-bold leading-tight">
                Drag-to-reorder Lab
              </h1>
              <p className="text-[11px] leading-tight text-amber-900/70">
                {meta.name} template · editable · sample data · not indexed
              </p>
            </div>
          </div>
          <nav aria-label="Template" className="flex flex-wrap gap-1.5">
            {['modern', 'jake'].map((id) => (
              <a
                key={id}
                href={`/dev/design-lab/reorder?template=${id}`}
                className={`rounded border border-amber-300 px-2 py-1 text-[11px] font-medium ${
                  id === resolved
                    ? 'bg-amber-200 text-amber-950'
                    : 'text-amber-900 hover:bg-amber-100'
                }`}
              >
                {getTemplate(id).meta.name}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="px-4 py-8">
        <ReorderLabClient templateId={resolved} />
      </main>
    </div>
  );
}
