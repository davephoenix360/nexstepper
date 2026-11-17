#!/usr/bin/env node
/**
 * Can the chat agent name the weakest sub-criterion of a real score?
 *
 * ## The question
 *
 * The scorecard shows SEVEN dimension bars, and each bar is made of
 * sub-criteria. The chat agent used to receive the dimension NUMBERS
 * only — so when a candidate asked "what exactly is weak here?", it
 * could answer "your Impact score is 77" and nothing more. The advice
 * the scorecard shows beside it is keyed by CRITERION, so the chat was
 * the surface with the vaguer answer.
 *
 * The fix puts the sub-criterion scores in the agent's context and
 * states which one is weakest. This probe proves the END of the chain:
 * with a REAL resume, a REAL persisted score and the REAL chat model,
 * does the answer actually name the weakest sub-criterion?
 *
 * ## What it prints
 *
 *   - the criteria block exactly as the agent receives it,
 *   - the engine's own answer (which criterion is weakest, and which
 *     ones could not be measured at all),
 *   - the model's answer, and
 *   - a PASS/FAIL verdict on whether the model named it.
 *
 * ## Why this script does NOT import `system-prompt.ts`
 *
 * `system-prompt.ts` pulls the resume TEMPLATE COMPONENTS in, and
 * those are React components — a plain Node script cannot load them
 * under the `react-server` condition (React's server build has no
 * `createContext`). The score-carrying builders were therefore moved
 * into `lib/chat/prompt-context.ts`, which is pure text with no React
 * and no `server-only` marker. This script composes the same blocks
 * from it.
 *
 * The FULL production prompt — instructions, template catalogue and
 * all — is covered by `tests/unit/ai/weakest-criterion-probe.test.ts`,
 * which runs under Vitest (where the template registry loads fine).
 *
 * ## Read-only
 *
 * SELECT only. The chat model is called with a question — no tools are
 * exposed, so nothing can be edited.
 *
 * ## Running it
 *
 *   pnpm probe:chat-weakest-criterion              # the dev database
 *   $env:PROD_DATABASE_URL = '...'                 # the production one
 *   pnpm probe:chat-weakest-criterion
 */
import './load-env';

import postgres from 'postgres';
import { generateText } from 'ai';
import { gateway } from '@ai-sdk/gateway';

import { resumeDataSchema } from '@/lib/resume-schema';
import type { ResumeData } from '@/lib/resume-schema';
import {
  buildAtsAdviceText,
  buildAtsContext,
  buildResumeContext
} from '@/lib/chat/prompt-context';
import { criterionRows, weakestCriterionOf } from '@/lib/scoring/criteria';
import type { ScoreBreakdown } from '@/lib/scoring/score';
import { CHAT_MODEL, CHAT_MAX_OUTPUT_TOKENS } from '@/lib/ai/providers';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

/** The question a candidate would actually ask. */
const QUESTION =
  'Which part of my ATS score is the weakest? Name the specific thing to fix and tell me what to change.';

/**
 * The prompt the model gets: the resume, the score and the job. The
 * same blocks `buildSystemPrompt` assembles, minus the template
 * catalogue (which cannot be loaded outside a bundler).
 */
