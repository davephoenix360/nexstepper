#!/usr/bin/env node
/**
 * Does the soft-skill matcher only accept ONE surface form of each skill?
 *
 * ## The suspicion
 *
 * The soft-skill list is matched by LITERAL SUBSTRING:
 *
 *   'collaborated'  matches "collaborated"     but NOT "collaboration"
 *                    or "collaborative"
 *   'mentorship'    matches "mentorship"       but NOT "mentored" or
 *                    "mentoring"
 *   'analytical'    matches "analytical"       but NOT "analysis"
 *   'negotiation'   matches "negotiation"      but NOT "negotiated"
 *   'communication' matches "communication"     but NOT "communicating"
 *   'cross-functional' matches "cross-functional" but NOT "cross functional"
 *
 * A resume that demonstrates collaboration by writing "collaboration" is
 * not credited for it. That is the same defect class as the ISO-only
 * date parser: the matcher accepts the formats it was written against,
 * not the formats people use.
 *
 * ## What this prints
 *
 * For each corpus resume: the phrases hit by the current matcher, the
 * phrases a variant-aware matcher would hit, and the phrases the
 * current matcher MISSES that a real resume plainly demonstrates.
 *
 * Offline. Reads a fixture; writes nothing.
 */

import './load-env';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resumeDataSchema } from '@/lib/resume-schema';
import { flattenResumeText } from '@/lib/scoring/similarity';
import { resumeDataToScoreable } from '@/lib/scoring/resume-adapter';
import { SOFT_SKILLS } from '@/lib/scoring/dictionaries';
import type { ResumeData, JobPosting } from '@/lib/resume-schema';

const CORPUS_PATH = join(process.cwd(), 'tests/fixtures/ats-corpus.json');

type CorpusEntry = { jd: JobPosting; resume: ResumeData; idealScore: number };

/**
 * The surface forms a real resume uses for each soft skill.
 *
 * Derived from the corpus + common professional phrasing — NOT from the
 * JD. The point is: does the resume demonstrate the skill, in the words
 * people actually use?
 */
const VARIANTS: Record<string, string[]> = {
  team: ['team', 'teams', 'teamwork', 'cross-functional'],
  leadership: ['leadership', 'leader', 'leading', 'led a team', 'line manage'],
  collaborated: ['collaborat'],
  communication: ['communicat'],
  stakeholder: ['stakeholder'],
  'cross-functional': ['cross-functional', 'cross functional'],
  'people management': ['people manag', 'managing people', 'people-manager'],
  mentorship: ['mentor'],
  'conflict resolution': ['conflict resolut', 'resolv conflict'],
  presentation: ['present'],
  analytical: ['analyt'],
  negotiation: ['negotiat']
};

function main(): void {
  const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as CorpusEntry[];
  const entries = Array.isArray(raw)
    ? raw
    : Object.values(raw as unknown as Record<string, CorpusEntry>);

  let currentTotal = 0;
  let variantTotal = 0;
  const missed = new Map<string, number>();

  for (const entry of entries) {
    const resume = resumeDataSchema.parse(entry.resume);
    const haystack = flattenResumeText(resumeDataToScoreable(resume)).toLowerCase();

    let current = 0;
    let variant = 0;
    for (const skill of SOFT_SKILLS) {
      if (haystack.includes(skill)) {
        current++;
        variant++;
        continue;
      }
      const forms = VARIANTS[skill] ?? [skill];
      if (forms.some((form) => haystack.includes(form))) {
        variant++;
        missed.set(skill, (missed.get(skill) ?? 0) + 1);
      }
    }
    currentTotal += current;
    variantTotal += variant;
  }

  const n = entries.length;
  console.log('');
  console.log('Soft-skill matching — literal substring vs surface-form matching');
  console.log('----------------------------------------------------------------');
  console.log(
    `  current matcher  : ${(currentTotal / n).toFixed(2)} of 12 phrases ` +
      `(${(currentTotal / n / 12 * 100).toFixed(1)}% average)`
  );
  console.log(
    `  variant matcher  : ${(variantTotal / n).toFixed(2)} of 12 phrases ` +
      `(${(variantTotal / n / 12 * 100).toFixed(1)}% average)`
  );
  console.log('');
  console.log('  phrases the current matcher misses, by how many resumes mention them:');
  for (const [skill, count] of [...missed.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(2)} of ${n} resumes   "${skill}"`);
  }
  if (missed.size === 0) {
    console.log('    (none — the variants add nothing on this corpus)');
  }
  console.log('');
}

main();
