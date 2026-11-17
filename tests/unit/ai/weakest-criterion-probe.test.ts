/**
 * PROBE — can the chat agent name the weakest sub-criterion?
 *
 * ## Why this exists
 *
 * The chat agent used to receive the seven DIMENSION scores and
 * nothing below them. "Impact 77" says which bar is weak; it does not
 * say which PART of the bar is weak — and the scorecard's advice is
 * keyed by CRITERION. So when a candidate asked "what exactly is
 * weak here?", the agent could only repeat a dimension number, and
 * the chat's advice was vaguer than the scorecard beside it.
 *
 * This probe measures the END of the chain, with the real prompt and
 * the real chat model:
 *
 *   1. score a REAL resume against a REAL job with the shipped
 *      engine (so the numbers are genuine, not a fixture),
 *   2. build the EXACT system prompt the chat route builds, and
 *   3. ask the question a candidate would ask.
 *
 * Then it checks the answer against the engine's own verdict:
 *
 *   - the answer must NAME the weakest measured sub-criterion, and
 *   - the answer must NOT present a criterion that could not be
 *     measured as the weakness (Role Fit reads 50 with no title
 *     signal — that is a non-measurement, not a mediocre score).
 *
 * ## Running it
 *
 * Skipped by default — it makes network calls. Run it deliberately:
 *
 *   RUN_AI_PROBE=1 npx vitest run tests/unit/ai/weakest-criterion-probe.test.ts
 *
 * The offline half of the same contract lives in
 * `tests/unit/chat/ats-criteria.test.ts` and
 * `tests/unit/scoring/criteria.test.ts` — this file only proves the
 * MODEL reads the block correctly.
 */
import { describe, expect, it } from 'vitest';
import { generateText } from 'ai';
import { gateway } from '@ai-sdk/gateway';

import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { blankResumeData } from '@/lib/resume-schema';
import { scoreResumeFromEnvelope } from '@/lib/scoring';
import { criterionRows, weakestCriterionOf } from '@/lib/scoring/criteria';
import { CHAT_MODEL, CHAT_MAX_OUTPUT_TOKENS } from '@/lib/ai/providers';
import {
  demoResumeSections,
  DEMO_JOB_CONTEXT
} from '../../../scripts/demo-fixtures';

const ENABLED = process.env.RUN_AI_PROBE === '1';

/** The question a candidate would actually ask. */
const QUESTION =
  'Which part of my ATS score is the weakest? Name the specific thing to fix and tell me what to change.';

/**
 * The demo candidate's envelope — the same one the seeder writes and
 * the demo video films.
 */
function buildVariantEnvelope() {
  const master = blankResumeData();
  master.name = 'Jordan Ellis — Master Resume';
  master.sections = demoResumeSections;
  return {
    ...structuredClone(master),
    name: `${master.name} — Variant`,
    jobContext: DEMO_JOB_CONTEXT
  };
}

describe.skipIf(!ENABLED)('the agent names the weakest sub-criterion (network)', () => {
  it(
    'names the weakest MEASURED sub-criterion, and does not blame an unmeasurable one',
    async () => {
      const data = buildVariantEnvelope();
      // The shipped engine, with an explicit clock. Role Fit has no
      // precomputed similarity here (the sync path), so it reads the
      // neutral 50 — which is exactly the "could not be measured" case
      // the probe must not let the agent report as a weakness.
      const breakdown = scoreResumeFromEnvelope(
        data,
        DEMO_JOB_CONTEXT,
        new Date('2026-11-17T00:00:00Z')
      );

      const rows = criterionRows(breakdown);
      const weakest = weakestCriterionOf(breakdown);
      const unmeasured = rows.filter((r) => r.measurement !== 'measured');

      console.log(
        `\n### overall ${breakdown.overallScore} · weakest: ${weakest?.criterion} (${Math.round(
          weakest?.score ?? 0
        )}) · unmeasurable: ${unmeasured.map((r) => r.criterion).join(', ') || 'none'}\n`
      );

      expect(weakest).not.toBeNull();

      const system = buildSystemPrompt(
        data,
        DEMO_JOB_CONTEXT,
        breakdown,
        { isMaster: false, variantCount: 0 },
        null,
        null,
        [],
        'snapshot'
      );

      const result = await generateText({
        model: gateway(CHAT_MODEL),
        system,
        messages: [{ role: 'user', content: QUESTION }],
        maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
        temperature: 0.3
      });

      const answer = result.text ?? '';
      console.log(`### answer:\n${answer}\n`);

      // 1. It names the weakest measured sub-criterion.
      expect(answer.toLowerCase()).toContain(weakest!.criterion.toLowerCase());

      // 2. It does not present an unmeasurable criterion as THE
      //    weakness. Naming it as context is fine; claiming it is the
      //    thing to fix is not.
      for (const row of unmeasured) {
        const claimed = new RegExp(
          `weakest[^.]{0,80}${row.criterion}|${row.criterion}[^.]{0,80}weakest`,
          'i'
        );
        expect(claimed.test(answer)).toBe(false);
      }
    },
    600_000
  );
});
