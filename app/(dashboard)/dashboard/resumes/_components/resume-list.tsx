import Link from 'next/link';
import { ArrowRight, ChevronDown, GitBranch, Library } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ResumeFamily } from '@/lib/db/queries';
import type { Resume } from '@/lib/db/schema';
import {
  tierFor,
  type ScoreTier
} from '@/components/scorecard/dimension-bar';

import { CreateVariantButton } from './create-variant-button';
import { CreateVariantFromJdButton } from './create-variant-from-jd-button';
import { DeleteResumeButton } from './delete-resume-button';

/**
 * Master→variant tree for /dashboard/resumes.
 *
 * Slice 1 of the variant-first UX (plan: docs/plans/variant-first-ux.md).
 *
 *   - Masters render as compact "library cards" — they're the source
 *     of truth, but the *editorial* surface is the variant.
 *   - Variants render as rows nested under their master, each linking
 *     to the variant editor.
 *   - Each master carries an "actions" slot (currently the deep-copy
 *     "Tailor this for a job" CTA; Slice 3 will add the "Create
 *     variant from JD" CTA alongside). The slot is a render prop so
 *     the list stays trivially testable in SSR without dragging in
 *     the client `useRouter` button.
 *   - `<a>` / Link rendering is also injected so unit tests don't
 *     have to mount Next's app router to render the tree.
 *   - The list itself is a Server Component: `listResumes()` runs in
 *     the page and hands us already-grouped `ResumeFamily[]`. No
 *     per-row fetches, no client round-trip just to render the tree.
 *
 * Plan: docs/plans/ats-scoring.md §"User-visible behavior" — the
 * variant row also gets a single-number score badge (computed
 * server-side in `listResumes`).
 *
 * Master/variant distinction comes from the row's `isMaster` /
 * `parentResumeId` columns (see AGENTS.md "Data model truths"). The
 * `resumeVariants` table (Phase 2.4a, AI-tailoring outputs) is a
 * DIFFERENT concept and does not appear here.
 */
export function ResumeList({
  families,
  renderVariantActions = defaultVariantActions,
  renderLink = defaultLink
}: {
  families: ResumeFamily[];
  /**
   * Per-master actions render prop. Receives the master row and its
   * current variant count so destructive affordances can warn about
   * cascades (e.g. delete-master with N variants).
   */
  renderVariantActions?: (master: Resume, variantCount: number) => React.ReactNode;
  renderLink?: React.ComponentType<
    React.ComponentPropsWithoutRef<typeof Link> & {
      children?: React.ReactNode;
    }
  >;
}) {
  if (families.length === 0) return null;

  return (
    <ul
      className="space-y-4"
      aria-label="Master resumes and their variants"
    >
      {families.map(({ master, variants, variantScores }) => (
        <li key={master.id}>
          <MasterCard
            master={master}
            variants={variants}
            variantScores={variantScores}
            actions={renderVariantActions(master, variants.length)}
            renderLink={renderLink}
          />
        </li>
      ))}
    </ul>
  );
}

