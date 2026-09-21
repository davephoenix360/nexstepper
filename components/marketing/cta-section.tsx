import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * CtaSection — full-width call-to-action banner with brand background.
 * Used twice on the landing page: once mid-page (pricing teaser) and
 * once at the bottom (final CTA). Accepts a variant for each.
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
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Free to start. The price of a coffee when you&apos;re ready.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Unlimited resumes on the free plan. Upgrade for inline AI
            rewrites, peer reviews, and real-time collaboration. 7-day
            trial, cancel anytime.
          </p>
          <div className="mt-8">
            <Button asChild size="lg" className="h-11 px-6 text-base">
              <Link href="/pricing">
                See full pricing
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
          <h2 className="text-3xl font-bold tracking-tight text-background sm:text-4xl">
            Ready to land the next one?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-background/70">
            Set up your master resume in under five minutes. Tailor,
            score, and apply from one place.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-11 px-6 text-base">
              <Link href="/sign-up">
                Create your free account
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 border-background/30 bg-background/10 px-6 text-base text-background hover:bg-background/20 hover:text-background"
            >
              <Link href="/pricing">View pricing</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}