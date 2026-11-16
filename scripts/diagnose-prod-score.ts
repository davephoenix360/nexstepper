#!/usr/bin/env node
/**
 * READ-ONLY diagnostic: why is a variant's Role Fit dimension at 50?
 *
 * ## The question
 *
 * A user recomputes a variant's ATS score and the Role Fit bar reads
 * exactly **50** — the neutral constant. The Role Fit fix (2026-11-10)
 * wired `roleFitSimilarity()` into the hybrid scorer, so 50 now means
 * "no usable title signal", not "we didn't bother".
 *
 * `roleFitSimilarity` returns the neutral 50 in exactly two cases:
 *
 *   1. `job.title` is empty  → the JD has no title.
 *   2. the resume has no work-position titles → nothing to compare.
 *
 * (A failed model load is NOT one of them — `semanticSimilarity`
 * returns 0 on failure, which scores **0**, not 50. So 50 is a
 * positive signal: the dimension had nothing to work with.)
 *
 * ## What this script does
 *
 * Connects to the given Postgres URL and READS:
 *
 *   - the user's resumes, with the JD title, the JD role family, and
 *     the work-position titles from the CURRENT revision;
 *   - the latest few score snapshots, with the full breakdown.
 *
 * It issues SELECTs only. It never writes.
 *
 * ## Usage
 *
 *   PROD_DATABASE_URL='postgres://...' tsx --conditions=react-server scripts/diagnose-prod-score.ts daveipreyeo5@gmail.com
 *
 * The URL must be the POOLED endpoint (the `-pooler` one) so a long
 * query cannot hold a direct connection open.
 */

import postgres from 'postgres';
import './load-env';

const RESET = '[0m';
const BOLD = '[1m';
const DIM = '[2m';
const RED = '[31m';
const GREEN = '[32m';
const YELLOW = '[33m';

const url = process.env.PROD_DATABASE_URL;
const email = process.argv[2];

if (!url) {
  console.error(
    `${RED}PROD_DATABASE_URL is not set.${RESET} Pass the pooled Neon URL:\n` +
      `  $env:PROD_DATABASE_URL='postgres://...' pnpm diagnose:prod-score you@example.com`
  );
  process.exit(1);
}

if (!email) {
  console.error(
    `${RED}Usage:${RESET} pnpm diagnose:prod-score <account email>`
  );
  process.exit(1);
}

const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10 });

