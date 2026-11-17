#!/usr/bin/env node
/**
 * Did the "Optimal Length" criterion drift when the scored text grew?
 *
 * ## The concern
 *
 * The Structure dimension's second sub-criterion is a penalty for being
 * outside a 500-800 word sweet spot. It measures the length of the
 * SCORED TEXT — which, until 2026-11-17, was a narrower document than
 * the one the engine now reads (no education, no certificates, no
 * languages, no volunteer, no awards, no publications, no location).
 *
 * The flattener change made the scored text bigger. So the same visible
 * resume can now score LOWER on length: the criterion's calibration
 * (500-800) was set against the old text.
 *
 * ## What this prints
 *
 * For a real resume, the word count under the OLD flatten and the NEW
 * one, and the length score each produces. Read-only; production
 * queries are SELECT only.
 *
 * ## Usage
 *
 *   PROD_DATABASE_URL=... pnpm tsx scripts/probe-length-drift.ts [resumeId]
 */

import postgres from 'postgres';
import './load-env';

import { flattenResumeText, wordCount } from '@/lib/scoring/similarity';
import { resumeDataToScoreable } from '@/lib/scoring/resume-adapter';
import { scoreStructure } from '@/lib/scoring/dimensions/structure';
import type { ResumeData } from '@/lib/resume-schema';

/**
 * The pre-2026-11-17 flatten — the document the 500-800 target was
 * calibrated against. Kept here so the drift is measurable, not
 * arguable.
 */
function flattenOld(resume: ResumeData): string {
  const sections = resume.sections;
  const parts: string[] = [];
  parts.push(sections.basics.summary ?? '', sections.basics.label ?? '');
  for (const skill of sections.skills) {
    parts.push(skill.name, ...skill.keywords);
  }
  for (const job of sections.work) {
    parts.push(job.description ?? '');
    for (const pos of job.positions) {
      parts.push(pos.title ?? '', ...(pos.highlights ?? []));
    }
  }
  for (const proj of sections.projects ?? []) {
    parts.push(proj.name ?? '', proj.description ?? '', ...(proj.highlights ?? []));
  }
  return parts.filter(Boolean).join(' \n ');
}

function lengthScore(words: number): number {
  return words >= 500 && words <= 800 ? 100 : Math.max(0, 100 - Math.abs(650 - words) * 0.1);
}

async function main(): Promise<void> {
  const resumeId = process.argv[2];
  if (!resumeId) {
    console.error('usage: probe-length-drift.ts <resumeId>');
    process.exit(1);
  }

  const url = process.env.PROD_DATABASE_URL;
  if (!url) {
    console.error('PROD_DATABASE_URL is not set');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10 });

  const rows = await sql`
    select r.id, r.name, rev.data
    from resumes r
    join resume_revisions rev on rev.id = r.current_revision_id
    where r.id = ${resumeId}
  `;
  if (rows.length === 0) {
    console.error('resume not found');
    await sql.end();
    process.exit(1);
  }

  const row = rows[0];
  const data = row.data as unknown as ResumeData;
  const scoreable = resumeDataToScoreable(data);

  const oldWords = wordCount(flattenOld(data));
  const newWords = wordCount(flattenResumeText(scoreable));
  const structure = scoreStructure(scoreable);

  console.log('');
  console.log(`Length-drift check — ${row.name ?? row.id}`);
  console.log('----------------------------------------------------');
  console.log(`  words under the OLD flatten : ${oldWords}  → length score ${lengthScore(oldWords)}`);
  console.log(`  words under the NEW flatten : ${newWords}  → length score ${lengthScore(newWords)}`);
  console.log(`  difference                  : +${newWords - oldWords} words`);
  console.log('');
  console.log(`  section completeness : ${structure.breakdown.sectionCompleteness}`);
  console.log(`  length score         : ${structure.breakdown.lengthScore}`);
  console.log(`  structure value      : ${structure.value}`);
  console.log('');
  console.log(`  sections present     : work=${data.sections.work.length > 0} ` +
    `education=${(data.sections.education ?? []).length > 0} ` +
    `skills=${data.sections.skills.length > 0} ` +
    `projects=${(data.sections.projects ?? []).length > 0} ` +
    `certificates=${(data.sections.certificates ?? []).length > 0} ` +
    `volunteer=${(data.sections.volunteer ?? []).length > 0} ` +
    `awards=${(data.sections.awards ?? []).length > 0} ` +
    `publications=${(data.sections.publications ?? []).length > 0} ` +
    `languages=${(data.sections.languages ?? []).length > 0}`);
  console.log('');

  await sql.end();
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
