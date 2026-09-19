import Link from 'next/link';
import { ArrowRight, GitBranch, GitBranchPlus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Resume } from '@/lib/db/schema';

const RECENT_VARIANTS_LIMIT = 4;

/**
 * Dashboard home "Recent variants" panel.
 *
 * Slice 4 of the variant-first UX (plan: docs/plans/variant-first-ux.md).
 * The variant is the editorial surface — landing on the dashboard
 * should drop the user straight into their latest work-in-progress
 * variant, not just the master library.
 *
 *   - Pulls the user's most recently updated variants across all
 *     masters.
 *   - Shows up to RECENT_VARIANTS_LIMIT (currently 4) with a
 *     "View all" link to /dashboard/resumes.
 *   - Each row links to the variant editor.
 *   - When the user has no variants, the panel collapses into a
 *     CTA pointing at the master library (where the headline
 *     "Tailor with a JD" CTA lives).
 *
 * No client component needed — the dashboard page is an RSC and
 * this section does no interactivity beyond `<Link>` navigation.
 */
export function RecentVariants({
  variants
}: {
  variants: Resume[];
}) {
  if (variants.length === 0) return <EmptyState />;

  const visible = variants.slice(0, RECENT_VARIANTS_LIMIT);

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            Recent variants
          </CardTitle>
          <CardDescription>
            Tailored for specific roles. Pick up where you left off.
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/resumes">
            All resumes
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y" aria-label="Recent resume variants">
          {visible.map((variant) => (
            <VariantRow key={variant.id} variant={variant} />
          ))}
        </ul>
        {variants.length > RECENT_VARIANTS_LIMIT && (
          <p className="border-t px-6 py-2 text-xs text-muted-foreground">
            Showing {visible.length} of {variants.length} recent variants.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Empty state (no variants yet) ──────────────────────────────────────────

function EmptyState() {
  return (
    <Card className="mb-6 border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitBranchPlus className="h-5 w-5 text-muted-foreground" />
          No variants yet
        </CardTitle>
        <CardDescription>
          Open a master resume and click <strong>Tailor with a JD</strong>{' '}
          to spin up a variant tailored to a specific role.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/resumes">
            Open resume library
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

function VariantRow({ variant }: { variant: Resume }) {
  const status = (variant.status ?? 'draft').toLowerCase();
  return (
    <li>
      <Link
        href={`/dashboard/resumes/${variant.id}`}
        data-testid={`recent-variant-${variant.id}`}
        className={cn(
          'group flex items-center gap-3 px-6 py-3 transition-colors',
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
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {status === 'completed' ? 'Completed' : 'Draft'}
            </Badge>
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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