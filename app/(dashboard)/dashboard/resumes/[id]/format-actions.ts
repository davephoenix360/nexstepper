'use server';

import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { resumeDataSchema } from '@/lib/resume-schema';
import { evaluateJevRequirements } from '@/lib/scoring-async/jev-requirements';
import {
  planJobSkillHighlights,
  type AutoHighlightSkipReason
} from '@/lib/rich-text/auto-highlight';
import type { RichTextMap } from '@/lib/resume-schema';

/**
 * Server Action: work out which of the candidate's skills this posting
 * actually asks for, so the editor can mark them.
 *
 * ## Why it is a server action
 *
 * The hard part is Jev's classification of the posting's requirement
 * lines: which name a genuine skill, which are eligibility gates, and
 * how strongly the resume demonstrates each. That is a network call
 * against a decision model, so it cannot live in the browser.
 *
 * It is a SEPARATE action from the score recompute because it is a
 * different question. The score asks "how well does this resume match
 * this posting"; this asks "which words on this resume should the
 * reader's eye land on". Reusing the score's snapshot would mean
 * highlighting skills the posting mentions but the candidate does not
 * have, which is precisely the thing a candidate must not claim.
 *
 * ## Why the client sends the resume
 *
 * The marks are keyed by the resume's own field paths
 * (`sections.skills.0.keywords.2`), so they have to be computed
 * against the SAME array the editor's form is holding. Sending the
 * current form state guarantees the paths line up with what the user
 * is looking at. Nothing is written here — the client applies the
 * marks to the form, and the normal save path persists them, with its
 * own ownership check.
 *
 * ## Auth
 *
 * Server Actions are public endpoints regardless of where they appear
 * in the UI, and this one spends an AI call. So the session is
 * re-checked here, exactly like the score action.
 */
export async function highlightJobSkillsAction(
  input: unknown
): Promise<
  | {
      ok: true;
      marks: RichTextMap;
      bolded: string[];
      underlined: string[];
      skipped: { keyword: string; reason: AutoHighlightSkipReason }[];
    }
  | { ok: false; error: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'You need to be signed in.' };
  }

  const parsed = resumeDataSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'That resume could not be read.' };
  }
  const data = parsed.data;

  if (!data.jobContext) {
    return {
      ok: false,
      error: 'Attach a job description first — there is nothing to match against.'
    };
  }

  if (!data.sections.skills || data.sections.skills.length === 0) {
    return {
      ok: false,
      error: 'Add some skills first — there is nothing to highlight.'
    };
  }

  const evaluation = await evaluateJevRequirements(data, data.jobContext);

  if (!evaluation.ok) {
    return {
      ok: false,
      error:
        'Could not read this job description just now. Try again in a moment.'
    };
  }

  const plan = planJobSkillHighlights({
    lines: evaluation.lines,
    skills: data.sections.skills.map((entry) => ({
      name: entry.name,
      keywords: entry.keywords ?? []
    }))
  });

  return {
    ok: true,
    marks: plan.marks,
    bolded: plan.bolded,
    underlined: plan.underlined,
    skipped: plan.skipped
  };
}