function composePrompt(data: ResumeData, breakdown: ScoreBreakdown): string {
  const job = data.jobContext?.description ?? '';
  return [
    'You are the resume assistant. Use the score below to advise the candidate.',
    buildResumeContext(data),
    job ? `=== JOB DESCRIPTION ===\n${job.slice(0, 4000)}` : '',
    buildAtsContext(
      breakdown,
      'snapshot',
      buildAtsAdviceText(breakdown, data)
    )
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function main(): Promise<void> {
  const url = process.env.PROD_DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    console.error('no database URL (POSTGRES_URL / PROD_DATABASE_URL)');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10 });

  const rows = await sql`
    select
      r.id,
      r.name,
      rev.data,
      snap.breakdown,
      snap.match_score,
      snap.created_at
    from resumes r
    join resume_revisions rev on rev.id = r.current_revision_id
    join lateral (
      select breakdown, match_score, created_at
      from score_snapshots s
      where s.resume_id = r.id and s.breakdown is not null
      order by s.created_at desc
      limit 1
    ) snap on true
    where r.is_master = false
    order by snap.created_at desc
    limit 3
  `;

  if (rows.length === 0) {
    console.error('no scored variant found');
    await sql.end();
    process.exit(1);
  }

  let failures = 0;

  for (const row of rows) {
    const data = resumeDataSchema.parse(row.data) as ResumeData;
    const breakdown = row.breakdown as ScoreBreakdown;
    const scoreRows = criterionRows(breakdown);
    const weakest = weakestCriterionOf(breakdown);
    const unmeasured = scoreRows.filter((r) => r.measurement !== 'measured');

    console.log('');
    console.log(`${BOLD}${row.name}${RESET} ${DIM}(${row.id})${RESET}`);
    console.log(
      `  stored score ${row.match_score} · snapshot ${String(row.created_at).slice(0, 19)}`
    );

    if (!weakest) {
      console.log(
        `  ${YELLOW}no measured sub-criterion — nothing to point at${RESET}`
      );
      continue;
    }

    console.log(
      `  ${BOLD}engine says the weakest is:${RESET} ${weakest.criterion} (${Math.round(
        weakest.score
      )}/100, ${weakest.dimension})`
    );
    if (unmeasured.length > 0) {
      console.log(
        `  ${DIM}not measurable: ${unmeasured
          .map((r) => `${r.criterion} (${Math.round(r.score)})`)
          .join(', ')}${RESET}`
      );
    }

    const prompt = composePrompt(data, breakdown);
    const criteriaBlock = prompt.split('Sub-criterion scores')[1] ?? '';

    // `PROBE_SKIP_MODEL=1` prints the prompt the model WOULD get and
    // stops there — free, and the way to inspect the block itself.
    const skipModel = process.env.PROBE_SKIP_MODEL === '1';

    console.log(
      `  ${DIM}criteria block sent to the model:${RESET}\n${criteriaBlock
        .split('\n')
        .slice(0, skipModel ? 60 : 20)
        .map((l) => `    ${l}`)
        .join('\n')}`
    );

    if (skipModel) {
      console.log('');
      console.log(`  ${DIM}(model call skipped — PROBE_SKIP_MODEL=1)${RESET}`);
      continue;
    }

    const result = await generateText({
      model: gateway(CHAT_MODEL),
      system: prompt,
      messages: [{ role: 'user', content: QUESTION }],
      maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
      temperature: 0.3
    });

    const answer = result.text ?? '';
    console.log('');
    console.log(`  ${BOLD}model's answer:${RESET}`);
    console.log(
      answer
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n')
    );

    const named = answer
      .toLowerCase()
      .includes(weakest.criterion.toLowerCase());
    const namedUnmeasured = unmeasured.filter((r) =>
      answer.toLowerCase().includes(r.criterion.toLowerCase())
    );

    console.log('');
    if (named) {
      console.log(
        `  ${GREEN}PASS${RESET} — the agent named the weakest sub-criterion (${weakest.criterion}).`
      );
    } else {
      failures += 1;
      console.log(
        `  ${RED}FAIL${RESET} — the agent did not name ${weakest.criterion}.`
      );
    }
    if (namedUnmeasured.length > 0) {
      console.log(
        `  ${YELLOW}note${RESET} — the answer also mentions an unmeasurable criterion: ${namedUnmeasured
          .map((r) => r.criterion)
          .join(', ')}`
      );
    }
  }

  console.log('');
  await sql.end();
  if (failures > 0) {
    console.log(
      `${RED}${failures} resume(s) where the agent missed the weakest sub-criterion${RESET}`
    );
    process.exit(1);
  }
  console.log(
    `${GREEN}the agent named the weakest sub-criterion on every scored variant${RESET}`
  );
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
