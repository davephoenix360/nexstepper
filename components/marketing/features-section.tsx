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
            title="AI Optimize, per section"
            description="Rewrite a bullet, fill a gap, tighten the summary. Per-section AI rewrites that respect your voice — not a generic ChatGPT paste."
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
          <FeatureCard
            icon={<Users className="size-5" />}
            title="Peer reviews"
            description="Share a private link, collect inline comments and thumbs-up/down from people you trust. No more 'send me a Word doc' email chains."
          />
          <FeatureCard
            icon={<Zap className="size-5" />}
            title="Real-time collaboration"
            description="Co-edit a resume with a coach or friend. See cursors, edits, and suggestions live — built on Liveblocks, no Google Docs round-trip."
          />
        </div>
      </div>
    </section>
  );
}