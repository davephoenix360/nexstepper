import type { Metadata } from 'next';

import { ReorderLabClient } from './reorder-client';

/**
 * Drag-to-reorder verification surface — /dev/design-lab/reorder.
 *
 * Mirrors the contract from `fix/template-edit-affordances`'s
 * design-lab idea: an unauthenticated dev route that exercises a
 * editor-only behavior so a reviewer can verify it in the browser
 * without signing in, opening the gallery, or building a fake
 * resume. The main `/dev/design-lab` page renders templates with
 * `editable={false}` (read-only review surface); this sub-page
 * mounts Modern in `editable={true}` so the drag handles are
 * present.
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
    'Internal verification surface — Modern template with editable=true so drag-to-reorder handles render.',
  robots: { index: false, follow: false }
};

export default function ReorderLabPage() {
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
                Modern template · editable · sample data · not indexed
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-8">
        <ReorderLabClient />
      </main>
    </div>
  );
}
