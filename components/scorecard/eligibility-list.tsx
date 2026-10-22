import { GraduationCap, ShieldCheck, BadgeCheck } from 'lucide-react';

import type { EligibilityNote } from '@/lib/scoring/qualifications';
import { cn } from '@/lib/utils';

/**
 * Eligibility requirements — a degree, a certification, work
 * authorisation — resolved against the resume.
 *
 * ## Why this is its own component, not part of the miss list
 *
 * The miss list answers "what skills should I add to my resume?". An
 * eligibility requirement is a different question: "will this employer
 * consider me?". Putting a degree in the miss list produced the advice
 * "Missing 1 must-have skill: Bachelor's degree in Computer Science" —
 * which is not actionable, and actively demoralising for someone three
 * months from graduating.
 *
 * So these get their own block, with a status the user can act on:
 * met, in progress (with the date), an alternative route, or not listed.
 *
 * The status colours are deliberately calmer than the miss list's rose:
 * most of these are fine, and "in progress" is good news.
 */

const STATUS_STYLE: Record<
  EligibilityNote['status'],
  { label: string; className: string; icon: typeof GraduationCap }
> = {
  met: {
    label: 'Met',
    className: 'text-emerald-700 dark:text-emerald-400',
    icon: BadgeCheck
  },
  'in-progress': {
    label: 'In progress',
    className: 'text-sky-700 dark:text-sky-400',
    icon: GraduationCap
  },
  'alternative-accepted': {
    label: 'Alternative accepted',
    className: 'text-amber-700 dark:text-amber-400',
    icon: ShieldCheck
  },
  'not-listed': {
    label: 'Not on your resume',
    className: 'text-rose-700 dark:text-rose-400',
    icon: ShieldCheck
  },
  unknown: {
    label: 'Unknown',
    className: 'text-muted-foreground',
    icon: ShieldCheck
  }
};

export function EligibilityList({
  notes
}: {
  notes: EligibilityNote[] | undefined;
}) {
  if (!notes || notes.length === 0) return null;

  return (
    <div
      data-testid="eligibility-list"
      className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Eligibility requirements
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">
        These are not skill gaps — they are things an employer checks before
        reading your resume. Nothing here needs to be added to your resume.
      </p>
      <ul className="space-y-2">
        {notes.map((note, i) => {
          const style = STATUS_STYLE[note.status];
          const Icon = style.icon;
          return (
            <li
              key={`${note.requirement.text}-${i}`}
              data-testid="eligibility-item"
              className="flex items-start gap-2 text-xs"
            >
              <Icon
                className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', style.className)}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="leading-tight font-medium">
                  {note.requirement.text}
                </p>
                <p
                  className={cn(
                    'mt-0.5 text-[11px] leading-snug',
                    style.className
                  )}
                  data-testid="eligibility-status"
                >
                  {style.label}
                  {note.completesOn ? ` — completes ${note.completesOn}` : ''}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {note.message}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
