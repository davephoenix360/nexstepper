#!/usr/bin/env node
/**
 * Why does the AI rewrite the TOP bullet when the advice names another?
 *
 * ## The report
 *
 * Hovering "Impact" shows the advice naming TWO specific weak bullets
 * ("2 of 7 work bullets describe a task rather than an outcome (…)").
 * Clicking it opens the AI rewrite on the FIRST work bullet instead.
 *
 * Two candidate causes:
 *
 *   A. The stored `matchBreakdown` still carries the OLD path — it is
 *      written when a snapshot is written, so a snapshot taken before
 *      the fix keeps pointing at bullet #1.
 *   B. The alignment between `jevBullets[i]` and the flattened work
 *      bullet list is off, so the path points at the wrong bullet.
 *
 * This prints, for every stored snapshot: the Impact row's path, the
 * bullet AT that path, and the bullets the advice names. That tells us
 * which.
 *
 * Read-only. SELECT only.
 */
import './load-env';

import postgres from 'postgres';

import { resumeDataSchema } from '@/lib/resume-schema';
import { buildDynamicTips } from '@/lib/scoring/tips';
import { tipsToPlainText } from '@/lib/scoring/tips-text';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const YELLOW = '\x1b[33m';

function bulletAtPath(resume: unknown, path: string): string | null {
  const m = /^sections\.work\.(\d+)\.positions\.(\d+)\.highlights\.(\d+)$/.exec(path);
  if (!m) return null;
  const [, w, p, b] = m;
  const sections = (resume as { sections?: Record<string, unknown> }).sections;
  const work = (sections?.work ?? []) as Array<{
    positions?: Array<{ highlights?: string[] }>;
  }>;
  return work[Number(w)]?.positions?.[Number(p)]?.highlights?.[Number(b)] ?? null;
}

async function main(): Promise<void> {
  const url = process.env.PROD_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('no database URL');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10 });

  const rows = await sql`
    select
      r.id,
      r.name,
      rev.data,
      snap.breakdown,
      snap.match_breakdown,
      snap.created_at
    from resumes r
    join resume_revisions rev on rev.id = r.current_revision_id
    join lateral (
      select breakdown, match_breakdown, created_at
      from score_snapshots s
      where s.resume_id = r.id
      order by s.created_at desc
      limit 1
    ) snap on true
    order by r.created_at desc
    limit 6
  `;

  for (const row of rows) {
    const resume = resumeDataSchema.parse(row.data);
    const breakdown = row.breakdown as never;
    const tips = buildDynamicTips(breakdown, resume, resume.jobContext ?? null);
    const impactTip = tipsToPlainText(tips)['Accomplishment Focus'] ?? '';
    const matchBreakdown = (row.match_breakdown ?? []) as Array<{
      path: string;
      criterion: string;
    }>;
    const impactRow = matchBreakdown.find((m) => m.criterion === 'Accomplishment Focus');

    console.log('');
    console.log(`${BOLD}${row.name}${RESET} ${DIM}(${row.id})${RESET}`);
    console.log(`  snapshot ${String(row.created_at).slice(0, 19)}`);
    console.log(`  Impact row path : ${impactRow?.path ?? '(no row)'}`);
    const at = impactRow ? bulletAtPath(resume, impactRow.path) : null;
    console.log(`  bullet AT path  : ${at ? `"${at.slice(0, 90)}…"` : '(none)'}`);
    console.log(`  the advice says : ${impactTip ? `${String(impactTip).slice(0, 160)}…` : '(no tip)'}`);
    if (impactRow && at) {
      const inAdvice = impactTip.includes(at.slice(0, 40));
      console.log(
        `  → does the path point at a bullet the advice names? ${inAdvice ? 'YES' : `${YELLOW}NO${RESET}`}`
      );
    }
    if (impactRow) {
      console.log("  the resume's work bullets:");
      const work = (resume.sections.work ?? []) as Array<{
        company?: string;
        positions?: Array<{ title?: string; highlights?: string[] }>;
      }>;
      work.forEach((entry, w) => {
        entry.positions?.forEach((pos, p) => {
          (pos.highlights ?? []).forEach((b, bi) => {
            const path = `sections.work.${w}.positions.${p}.highlights.${bi}`;
            const isTarget = path === impactRow.path;
            const named = impactTip.includes(b.slice(0, 40));
            console.log(
              `    ${isTarget ? '>>>' : '   '} ${path}  ${named ? '[named] ' : ''}"${b.slice(0, 64)}..."`
            );
          });
        });
      });
    }
  }

  console.log('');
  await sql.end();
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
