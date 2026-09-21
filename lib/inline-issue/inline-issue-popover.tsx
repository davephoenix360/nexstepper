"use client";

import * as React from 'react';
import { Sparkles, RefreshCcw, X } from 'lucide-react';

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EnrichBulletResult } from '@/lib/inline-issue/types';
import type { SubCriterionKey } from '@/lib/inline-issue/types';

/**
 * The inline-issue popover — opens when a Pro user clicks a dim
 * bar's "Rewrite with AI" CTA (or the equivalent on a skill gap
 * row). Anchors itself to the affected EditableText leaf via the
 * `data-testid="editable-{path}"` attribute so the popover floats
 * next to the bullet being rewritten.
 *
 * Three affordances, in the order they're used:
 *   1. Apply   — writes the selected rewrite into the resume via
 *                `onApply(text)`. The parent (ScorecardClient)
 *                updates the RHF form + persists + recomputes.
 *   2. Regenerate — issues a fresh `enrichBulletAction` call.
 *                   Lazy: the rewrite happens on every click,
 *                   not at mount. Plan §"AI rewrite trigger".
 *   3. Dismiss — Esc / outside-click / X button. The popover is
 *                a Radix Popover so keyboard a11y is built in.
 *
 * Free-tier handling: the parent (ScorecardClient) never mounts
 * this component for Free users — they see the static "Show me"
 * button on the dim bar instead, which triggers the pulse +
 * inline tip (IssuePulse) without an AI call. The action is
 * still Pro-gated defensively (free callers get
 * `{ ok:false, proRequired:true }`), but the popover is the
 * Pro-only surface.
 *
 * Plan: docs/plans/inline-issue-surface.md §"User-visible behavior"
 * (Pro) + "Architecture".
 */

export type InlineIssuePopoverProps = {
  /** Path of the EditableText leaf — used to anchor the popover. */
  path: string;
  /** Sub-criterion the user clicked. */
  criterion: SubCriterionKey;
  /** Current bullet text — displayed at the top of the popover. */
  currentText: string;
  /** Whether the popover is open (controlled). */
  open: boolean;
  /** Called when the popover wants to open / close (Esc, outside-click). */
  onOpenChange: (open: boolean) => void;
  /**
   * Server action that returns 3 rewrites. Passed in as a prop
   * rather than imported directly so this component stays easy
   * to unit-test (mock the action via `vi.mock`).
   */
  enrichAction: (input: {
    resumeId: string;
    path: string;
    criterion: SubCriterionKey;
    currentText: string;
  }) => Promise<EnrichBulletResult>;
  /** Resume id — passed straight to the action. */
  resumeId: string;
  /**
   * Called when the user picks a rewrite. Parent updates the
   * RHF form state and persists. Popover auto-closes after a
   * successful Apply (Plan §"Risks" #1 — close on any form
   * state change to prevent drift).
   */
  onApply: (text: string) => void;
};