/** Default render prop used by the dashboard route. */
function defaultVariantActions(master: Resume, variantCount: number) {
  const masterId = master.id;
  const masterName = master.name || 'Untitled master';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/dashboard/resumes/${masterId}`}>
          Open master
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
      <CreateVariantFromJdButton masterId={masterId} masterName={masterName} />
      <CreateVariantButton masterId={masterId} />
      <DeleteResumeButton
        resumeId={masterId}
        resumeName={masterName}
        isMaster
        variantCount={variantCount}
      />
    </div>
  );
}

function defaultLink(
  props: React.ComponentProps<typeof Link>
): React.ReactElement {
  // Forwarded as-is to the real Next Link.
  return <Link {...props} />;
}

// ─── Master (library card) ──────────────────────────────────────────────────

function MasterCard({
  master,
  variants,
  variantScores,
  actions,
  renderLink: LinkEl
}: {
  master: Resume;
  variants: Resume[];
  variantScores: Record<string, number | null>;
  actions: React.ReactNode;
  renderLink: React.ComponentType<
    React.ComponentPropsWithoutRef<typeof Link> & {
      children?: React.ReactNode;
    }
  >;
}) {
  const variantCount = variants.length;

  return (
    <Card
      data-testid={`master-card-${master.id}`}
      className="overflow-hidden"
    >
      <CardHeader className="space-y-3 bg-muted/30 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Library className="h-3.5 w-3.5" />
              Master library
            </div>
            <LinkEl
              href={`/dashboard/resumes/${master.id}`}
              className="block truncate text-base font-medium hover:underline"
              data-testid={`master-name-${master.id}`}
            >
              {master.name || 'Untitled master'}
            </LinkEl>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                Updated{' '}
                <time dateTime={master.updatedAt.toISOString()}>
                  {formatRelativeDate(master.updatedAt)}
                </time>
              </span>
              {variantCount > 0 && <span aria-hidden>•</span>}
              {variantCount === 0 && (
                <span data-testid={`variant-count-${master.id}`}>
                  No variants yet
                </span>
              )}
              <TemplateBadge template={master.template} />
            </div>
          </div>

          {actions}
        </div>
      </CardHeader>

      {variantCount > 0 && (
        <CardContent className="p-0">
          {/*
            Phase 1d — variant collapse. We wrap the variant <ul> in a
            <details> element so the user can collapse / expand the
            list with one click. Native <details> gives us keyboard
            accessibility (Tab to focus, Space/Enter to toggle) and
            ARIA state ("disclosure, expanded / collapsed") for free,
            and the `open` attribute is server-rendered so there's no
            hydration concern.

            The custom summary row replaces the old variant-count
            <span> from the header — it's the affordance AND the
            count in one place. The ChevronDown icon flips 180° via
            `group-open:rotate-180` when the details is open. The
            default state is `open` so users see their variants
            without an extra click; users with many variants collapse
            the list to scan the master library faster.
          */}
          <details
            open
            className="group border-t"
            data-testid={`variants-collapse-${master.id}`}
          >
            <summary
              className={cn(
                'flex w-full cursor-pointer select-none items-center justify-between gap-2',
                'px-5 py-2 text-xs font-medium text-muted-foreground',
                'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
              )}
              data-testid={`variants-toggle-${master.id}`}
            >
              <span
                data-testid={`variant-count-${master.id}`}
                className="flex items-center gap-1.5"
              >
                <GitBranch className="h-3.5 w-3.5" />
                {variantCount} variant{variantCount === 1 ? '' : 's'}
              </span>
              <ChevronDown
                aria-hidden
                className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <ul
              className="divide-y"
              aria-label={`Variants of ${master.name}`}
            >
              {variants.map((variant) => (
                <VariantRow
                  key={variant.id}
                  variant={variant}
                  score={variantScores[variant.id] ?? null}
                  renderLink={LinkEl}
                />
              ))}
            </ul>
          </details>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Variant row ────────────────────────────────────────────────────────────

function VariantRow({
  variant,
  score,
  renderLink: LinkEl
}: {
  variant: Resume;
  score: number | null;
  renderLink: React.ComponentType<
    React.ComponentPropsWithoutRef<typeof Link> & {
      children?: React.ReactNode;
    }
  >;
}) {
  const status = (variant.status ?? 'draft').toLowerCase();

  return (
    <li>
      <LinkEl
        href={`/dashboard/resumes/${variant.id}`}
        data-testid={`variant-row-${variant.id}`}
        className={cn(
          'group flex items-center gap-3 px-5 py-3 transition-colors',
          'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
        )}
      >
        <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {variant.name || 'Untitled variant'}
          </p>
          {/*
            The meta row below MUST be a <div>, not a <p>: the
            <StatusBadge> renders a <div> (Badge's default element)
            and HTML5 forbids block elements inside <p>. When the
            browser parses the server HTML it auto-closes the <p>
            before the inner <div>, which breaks the React tree
            and triggers a hydration mismatch. The first <p> above
            (the variant name) stays a real paragraph because it's
            the visible text content; only the meta row gets a <div>.
          */}
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Updated{' '}
              <time dateTime={variant.updatedAt.toISOString()}>
                {formatRelativeDate(variant.updatedAt)}
              </time>
            </span>
            <StatusBadge status={status} />
          </div>
        </div>
        {score !== null && <ScoreBadge score={score} />}
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </LinkEl>
    </li>
  );
}

// ─── Bits ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'completed' ? 'secondary' : 'outline';
  const label = status === 'completed' ? 'Completed' : 'Draft';
  return (
    <Badge variant={variant} className="px-1.5 py-0 text-[10px]">
      {label}
    </Badge>
  );
}

function TemplateBadge({ template }: { template: string }) {
  if (!template || template === 'classic') return null;
  return (
    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
      {template}
    </Badge>
  );
}

/**
 * Single-number score badge for the variant row.
 *
 * Uses the same tier taxonomy as the scorecard panel (Phase 3 v2:
 * 5 tiers — strong / good / partial / limited / needs-work). Imported
 * from the scorecard module so a future calibration pass only has
 * to change the numbers in one place.
 *
 * Drift from plan §"Open questions" #2: the plan originally called
 * for a 3-tier (green / amber / red) badge. Phase 3 promoted that
 * to 5 tiers via the Greenhouse taxonomy (strong / good / partial /
 * limited / needs-work). We use a single text color per tier rather
 * than a filled background so the row stays scannable with many
 * variants.
 */
function ScoreBadge({ score }: { score: number }) {
  const tier = tierFor(score);
  const TIER_COLOR: Record<ScoreTier, string> = {
    strong: 'text-emerald-700 dark:text-emerald-400',
    good: 'text-lime-700 dark:text-lime-400',
    partial: 'text-amber-700 dark:text-amber-400',
    limited: 'text-orange-700 dark:text-orange-400',
    'needs-work': 'text-rose-700 dark:text-rose-400'
  };
  const colorClass = TIER_COLOR[tier];
  return (
    <span
      data-testid="variant-score-badge"
      data-score={score}
      data-tier={tier}
      className={cn(
        'shrink-0 rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums',
        colorClass
      )}
    >
      {score}
    </span>
  );
}

function formatRelativeDate(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (sec < 60) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (hr < 24) return `${hr} hr ago`;
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}
