'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';

import {
  HEADLINE_INTERVAL_MS,
  PARSING_HEADLINES,
  RESUME_TIPS,
  TIP_INTERVAL_MS,
  type ResumeTipCategory
} from '@/lib/resume-tips';
import { cn } from '@/lib/utils';

interface AiParsingModalProps {
  /** Whether the import is actually in flight. */
  open: boolean;
  /** Current import stage, rendered as a small step pill. */
  stageLabel: string;
}

const CATEGORY_LABEL: Record<ResumeTipCategory, string> = {
  resume: 'Resume tip',
  'cover-letter': 'Cover letter tip',
  nexstepper: 'Using Nexstepper'
};

/**
 * Full-screen loading modal shown while an AI resume import runs.
 *
 * Why a modal rather than an inline indicator: the import takes 30–90s, and
 * on a long form the inline spinner is easy to lose track of while scrolling.
 * A modal cannot be scrolled away from, and the tip carousel turns the wait
 * into a teaching moment — the user learns what a master resume is and how
 * variants work while their first import is being parsed.
 *
 * Rendered through a portal to `document.body` so the dashboard's sticky /
 * transformed ancestors can't trap it inside their bounding box — the same
 * reason `ChatBubble` portals its floating UI.
 *
 * Intentionally NOT dismissible: the underlying action is a Server Action
 * that cannot be cancelled, so a close button would only let the user stare
 * at a frozen form. On failure the parent closes the modal and renders the
 * error card instead.
 */
export function AiParsingModal({ open, stageLabel }: AiParsingModalProps) {
  const [mounted, setMounted] = useState(false);
  const [headlineIndex, setHeadlineIndex] = useState(() =>
    Math.floor(Math.random() * PARSING_HEADLINES.length)
  );
  const [tipIndex, setTipIndex] = useState(() =>
    Math.floor(Math.random() * RESUME_TIPS.length)
  );

  useEffect(() => setMounted(true), []);

  // Restart both rotations from a fresh random offset every time the modal
  // opens, so a second import in the same session doesn't replay the exact
  // same headline the user already read.
  useEffect(() => {
    if (!open) return;
    setHeadlineIndex(Math.floor(Math.random() * PARSING_HEADLINES.length));
    setTipIndex(Math.floor(Math.random() * RESUME_TIPS.length));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const headlineTimer = setInterval(() => {
      setHeadlineIndex((i) => (i + 1) % PARSING_HEADLINES.length);
    }, HEADLINE_INTERVAL_MS);
    return () => clearInterval(headlineTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const tipTimer = setInterval(() => {
      setTipIndex((i) => (i + 1) % RESUME_TIPS.length);
    }, TIP_INTERVAL_MS);
    return () => clearInterval(tipTimer);
  }, [open]);

  const tip = useMemo(() => RESUME_TIPS[tipIndex], [tipIndex]);

  // Prevent the page behind the modal from scrolling while it's open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm no-print"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label="Building your resume"
      data-testid="ai-parsing-modal"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        {/* Spinner */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-8 w-8 animate-pulse text-primary" aria-hidden="true" />
        </div>

        {/* Rotating headline */}
        <h2
          className="min-h-[3.5rem] text-xl font-semibold leading-snug tracking-tight sm:text-2xl"
          data-testid="parsing-headline"
        >
          {PARSING_HEADLINES[headlineIndex]}
        </h2>

        {/* Current stage */}
        <p className="mt-2 text-sm text-muted-foreground" data-testid="parsing-stage">
          {stageLabel}
        </p>

        {/* Tip card */}
        <div
          className="mt-6 rounded-xl border border-border/60 bg-muted/40 p-5 text-left"
          data-testid="parsing-tip"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABEL[tip.category]}
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            <span aria-hidden="true" className="mr-2">
              {tip.emoji}
            </span>
            {tip.text}
          </p>
        </div>

        {/* Dot indicators */}
        <div className="mt-5 flex justify-center gap-1.5" aria-hidden="true">
          {RESUME_TIPS.map((t, i) => (
            <span
              key={`${t.category}-${i}`}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === tipIndex ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30'
              )}
            />
          ))}
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          This usually takes 30–60 seconds. You can leave this tab open — we&apos;ll keep
          working.
        </p>
      </div>
    </div>,
    document.body
  );
}