export function InlineIssuePopover({
  path,
  criterion,
  currentText,
  open,
  onOpenChange,
  enrichAction,
  resumeId,
  onApply
}: InlineIssuePopoverProps) {
  const [state, setState] = React.useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ready'; rewrites: string[]; modelUsed: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [selectedIndex, setSelectedIndex] = React.useState<number>(0);

  // Fetch on open. Lazy — per Plan §"AI rewrite trigger", the
  // model only runs when the user actually opens the popover,
  // not at scorecard-render time.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    setSelectedIndex(0);
    enrichAction({ resumeId, path, criterion, currentText })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setState({ kind: 'error', message: result.error });
          return;
        }
        setState({
          kind: 'ready',
          rewrites: result.data.rewrites,
          modelUsed: result.data.modelUsed
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
    // currentText is intentionally NOT a dep — re-fetching on
    // every keystroke would burn AI budget and the popover
    // closes on apply so the user always gets a fresh fetch
    // when they re-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, path, criterion, resumeId, enrichAction]);

  function handleRegenerate() {
    setState({ kind: 'loading' });
    enrichAction({ resumeId, path, criterion, currentText })
      .then((result) => {
        if (!result.ok) {
          setState({ kind: 'error', message: result.error });
          return;
        }
        setState({
          kind: 'ready',
          rewrites: result.data.rewrites,
          modelUsed: result.data.modelUsed
        });
        setSelectedIndex(0);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', message });
      });
  }

  function handleApply() {
    if (state.kind !== 'ready') return;
    const chosen = state.rewrites[selectedIndex];
    if (!chosen) return;
    onApply(chosen);
    // Close immediately on apply. Plan §"Risks" #1 — any form
    // mutation could re-position the EditableText and leave the
    // popover visually orphaned, so we close proactively.
    onOpenChange(false);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/*
          PopoverAnchor — invisible. Radix positions the content
          relative to this anchor instead of any trigger button,
          so the popover floats next to the actual EditableText
          leaf regardless of where the user clicked (dim bar in
          the right rail, or the "Show me" CTA on a miss row).
        */}
      <PopoverAnchor
        data-testid={`inline-issue-anchor-${path}`}
        // Render the anchor as an empty span; Radix needs a real
        // DOM node to position against. The node is invisible to
        // the user (zero-size) but still occupies its position.
        className="absolute h-0 w-0"
      />
      <PopoverContent
        side="left"
        align="start"
        sideOffset={12}
        // Disable auto-position collision avoidance so the
        // popover stays anchored to the leaf even when the leaf
        // is near the bottom of the editor viewport. Radix's
        // flip behavior would otherwise move the popover above
        // the leaf, breaking the visual association.
        avoidCollisions={false}
        className="w-80 p-3"
        data-testid="inline-issue-popover"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            AI rewrite · {criterion}
          </p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
            data-testid="inline-issue-close"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <p
          className="mt-2 line-clamp-3 text-[11px] italic text-muted-foreground"
          data-testid="inline-issue-current"
        >
          {truncate(currentText, 140)}
        </p>

        {state.kind === 'loading' && <LoadingBody />}
        {state.kind === 'error' && <ErrorBody message={state.message} />}
        {state.kind === 'ready' && (
          <ReadyBody
            rewrites={state.rewrites}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onApply={handleApply}
            onRegenerate={handleRegenerate}
            modelUsed={state.modelUsed}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Render the three AI rewrites as a vertical radio group. Selecting
 * a row highlights it; the Apply button at the bottom writes the
 * selected rewrite into the resume.
 */
function ReadyBody({
  rewrites,
  selectedIndex,
  onSelect,
  onApply,
  onRegenerate,
  modelUsed
}: {
  rewrites: string[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  onApply: () => void;
  onRegenerate: () => void;
  modelUsed: string;
}) {
  return (
    <div className="mt-2 space-y-2">
      <ul className="space-y-1" role="radiogroup" aria-label="AI rewrites">
        {rewrites.map((text, i) => (
          <li key={i}>
            <button
              type="button"
              role="radio"
              aria-checked={selectedIndex === i}
              onClick={() => onSelect(i)}
              className={cn(
                'w-full rounded-md border p-2 text-left text-xs leading-snug transition-colors',
                selectedIndex === i
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-950 dark:border-indigo-400 dark:bg-indigo-950 dark:text-indigo-100'
                  : 'border-muted bg-muted/30 text-foreground hover:bg-muted/50'
              )}
              data-testid={`inline-issue-rewrite-${i}`}
            >
              {text}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onRegenerate}
          data-testid="inline-issue-regenerate"
        >
          <RefreshCcw className="mr-1 h-3 w-3" aria-hidden />
          Regenerate
        </Button>
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onApply}
          data-testid="inline-issue-apply"
        >
          <Sparkles className="mr-1 h-3 w-3" aria-hidden />
          Apply
        </Button>
      </div>

      <p
        className="text-[10px] text-muted-foreground"
        data-testid="inline-issue-model"
      >
        Generated by {modelUsed}.
      </p>
    </div>
  );
}

function LoadingBody() {
  return (
    <div
      className="mt-2 space-y-1.5"
      data-testid="inline-issue-loading"
      aria-live="polite"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-md bg-muted"
          aria-hidden
        />
      ))}
      <p className="text-[10px] text-muted-foreground">
        Generating suggestions…
      </p>
    </div>
  );
}

function ErrorBody({ message }: { message: string }) {
  return (
    <div
      className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
      role="alert"
      data-testid="inline-issue-error"
    >
      {message}
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}