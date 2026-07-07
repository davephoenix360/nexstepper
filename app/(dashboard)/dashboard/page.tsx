import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { FileText, Sparkles, Users } from 'lucide-react';
import { getUser, getSubscription } from '@/lib/db/queries';

export default async function DashboardHome() {
  const [u, sub] = await Promise.all([getUser(), getSubscription()]);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-8">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
          Welcome{u ? `, ${u.name || u.email}` : ''}.
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          You&apos;re on the <strong>{sub.plan === 'pro' ? 'Pro' : 'Free'}</strong>{' '}
          plan.
        </p>
      </div>

      <Card className="mb-6 border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            Resumes
          </CardTitle>
          <CardDescription>
            Resume CRUD ships in Phase 1. The foundation is in place — Drizzle,
            Better Auth, Stripe, shadcn primitives, Tailwind v4.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Next: master-resume → tailored variant flow, schema-driven edit
            form, job-context scoring.
          </p>
          <Button asChild variant="outline" disabled>
            <Link href="/dashboard/resumes">Open resumes (coming soon)</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
              AI Optimize
            </CardTitle>
            <CardDescription>
              Per-section &quot;Optimize&quot; button (Phase 3).{' '}
              {sub.plan === 'pro'
                ? 'Available on your Pro plan.'
                : 'Pro plan unlocks unlimited Optimize calls.'}
            </CardDescription>
          </CardHeader>
        </Card>
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