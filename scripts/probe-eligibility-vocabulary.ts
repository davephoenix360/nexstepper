#!/usr/bin/env node
/**
 * Does the JD's eligibility vocabulary reach the keyword score?
 *
 * The eligibility fix has TWO halves:
 *
 *   1. The NOTES — a degree/certification gate is reported separately
 *      instead of being scored as a missing skill.
 *      Source: the intent extractor's skill lists (`mustHaveSkills`).
 *
 *   2. The VOCABULARY — the words of the gate ("bachelor", "degree") are
 *      removed from the JD's keyword set, so the candidate is not marked
 *      down for not writing "bachelor's degree" on their resume.
 *      Source: `jobEligibilityGates(job)` -> `job.requirements` +
 *      `job.niceToHaves`.
 *
 * The two halves read DIFFERENT sources. In production `job.requirements`
 * is empty (the attach paths never populate it), so half 2 may never run.
 *
 * This prints the facts.
 */

import './load-env';

import { jobTokensWithoutStopWords } from '@/lib/scoring/jd-tokens';
import { composeOverallScore, scoreResumeFromEnvelope } from '@/lib/scoring/score';
import { gallerySampleResumeData } from '@/lib/resume-schema/sample';
import type { JobTextSource } from '@/lib/scoring/similarity';
import type { JobPosting } from '@/lib/resume-schema/job-posting';

const DEGREE_GATE = "Bachelor's degree in Computer Science required";
const NOW = new Date('2026-11-16T12:00:00Z');

function job(overrides: Partial<JobTextSource>): JobTextSource {
  return {
    title: 'Senior Backend Engineer',
    description: 'We build a streaming data platform. You will own our event pipeline.',
    requirements: [],
    niceToHaves: [],
    benefits: [],
    ...overrides
  };
}

function probe(label: string, j: JobTextSource): void {
  const tokens = jobTokensWithoutStopWords(j);
  const gateWords = ['bachelor', 'bachelors', 'degree', 'degrees', 'diploma'];
  const present = gateWords.filter((word) => tokens.includes(word));
  const verdict = present.length > 0 ? 'CHARGED for them' : 'excluded';
  console.log(`  ${label}`);
  console.log(`    gate words in the JD's keyword vocabulary: ${present.length > 0 ? present.join(', ') : '(none)'}`);
  console.log(`    → the candidate is ${verdict}`);
  console.log('');
}

console.log('');
console.log('Eligibility vocabulary — does the keyword score still charge for it?');
console.log('----------------------------------------------------------------');
console.log('');

probe(
  'gate in job.requirements (where the exclusion used to look)',
  job({ requirements: [DEGREE_GATE] })
);

probe(
  'gate in the description only (no skill list) — NOT the production shape',
  job({ description: `We build a streaming data platform. ${DEGREE_GATE} You will own our event pipeline.` })
);

console.log('----------------------------------------------------------------');
console.log('');
console.log('What that costs, measured with the shipped engine');
console.log('--------------------------------------------------');

const POSTING_BASE =
  'We build a streaming data platform for logistics. You will own our event pipeline and the services behind it.';

/**
 * The PRODUCTION shape of a JD that states a degree requirement:
 *
 *   - the raw JD text (with the degree sentence) in `description`, and
 *   - the extractor's must-have list carrying the qualification line.
 *
 * That is how the product attaches a JD: the intent extractor reads the
 * posting and puts qualifications into `mustHaveSkills` — the whole
 * reason `lib/scoring/qualifications.ts` exists.
 */
function posting(description: string, mustHaveSkills: string[]): JobPosting {
  return {
    id: 'probe-elig',
    title: 'Senior Backend Engineer',
    company: '',
    location: '',
    description,
    requirements: [],
    niceToHaves: [],
    benefits: [],
    keywords: [],
    seniority: 'senior',
    employmentType: 'Full-time',
    source: 'paste',
    mustHaveSkills,
    niceToHaveSkills: [],
    implicitSkills: [],
    seniorityLevel: 'senior',
    yearsRequiredMin: 5,
    yearsRequiredMax: null,
    roleFamily: 'Backend Engineer',
    domainSignals: [],
    markdown: null,
    markdownGeneratedAt: null
  };
}

const withoutGate = scoreResumeFromEnvelope(
  structuredClone(gallerySampleResumeData),
  posting(POSTING_BASE, ['TypeScript', 'React']),
  NOW
);
const withGate = scoreResumeFromEnvelope(
  structuredClone(gallerySampleResumeData),
  posting(`${DEGREE_GATE} ${POSTING_BASE}`, ['TypeScript', 'React', DEGREE_GATE]),
  NOW
);

const exact = (b: ReturnType<typeof scoreResumeFromEnvelope>) =>
  composeOverallScore(b.dimensionScores, !b.intentCoverageBreakdown.fallback);

console.log(
  `  JD WITHOUT the degree sentence : ${withoutGate.overallScore} (exact ${exact(withoutGate).toFixed(2)})  ` +
    `Keywords ${Math.round(withoutGate.dimensionScores.atsMatching)}`
);
console.log(
  `  JD WITH the degree sentence    : ${withGate.overallScore} (exact ${exact(withGate).toFixed(2)})  ` +
    `Keywords ${Math.round(withGate.dimensionScores.atsMatching)}`
);
console.log(
  `  → the candidate with a BACHELOR'S DEGREE loses ` +
    `${(exact(withoutGate) - exact(withGate)).toFixed(2)} points purely for the JD stating a degree requirement.`
);
console.log('');
