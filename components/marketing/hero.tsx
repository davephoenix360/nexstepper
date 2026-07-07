import Link from 'next/link';
import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

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
          Land your next role,{' '}
          <span className="bg-gradient-to-br from-primary to-primary/70 bg-clip-text text-transparent">
            faster.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground sm:text-xl">
          Nextep turns one master resume into tailored, ATS-scored variants for every
          job you apply to. Built for job-seekers who want to spend less time formatting
          and more time interviewing.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-11 px-6 text-base">
            <Link href="/sign-up">
              Start for free
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11 px-6 text-base">
            <Link href="/pricing">See pricing</Link>
          </Button>
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

        <ResumePreview />
      </div>
    </section>
  );
}