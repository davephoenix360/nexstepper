import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * CtaSection — full-width call-to-action banner on the landing page.
 *
 * Used twice on the landing page: once mid-page (pricing teaser) and
 * once at the bottom (final CTA). Accepts a variant for each.
 *
 * Both variants still point at the Free sign-up flow as the primary CTA —
 * that is deliberate, because the audience here has not seen the product
 * yet and "start free" converts better than "pay CA$5". The badge is
 * informational: it tells them Pro exists and what it costs, so the
 * pricing page is not a surprise. Actual checkout lives only on
 * `/pricing`.
 *
 * History: the soft-launch build suppressed the upgrade path entirely
 * and this copy said "Pro is launching soon". Pro went live 2026-10-21.
 */
export function CtaSection({
  variant = 'final'
}: {
  variant?: 'pricing' | 'final';
}) {
  if (variant === 'pricing') {
    return (
      <section className="border-y bg-muted/30 py-20 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <Badge variant="secondary" className="mb-4 gap-1.5 px-3 py-1 text-sm">
            <Sparkles className="size-3.5" />
            Pro is live — CA$5/month
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Free to start. Pro is CA$5 a month.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Unlimited resumes, ATS scoring, and AI chat are free today. Pro
            adds generous AI chat, inline AI rewrites on any bullet, and
            priority email support.
          </p>
          <div className="mt-8">
            <Button asChild size="lg" className="h-11 px-6 text-base">
              <Link href="/sign-up">
                Start for free
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="relative isolate overflow-hidden rounded-2xl bg-foreground px-6 py-16 text-center shadow-xl sm:px-12 sm:py-20">
          {/* Subtle gradient overlay using primary on the dark card */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/20 via-foreground to-foreground"
          />
          <Badge
            variant="secondary"
            className="mb-4 gap-1.5 border border-background/20 bg-background/10 px-3 py-1 text-sm text-background"
          >
            <Sparkles className="size-3.5" />
            Pro is live — CA$5/month
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-background sm:text-4xl">
            Ready to land the next one?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-background/70">
            Set up your master resume in under five minutes. Tailor,
            score, and apply from one place. Free to use, no credit card
            required.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-11 px-6 text-base">
              <Link href="/sign-up">
                Create your free account
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}