async function main(): Promise<void> {
  console.log('');
  console.log(`${BOLD}Production diagnostic — READ ONLY${RESET}`);
  console.log(`${DIM}scripts/diagnose-prod-score.ts${RESET}`);
  console.log('');

  // `--users` lists the accounts, so the right email can be picked.
  if (email === '--users') {
    const users = await sql`
      select email, name, created_at from "user" order by created_at
    `;
    console.log(`${BOLD}${users.length} account(s)${RESET}`);
    for (const u of users) {
      console.log(`  ${u.email}  ${DIM}${u.name} · ${String(u.created_at).slice(0, 10)}${RESET}`);
    }
    await sql.end();
    return;
  }

  // `--score <resumeId>` pulls one variant's CURRENT revision out of
  // production and scores it LOCALLY with the shipped engine, then
  // prints the local numbers next to the stored snapshot's. That
  // comparison is the decisive test: if the local run produces a
  // different Role Fit or a different ATS Similarity than the stored
  // snapshot, production is not running the code you think it is.
  if (email === '--score' && process.argv[3]) {
    const resumeId = process.argv[3];
    const { scoreResumeHybridFromEnvelope } = await import(
      '@/lib/scoring-async/score-hybrid'
    );

    const rows = await sql`
      select
        r.id, r.name, r.is_master, rev.data
      from resumes r
      join resume_revisions rev on rev.id = r.current_revision_id
      where r.id = ${resumeId}
    `;
    if (rows.length === 0) {
      console.log(`${RED}No resume with id ${resumeId}.${RESET}`);
      await sql.end();
      return;
    }
    const row = rows[0];
    const data = row.data as Record<string, unknown>;
    const jobContext = data.jobContext as
      | { title?: string; roleFamily?: string | null }
      | undefined;

    console.log(`${BOLD}${row.name}${RESET} ${DIM}(${row.id})${RESET}`);
    console.log(
      `  JD title     : ${jobContext?.title ? `"${jobContext.title}"` : `${YELLOW}EMPTY${RESET}`}`
    );
    console.log(
      `  JD roleFamily: ${jobContext?.roleFamily ?? `${YELLOW}null${RESET}`}`
    );
    console.log('');

    const breakdown = await scoreResumeHybridFromEnvelope(
      data as never,
      jobContext as never
    );

    console.log(`${BOLD}LOCAL ENGINE (this checkout)${RESET}`);
    console.log(`  overall: ${breakdown.overallScore}`);
    console.log(
      `  dimensions: ${Object.entries(breakdown.dimensionScores)
        .map(([k, v]) => `${k}=${Math.round(v)}`)
        .join('  ')}`
    );
    console.log(
      `  criteria  : ATS Similarity=${Math.round(
        breakdown.criteriaScores['ATS Similarity'] ?? -1
      )}  ATS Keyword Match=${Math.round(
        breakdown.criteriaScores['ATS Keyword Match'] ?? -1
      )}  Role Fit=${Math.round(breakdown.criteriaScores['Role Fit'] ?? -1)}`
    );

    const snaps = await sql`
      select match_score, computed_in_ms, created_at, breakdown
      from score_snapshots
      where resume_id = ${resumeId}
      order by created_at desc
      limit 1
    `;
    if (snaps.length > 0) {
      const s = snaps[0];
      const b = s.breakdown as Record<string, unknown> | null;
      const dims = (b?.dimensionScores ?? {}) as Record<string, number>;
      const crit = (b?.criteriaScores ?? {}) as Record<string, number>;
      const degraded = (b?.degraded ?? {}) as { semantic?: string };
      if (degraded.semantic) {
        console.log('');
        console.log(`${BOLD}DEGRADED — semantic signal unavailable${RESET}`);
        // Printed with explicit newlines: sharp's error message is a
        // multi-line block whose second half names the actual reason.
        console.log(
          degraded.semantic
            .split('\n')
            .map((line) => `  ${line}`)
            .join('\n')
        );
      }
      console.log('');
      console.log(
        `${BOLD}STORED SNAPSHOT${RESET} ${DIM}${String(s.created_at).slice(0, 19)}${RESET}`
      );
      console.log(`  overall: ${s.match_score}`);
      console.log(
        `  dimensions: ${Object.entries(dims)
          .map(([k, v]) => `${k}=${Math.round(v)}`)
          .join('  ')}`
      );
      console.log(
        `  criteria  : ATS Similarity=${Math.round(
          crit['ATS Similarity'] ?? -1
        )}  ATS Keyword Match=${Math.round(
          crit['ATS Keyword Match'] ?? -1
        )}  Role Fit=${Math.round(crit['Role Fit'] ?? -1)}`
      );
    }
    await sql.end();
    return;
  }

  const users = await sql`
    select id, email, name from "user" where email = ${email}
  `;
  if (users.length === 0) {
    console.log(`${RED}No user with email ${email}.${RESET}`);
    await sql.end();
    return;
  }
  const user = users[0];
  console.log(`${BOLD}Account${RESET} ${user.name} <${user.email}>`);
  console.log('');

  const resumes = await sql`
    select
      r.id,
      r.name,
      r.is_master,
      r.created_at,
      rev.data->'jobContext'->>'title'            as jd_title,
      rev.data->'jobContext'->>'company'          as jd_company,
      rev.data->'jobContext'->>'roleFamily'       as jd_role_family,
      rev.data->'jobContext'->>'seniorityLevel'   as jd_seniority,
      rev.data->'sections'->'work'                as work
    from resumes r
    join resume_revisions rev on rev.id = r.current_revision_id
    where r.user_id = ${user.id}
    order by r.is_master desc, r.created_at asc
  `;

  for (const r of resumes) {
    console.log(`${BOLD}${r.name}${RESET} ${DIM}(${r.id})${RESET}`);
    console.log(`  master: ${r.is_master}`);
    console.log(
      `  JD title      : ${r.jd_title ? `"${r.jd_title}"` : `${YELLOW}EMPTY${RESET}`}`
    );
    console.log(
      `  JD roleFamily : ${r.jd_role_family ? `"${r.jd_role_family}"` : `${YELLOW}null${RESET}`}`
    );
    console.log(
      `  JD seniority  : ${r.jd_seniority || `${YELLOW}empty${RESET}`}`
    );

    const work = r.work as unknown;
    const titles: string[] = [];
    if (Array.isArray(work)) {
      for (const entry of work) {
        const positions = (entry as { positions?: { title?: string }[] })
          .positions;
        for (const pos of positions ?? []) {
          const t = (pos.title ?? '').trim();
          if (t) titles.push(t);
        }
      }
    }
    console.log(
      `  resume titles : ${
        titles.length ? titles.join(' | ') : `${YELLOW}NONE${RESET}`
      }`
    );

    const snaps = await sql`
      select match_score, computed_in_ms, created_at, breakdown
      from score_snapshots
      where resume_id = ${r.id}
      order by created_at desc
      limit 2
    `;

    if (snaps.length === 0) {
      console.log(`  ${DIM}no score snapshots${RESET}`);
      console.log('');
      continue;
    }

    for (const s of snaps) {
      console.log(
        `  ${DIM}snapshot ${String(s.created_at).slice(0, 19)} → ${s.match_score} (computedInMs=${s.computed_in_ms})${RESET}`
      );
      const b = s.breakdown as Record<string, unknown> | null;
      if (!b) {
        console.log(`    ${YELLOW}no breakdown column${RESET}`);
        continue;
      }
      const dims = b.dimensionScores as Record<string, number>;
      const degraded = b.degraded as { semantic?: string } | undefined;
      if (degraded?.semantic) {
        console.log(
          `    ${RED}DEGRADED — semantic signal unavailable:${RESET} ${degraded.semantic}`
        );
      }
      const crit = (b.criteriaScores ?? {}) as Record<string, number>;
      console.log(
        `    dimensions: ${Object.entries(dims)
          .map(([k, v]) => `${k}=${Math.round(v)}`)
          .join('  ')}`
      );
      console.log(
        `    criteria  : ATS Similarity=${Math.round(
          crit['ATS Similarity'] ?? -1
        )}  ATS Keyword Match=${Math.round(
          crit['ATS Keyword Match'] ?? -1
        )}  Role Fit=${Math.round(crit['Role Fit'] ?? -1)}`
      );
      const ic = b.intentCoverageBreakdown as { fallback?: boolean } | undefined;
      if (ic?.fallback) {
        console.log(`    ${YELLOW}intent coverage fell back (v1 weights)${RESET}`);
      }
    }
    console.log('');
  }

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await sql.end();
  } catch {
    /* already closed */
  }
  process.exit(1);
});
