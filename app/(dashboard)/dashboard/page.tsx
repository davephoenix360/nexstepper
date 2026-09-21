import Link from 'next/link';
import { Library, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';

import {
  getUser,
  getSubscription,
  listResumes
} from '@/lib/db/queries';
import { isProEffective } from '@/lib/billing';
import type { Resume } from '@/lib/db/schema';

import { RecentVariants } from './_components/recent-variants';

/**
 * Dashboard home — variant-first UX (plan:
 * docs/plans/variant-first-ux.md §"Slice 4").
 *
 *   - "Recent variants" sits at the top: the variant IS the
 *     editorial surface, so landing on the dashboard drops the user
 *     straight into their latest in-progress variant.
 *   - The "Master library" card is now a thin pointer to
 *     /dashboard/resumes (where the headline "Tailor with a JD"
 *     CTA lives).
 *   - The Sharing & reviews card stays as a future-facing
 *     placeholder (Phase 5). The Optimize card was removed in
 *     2026-09-20 — it shipped without delivering meaningful value,
 *     and the v3 scorecard + miss list now carry the signals it
 *     was supposed to surface. A future "Grammarly-style inline
 *     highlight" feature may replace it (UX polish, not committed).
 *
 * Server Component: one round trip to load the user + subscription
 * + recent variants. No client interactivity beyond `<Link>`.
 */
export default async function DashboardHome() {
  const user = await getUser();
  const [sub, recentVariants] = await Promise.all([
    getSubscription(),
    user ? loadRecentVariants(user.id) : Promise.resolve([])
  ]);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-8">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
          Welcome{user ? `, ${user.name || user.email}` : ''}.
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          You&apos;re on the{' '}
          <strong>{isProEffective(sub) ? 'Pro' : 'Free'}</strong> plan.
          {/* `isProEffective` is the canonical "is this user Pro right now?"
              predicate (lib/billing/types.ts). Use it instead of
              `sub.plan === 'pro'` so canceled / past_due / unpaid users
              see "Free", matching what `requirePro()` enforces server-side. */}
        </p>
      </div>

      <RecentVariants variants={recentVariants} />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Library className="h-5 w-5 text-muted-foreground" />
            Master library
          </CardTitle>
          <CardDescription>
            Your master resumes live here. Spin up a variant with{' '}
            <strong>Tailor with a JD</strong> when you target a specific role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/dashboard/resumes">Open resume library</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-muted-foreground" />
              Sharing & reviews
            </CardTitle>
            <CardDescription>
              Public links, peer feedback, real-time collab (Phase 5).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </section>
  );
}

/**
 * Flatten a list of resume families into a single array of variants,
 * sorted by most-recently-updated. Used by the dashboard home to
 * render the "Recent variants" panel. We don't need the masters
 * here — the variant IS the editorial surface.
 */
async function loadRecentVariants(userId: string): Promise<Resume[]> {
  const families = await listResumes(userId);
  return families
    .flatMap(({ variants }) => variants)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}