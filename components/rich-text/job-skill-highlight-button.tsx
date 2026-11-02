'use client';

/**
 * "Highlight this job's skills" — one button, one undoable step.
 *
 * ## What it does
 *
 * Works out which of the candidate's skills the posting actually asks
 * for, and marks them: **bold** for every one, **bold + underline**
 * for the must-haves, so a must-have and a nice-to-have are
 * distinguishable at a glance.
 *
 * ## What it refuses to do
 *
 * - It does not mark an **eligibility gate** (a degree, a
 *   certification, a years-of-experience threshold). There is no text
 *   to bold for those, and bolding a word that happens to appear in
 *   "Bachelor's degree in engineering" would be a lie.
 * - It does not mark a skill the resume does not evidence.
 * - It does not touch the stored text. It writes the formatting
 *   overlay — the same map the toolbar writes — so the ATS score does
 *   not move.
 *
 * ## One undo step
 *
 * The whole plan is applied with ONE `setValue('formatting', …)`, so
 * Ctrl+Z undoes the entire highlight in one go. The undo history
 * snapshots the form, not the individual writes.
 */
import { useCallback, useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { highlightJobSkillsAction } from '@/app/(dashboard)/dashboard/resumes/[id]/format-actions';
import type { RichTextMap } from '@/lib/resume-schema';

export interface JobSkillHighlightButtonProps {
  /** The editor's current form values — the source of truth for the paths. */
  resume: unknown;
  /** Apply the computed marks. ONE write, so it is ONE undo step. */
  onApply: (marks: RichTextMap) => void;
}

type Outcome =
  | { kind: 'idle' }
  | { kind: 'done'; bolded: number; underlined: number; skipped: number }
  | { kind: 'empty'; skipped: number }
  | { kind: 'error'; message: string };

export function JobSkillHighlightButton({
  resume,
  onApply
}: JobSkillHighlightButtonProps) {
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  const handleClick = useCallback(() => {
    setOutcome({ kind: 'idle' });
    startTransition(async () => {
      const result = await highlightJobSkillsAction(resume);
      if (!result.ok) {
        setOutcome({ kind: 'error', message: result.error });
        return;
      }
      if (result.bolded.length === 0) {
        setOutcome({ kind: 'empty', skipped: result.skipped.length });
        return;
      }
      onApply(result.marks);
      setOutcome({
        kind: 'done',
        bolded: result.bolded.length,
        underlined: result.underlined.length,
        skipped: result.skipped.length
      });
    });
  }, [onApply, resume]);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={pending}
        aria-label="Highlight the skills this job asks for"
        data-testid="highlight-job-skills"
      >
        <Sparkles className="mr-2 size-4" />
        {pending ? 'Checking…' : 'Highlight this job’s skills'}
      </Button>

      {outcome.kind === 'done' && (
        <span
          className="text-[11px] text-muted-foreground"
          data-testid="highlight-job-skills-result"
        >
          Bolded {outcome.bolded} skill{outcome.bolded === 1 ? '' : 's'}
          {outcome.underlined > 0
            ? `, underlined ${outcome.underlined} must-have${outcome.underlined === 1 ? '' : 's'}`
            : ''}
          . Ctrl+Z undoes it.
        </span>
      )}

      {outcome.kind === 'empty' && (
        <span
          className="text-[11px] text-muted-foreground"
          data-testid="highlight-job-skills-result"
        >
          This posting doesn’t name skills your resume lists — nothing to
          highlight.
        </span>
      )}

      {outcome.kind === 'error' && (
        <span
          className="text-[11px] text-destructive"
          role="alert"
          data-testid="highlight-job-skills-result"
        >
          {outcome.message}
        </span>
      )}
    </span>
  );
}
