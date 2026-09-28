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
 * Pro is gated as "coming soon" — the product launches Free-only, so
 * neither variant shows an active "Upgrade to Pro" or pricing checkout
 * button. The pricing page itself (`app/(marketing)/pricing/page.tsx`)
 * remains reachable for users who navigate to it directly, and renders
 * its own disabled-CTA state when Stripe is unconfigured. Both
 * surfaces point back at the Free sign-up flow as the primary CTA.
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
            Pro — coming soon
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Free to start today. Pro is launching soon.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            The full product — unlimited resumes, ATS scoring, and AI chat
            — is free today. Pro will add inline rewrites, peer reviews,
            and real-time collaboration when it ships. Join the free tier
            and we&apos;ll let you know when Pro goes live.
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
            Pro — coming soon
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