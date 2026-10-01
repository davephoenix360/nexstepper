import Link from 'next/link';
import { ArrowRight, LayoutDashboard, Sparkles, CheckCircle2, Shield } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getUser } from '@/lib/db/queries';
import { ResumePreview } from './resume-preview';

/**
 * Hero — the first thing visitors see on the marketing site.
 *
 * Layout: centered text + CTAs, with a styled resume preview below.
 * Uses semantic tokens (text-foreground, bg-primary, etc.) so swapping
 * the theme in globals.css re-skins the whole site.
 *
 * ## Auth-aware primary CTA
 *
 * A signed-out visitor's job is to sign up. A signed-in visitor's job
 * is to get to work — sending them back to `/sign-up` is a dead end
 * (they already have an account, so the form just bounces them to
 * sign-in). So the primary button branches on session state:
 *
 *   - signed out → "Start for free" → `/sign-up`
 *   - signed in  → "Open dashboard" → `/dashboard/resumes`, with a
 *     "Welcome back" eyebrow and a first-name greeting
 *
 * This is a Server Component (no `'use client'`), so `getUser()` is a
 * single server-side session read at request time — no waterfall, no
 * client fetch, and the markup is correct on first paint with no
 * hydration mismatch or CTA flash.
 *
 * Plan: docs/plans/chat-hardening-and-cta.md §6.
 */
export async function Hero() {
  const user = await getUser();
  const isSignedIn = Boolean(user);
  // Fall back to a neutral greeting if the name is empty — better
  // than rendering "Welcome back ," with a dangling comma.
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? '';
  const greeting = firstName ? `Welcome back, ${firstName}` : 'Welcome back';

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
        <Badge
          variant="secondary"
          className="mb-6 gap-1.5 px-3 py-1 text-sm"
          data-testid="hero-eyebrow"
        >
          {isSignedIn ? (
            <>
              <LayoutDashboard className="size-3.5" />
              {greeting}
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" />
              Your AI resume copilot
            </>
          )}
        </Badge>

        <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Tailored, ATS-scored resumes for{' '}
          <span className="bg-gradient-to-br from-primary to-primary/70 bg-clip-text text-transparent">
            every job you apply to.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground sm:text-xl">
          One master resume. A score against the role&apos;s actual ATS rubric.
          AI chat that helps you iterate on every section. Built for
          job-seekers who&apos;d rather be interviewing than formatting.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {isSignedIn ? (
            <Button asChild size="lg" className="h-11 px-6 text-base">
              <Link href="/dashboard/resumes" data-testid="hero-primary-cta">
                <LayoutDashboard className="mr-2 size-4" />
                Open dashboard
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg" className="h-11 px-6 text-base">
              <Link href="/sign-up" data-testid="hero-primary-cta">
                Start for free
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          )}
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Pricing — Pro launching soon
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
            Pro launching soon
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
 * Policy: no fake testimonials. When we eventually have paying users
 * willing to be quoted by name + role, add a real `<TestimonialBlock />`
 * component as a separate section below the hero — never a fabricated
 * quote in this strip.
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