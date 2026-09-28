import { ChevronDown, FileText, Plus } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

import { getUser, listResumes } from '@/lib/db/queries';
import { CreateMasterResumeForm } from './_components/create-master-form';
import { ResumeList } from './_components/resume-list';

/**
 * Server Action timeout budget.
 *
 * The import-resume flow (CreateMasterResumeForm's Import tab) makes an
 * AI Gateway call that, in real production traffic, takes 60-150s with
 * the current `mistral/mistral-nemo` primary. Vercel's project default
 * `maxDuration` falls back to whatever the dashboard has set — easy to
 * land at 10s/15s if Fluid Compute wasn't enabled, which silently
 * kills every long import and returns 499 to the client.
 *
 * Setting `maxDuration: 300` explicitly on the page bumps the
 * Server Action budget for this route to 5 minutes, matching Vercel
 * Pro + Fluid Compute's default. The AI fallback chain has its own
 * inner cap (180s, set in `parseResumeText`) so we never actually
 * hit this outer limit on a happy-path import.
 *
 * Plan: docs/plans/import-ux-and-timeouts.md.
 */
export const maxDuration = 300;

/**
 * Resume list page — variant-first UX (plan: docs/plans/variant-first-ux.md).
 *
 *   - Masters render as compact library cards. Variants render as
 *     rows nested under each master, with a per-master collapse
 *     toggle (Phase 1d, plan: docs/plans/collapsible-sections.md).
 *   - The "Create a master" affordance is itself collapsible — open
 *     by default on the empty-state dashboard so the first resume
 *     can be created without an extra click; closed by default on a
 *     populated dashboard so the page reads as a library with a
 *     "+ Create" button at the top.
 *   - Both collapses use native `<details>` so they're keyboard
 *     accessible, screen-reader friendly, and zero-JS.
 *
 * Server Component: `listResumes()` (lib/db/queries.ts) returns the
 * already-grouped master→variant tree in one round trip. We never
 * re-fetch per row.
 */
export default async function ResumesPage() {
  const user = await getUser();
  const families = user ? await listResumes(user.id) : [];
  const isEmpty = families.length === 0;

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <header>
        <h1 className="text-lg lg:text-2xl font-medium">Resumes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isEmpty
            ? 'Build a master, then tailor variants for specific roles.'
            : 'Your masters are the source of truth. Variants branch off each one for specific roles.'}
        </p>
      </header>

      {/*
        Phase 1d — collapsible create card.

        Default state:
          - Empty dashboard: open. First-time users see the form
            immediately.
          - Populated dashboard: closed. The page reads as a library
            with a single "+ Create" button affordance.

        The summary is a button-styled element (Plus icon + title +
        chevron) sitting inside a Card-shaped border. When closed the
        user only sees that summary row; when open the form fills the
        card below it. Native <details> handles all keyboard / ARIA
        state for us.
      */}
      <details
        open={isEmpty}
        className="group rounded-xl border bg-card shadow-sm"
        data-testid="create-master-collapse"
      >
        <summary
          className="flex w-full cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-5 py-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          data-testid="create-master-toggle"
        >
          <span className="flex items-center gap-3 text-sm font-medium">
            <Plus
              aria-hidden
              className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-45"
            />
            Create a master resume
          </span>
          <ChevronDown
            aria-hidden
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="border-t px-5 py-4">
          <CreateMasterResumeForm />
        </div>
      </details>

      {isEmpty ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No resumes yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create your first master above to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ResumeList families={families} />
      )}
    </section>
  );
}