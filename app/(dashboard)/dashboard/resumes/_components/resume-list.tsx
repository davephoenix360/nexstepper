import Link from 'next/link';
import { ArrowRight, GitBranch, Library } from 'lucide-react';

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
  SCORE_GREEN_THRESHOLD,
  SCORE_AMBER_THRESHOLD
} from '@/components/scorecard/dimension-bar';

import { CreateVariantButton } from './create-variant-button';
import { CreateVariantFromJdButton } from './create-variant-from-jd-button';

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
  renderVariantActions?: (master: Resume) => React.ReactNode;
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
            actions={renderVariantActions(master)}
            renderLink={renderLink}
          />
        </li>
      ))}
    </ul>
  );
}

/** Default render prop used by the dashboard route. */
function defaultVariantActions(master: Resume) {
  const masterId = master.id;
  const masterName = master.name || 'Untitled master';
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/dashboard/resumes/${masterId}`}>
          Open master
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
      <CreateVariantFromJdButton masterId={masterId} masterName={masterName} />
      <CreateVariantButton masterId={masterId} />
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
              <span aria-hidden>•</span>
              <span data-testid={`variant-count-${master.id}`}>
                {variantCount === 0
                  ? 'No variants yet'
                  : `${variantCount} variant${variantCount === 1 ? '' : 's'}`}
              </span>
              <TemplateBadge template={master.template} />
            </div>
          </div>

          {actions}
        </div>
      </CardHeader>

      {variantCount > 0 && (
        <CardContent className="p-0">
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
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Updated{' '}
              <time dateTime={variant.updatedAt.toISOString()}>
                {formatRelativeDate(variant.updatedAt)}
              </time>
            </span>
            <StatusBadge status={status} />
          </p>
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
 * Same tier thresholds as the scorecard panel (SCORE_GREEN_THRESHOLD /
 * SCORE_AMBER_THRESHOLD). Imported from the scorecard module so a
 * future calibration pass only has to change the numbers in one
 * place.
 *
 * Drift from plan §"Open questions" #2: the plan called for "green /
 * amber / red" tier colors on the scorecard. The badge on the
 * variant row is more constrained — we use a single text color per
 * tier rather than a filled background, so the row stays scannable
 * even with many variants.
 */
function ScoreBadge({ score }: { score: number }) {
  const tier =
    score >= SCORE_GREEN_THRESHOLD
      ? 'green'
      : score >= SCORE_AMBER_THRESHOLD
        ? 'amber'
        : 'red';
  const colorClass = {
    green: 'text-emerald-700 dark:text-emerald-400',
    amber: 'text-amber-700 dark:text-amber-400',
    red: 'text-rose-700 dark:text-rose-400'
  }[tier];
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
