#!/usr/bin/env node
/**
 * Which resume text does ROLE FIT compare?
 *
 * Role Fit is the only dimension that reads the candidate's TITLES
 * specifically. This measures whether `basics.label` (the candidate's
 * own headline) is part of that comparison, by scoring the same JD
 * against three resumes that differ ONLY in where the title sits.
 *
 * Needs the MiniLM model (local cache or a one-time download).
 */

import './load-env';

import { gallerySampleResumeData } from '@/lib/resume-schema/sample';
import { roleFitSimilarity } from '@/lib/scoring-async/role-fit';
import type { JobPosting } from '@/lib/resume-schema/job-posting';

const JOB: JobPosting = {
  id: 'probe-rolefit',
  title: 'Senior Backend Engineer',
  company: 'Cartwheel',
  location: '',
  description: 'Backend role.',
  requirements: [],
  niceToHaves: [],
  benefits: [],
  keywords: [],
  seniority: 'senior',
  employmentType: 'Full-time',
  source: 'paste',
  mustHaveSkills: [],
  niceToHaveSkills: [],
  implicitSkills: [],
  seniorityLevel: 'senior',
  yearsRequiredMin: null,
  yearsRequiredMax: null,
  roleFamily: 'Backend Engineer',
  domainSignals: [],
  markdown: null,
  markdownGeneratedAt: null
};

async function main(): Promise<void> {
  // 1. Baseline — the sample's work titles are "Senior Product Engineer",
  //    "Product Engineer", "Founding Engineer".
  const base = structuredClone(gallerySampleResumeData);

  // 2. The headline matches the JD, the work titles do not.
  const labelOnly = structuredClone(gallerySampleResumeData);
  labelOnly.sections.basics.label = 'Senior Backend Engineer';
  for (const w of labelOnly.sections.work) {
    for (const p of w.positions) p.title = 'Data Analyst';
  }

  // 3. The work titles match the JD, the headline does not.
  const titleOnly = structuredClone(gallerySampleResumeData);
  titleOnly.sections.basics.label = 'Data Analyst';
  for (const w of titleOnly.sections.work) {
    for (const p of w.positions) p.title = 'Senior Backend Engineer';
  }

  const results = [
    ['baseline (work titles: Product Engineer…)', base],
    ['headline = "Senior Backend Engineer", work titles = "Data Analyst"', labelOnly],
    ['headline = "Data Analyst", work titles = "Senior Backend Engineer"', titleOnly]
  ] as const;

  console.log('');
  console.log('Role Fit — which text does it compare?');
  console.log('--------------------------------------------------');
  for (const [label, resume] of results) {
    const r = await roleFitSimilarity(resume, JOB);
    console.log(
      `  ${String(r.value).padStart(3)}  ${label}` +
        `${r.bestMatchingTitle ? `  [best: "${r.bestMatchingTitle}"]` : ''}`
    );
  }
  console.log('');
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
