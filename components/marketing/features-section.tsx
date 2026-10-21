import * as React from 'react';
import {
  FileText,
  GitBranch,
  Sparkles,
  Target,
  Users,
  Zap
} from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * FeatureCard — single feature display, used in the features grid.
 */
export function FeatureCard({
  icon,
  title,
  description,
  className
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md',
        className
      )}
    >
      <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
        {icon}
      </div>
      <h3 className="text-base font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

/**
 * FeaturesSection — the 6-card feature grid on the landing page.
 */
export function FeaturesSection() {
  return (
    <section id="features" className="border-y bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything you need to apply smarter.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            One master resume, infinitely many tailored variants — without
            retyping a word.
          </p>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<FileText className="size-5" />}
            title="One master, many variants"
            description="Maintain a single source-of-truth resume. Nexstepper spins off tailored variants for each role in one click — your history, projects, and voice stay consistent."
          />
          <FeatureCard
            icon={<Sparkles className="size-5" />}
            title="AI chat assistant"
            description="Ask the AI co-pilot to rewrite a bullet, explain an ATS miss, or tighten your summary — with your current resume and score in context. Not a generic ChatGPT paste."
          />
          <FeatureCard
            icon={<Target className="size-5" />}
            title="ATS scoring"
            description="Score each variant against the actual job description. See which keywords are missing and what to add — before you hit submit."
          />
          <FeatureCard
            icon={<GitBranch className="size-5" />}
            title="Job context attached"
            description="Paste a job URL or text, and Nexstepper parses the requirements, must-haves, and seniority. Your variant adapts to match."
          />
          {/* REPLACED 2026-10-21: the two cards here used to be
              "Peer reviews" and "Real-time collaboration". Neither
              exists — there is no reviews table or invite flow, and
              `lib/liveblocks/server.ts` is imported by nothing. Both
              were advertised while Pro was soft-launched and the
              purchase page was unreachable, so nobody could check.
              Replaced with two features that actually ship rather
              than deleted, to keep the 3x2 grid intact. */}
          <FeatureCard
            icon={<Users className="size-5" />}
            title="Private sharing links"
            description="Publish one read-only link for a specific resume. Track how many times a recruiter opened it, and kill the link whenever you want."
          />
          <FeatureCard
            icon={<Zap className="size-5" />}
            title="Inline AI rewrites"
            description="Flag a weak bullet, get three alternatives grounded in the job description, and keep the one you like. Pro."
          />
        </div>
      </div>
    </section>
  );
}