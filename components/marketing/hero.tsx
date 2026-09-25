import Link from 'next/link';
import { ArrowRight, Sparkles, CheckCircle2, Shield } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResumePreview } from './resume-preview';

/**
 * Hero — the first thing visitors see on the marketing site.
 *
 * Layout: centered text + CTAs, with a styled resume preview below.
 * Uses semantic tokens (text-foreground, bg-primary, etc.) so swapping
 * the theme in globals.css re-skins the whole site.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient — subtle, themed, no harsh edges */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(ellipse_at_top,theme(colors.primary/15),transparent_60%)]"
      />

      <div className="mx-auto max-w-5xl px-4 pb-16 pt-20 text-center sm:px-6 lg:px-8 lg:pt-28">
        <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1 text-sm">
          <Sparkles className="size-3.5" />
          Your AI resume copilot
        </Badge>

        <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Tailored, ATS-scored resumes for{' '}
          <span className="bg-gradient-to-br from-primary to-primary/70 bg-clip-text text-transparent">
            every job you apply to.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground sm:text-xl">
          One master resume. A score against the role&apos;s actual ATS rubric.
          AI rewrites that drop directly into your variants. Built for
          job-seekers who&apos;d rather be interviewing than formatting.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-11 px-6 text-base">
            <Link href="/sign-up">
              Start for free
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            or see pricing
          </Link>
        </div>

        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-primary" />
            No credit card
          </li>
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-primary" />
            Unlimited resumes on Free
          </li>
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-primary" />
            7-day Pro trial
          </li>
        </ul>

        <TrustStrip />

        <ResumePreview />
      </div>
    </section>
  );
}

/**
 * TrustStrip — three small badges under the CTA. Differentiator vs
 * competitors who only show feature lists: signals that data handling
 * + privacy is part of the product, not an afterthought.
 *
 * TODO (post-launch): when we have paying users, swap the middle item
 * for a real testimonial or a stat like "X job-seekers built Y variants
 * this month". For now, the data-handling angle is a stronger pitch
 * than anonymous "thousands of users" copy.
 */
function TrustStrip() {
  return (
    <div
      className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-muted-foreground"
      aria-label="Trust signals"
    >
      <span className="inline-flex items-center gap-1.5">
        <Shield className="size-3.5 text-primary" />
        GDPR-ready
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Shield className="size-3.5 text-primary" />
        Export &amp; delete anytime
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Shield className="size-3.5 text-primary" />
        Stripe-secured payments
      </span>
    </div>
  );
}