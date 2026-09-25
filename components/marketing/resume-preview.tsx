'use client';

import * as React from 'react';
import { Briefcase, GraduationCap, Sparkles, TrendingUp } from 'lucide-react';

/**
 * Text-based "preview" of a tailored resume variant — used in the hero.
 * Not interactive, not a real component, just a styled card to make the
 * hero feel concrete. Renders a fixed sample so it doesn't depend on
 * user state.
 *
 * Subtle CSS animation on the highlight bar to feel "alive" without
 * being distracting.
 */
export function ResumePreview() {
  return (
    <div className="mt-16">
      <div className="relative mx-auto max-w-4xl rounded-xl border bg-card p-2 shadow-lg ring-1 ring-foreground/5">
        {/* Faux browser chrome */}
        <div className="flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-full bg-red-400/70" />
          <span className="size-2.5 rounded-full bg-amber-400/70" />
          <span className="size-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-3 font-mono">nexstepper.app/dashboard/resumes</span>
        </div>

        {/* Resume content */}
        <div className="rounded-lg bg-background p-6 sm:p-10">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">
                Sarah Chen
              </h3>
              <p className="text-sm text-muted-foreground">
                Senior Software Engineer · Seattle, WA
              </p>
            </div>
            <ScorePill />
          </div>

          <Section
            icon={<Briefcase className="size-4" />}
            title="Experience"
            entries={[
              {
                company: 'Acme Corp',
                meta: 'Senior Engineer · 2022 — Present',
                bullets: [
                  'Led migration of payments platform to event-driven architecture, reducing p99 latency by 47%.',
                  'Mentored 4 engineers; two promoted to Senior within a year.'
                ]
              }
            ]}
            highlighted
          />
          <Section
            icon={<GraduationCap className="size-4" />}
            title="Education"
            entries={[
              {
                company: 'University of Washington',
                meta: 'B.S. Computer Science · 2018',
                bullets: []
              }
            ]}
          />
          <Section
            icon={<Sparkles className="size-4" />}
            title="AI Optimize"
            aiSuggestion="Tailored to the Stripe Sr. Engineer role — added 3 missing keywords and rewrote the led-migration bullet to surface scale numbers."
            aiVariant
          />
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  entries,
  highlighted,
  aiSuggestion,
  aiVariant
}: {
  icon: React.ReactNode;
  title: string;
  entries?: Array<{ company: string; meta: string; bullets: string[] }>;
  highlighted?: boolean;
  aiSuggestion?: string;
  aiVariant?: boolean;
}) {
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        {icon}
        {title}
      </div>

      {entries?.map((entry, i) => (
        <div
          key={i}
          className={
            'relative mb-3 rounded-md p-3 ' +
            (highlighted ? 'bg-primary/5 ring-1 ring-primary/20' : '')
          }
        >
          {highlighted && (
            <div className="absolute -left-px top-1/2 h-3/4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
          )}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">{entry.company}</span>
            <span className="text-xs text-muted-foreground">{entry.meta}</span>
          </div>
          {entry.bullets.length > 0 && (
            <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
              {entry.bullets.map((b, j) => (
                <li key={j}>• {b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {aiVariant && aiSuggestion && (
        <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3" />
            AI Optimize suggestion
          </div>
          {aiSuggestion}
        </div>
      )}
    </div>
  );
}

function ScorePill() {
  return (
    <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm shadow-sm">
      <TrendingUp className="size-4 text-emerald-600" />
      <span className="font-semibold text-emerald-600">94</span>
      <span className="text-xs text-muted-foreground">/ 100</span>
    </div>
  );
}