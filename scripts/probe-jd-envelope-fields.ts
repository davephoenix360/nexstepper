#!/usr/bin/env node
/**
 * Which JD envelope fields does production actually store?
 *
 * ## Why this exists
 *
 * `job.requirements` and `job.niceToHaves` are read by:
 *
 *   - the ATS matching dimension's COVERAGE sub-criterion (which is
 *     SKIPPED when the requirements list is empty — the weights
 *     re-normalise, so it degrades gracefully),
 *   - the "ATS Coverage" TIP, which can only fire when there are
 *     requirements to be uncovered — so on the Keywords bar it never
 *     fires,
 *   - the eligibility gate detector (`jobEligibilityGates`).
 *
 * But the attach paths build the envelope from the raw JD text and
 * never write a requirements list. So all three read a field that is
 * empty in production.
 *
 * This measures it rather than assuming it: SELECT only, read-only.
 */
import './load-env';

import postgres from 'postgres';

async function main(): Promise<void> {
  const url = process.env.PROD_DATABASE_URL;
  if (!url) {
    console.error('PROD_DATABASE_URL is not set');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10 });

  const rows = await sql`
    select
      r.name,
      rev.data->'jobContext'->'requirements'   as reqs,
      rev.data->'jobContext'->'niceToHaves'   as nices,
      rev.data->'jobContext'->'mustHaveSkills' as must,
      rev.data->'jobContext'->'niceToHaveSkills' as nice_skills,
      length(coalesce(rev.data->'jobContext'->>'description', '')) as desc_len
    from resumes r
    join resume_revisions rev on rev.id = r.current_revision_id
  `;

  const size = (value: unknown): string => {
    if (Array.isArray(value)) return `${value.length} item(s)`;
    if (value === null || value === undefined) return 'null';
    return 'not an array';
  };

  console.log('');
  console.log('JD envelope fields actually stored in production');
  console.log('-------------------------------------------------------');
  for (const row of rows) {
    console.log(`  ${row.name}`);
    console.log(`    requirements     : ${size(row.reqs)}`);
    console.log(`    niceToHaves      : ${size(row.nices)}`);
    console.log(`    mustHaveSkills   : ${size(row.must)}`);
    console.log(`    niceToHaveSkills : ${size(row.nice_skills)}`);
    console.log(`    description chars: ${row.desc_len}`);
  }
  console.log('');
  await sql.end();
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
