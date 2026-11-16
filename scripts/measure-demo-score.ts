#!/usr/bin/env node
/**
 * Measure the demo fixture's ATS score with the SHIPPED engine.
 *
 * ## Why this exists
 *
 * The demo video (`docs/plans/demo-video.md`, `brag-output/`) quotes
 * specific numbers: 75 overall, and the seven dimension values
 * (Keywords 68, Format 82, Impact 74, Experience match 69, Intent
 * coverage 90, Role fit 50, Seniority fit 100). Those numbers were
 * measured with the engine as it was at the time.
 *
 * The engine has changed since — most importantly, Role Fit went from a
 * constant 50 to a real measurement (see
 * `docs/drift/2026-11-10-one-score-three-surfaces-and-role-fit.md`).
 * A plan that quotes numbers the engine no longer produces is a plan
 * that will produce a wrong video.
 *
 * ## Why this does not touch the database
 *
 * It reproduces the seeded variant's envelope IN MEMORY, using the same
 * three steps `scripts/seed-demo.ts` takes:
 *
 *   1. `blankResumeData()` + the demo sections  → the master envelope
 *   2. `createVariant`'s copy + `jobContext`   → the variant envelope
 *   3. `scoreResumeHybridFromEnvelope`         → the score
 *
 * It writes nothing. `pnpm seed:demo` is still the thing that puts the
 * fixture in the database; this only answers "what number would the
 * scorecard render?".
 *
 * ## Usage
 *
 *   pnpm measure:demo-score
 *
 * Needs the same env the seeder needs: an AI Gateway key (the Jev
 * evaluations) and network access for the local MiniLM model download
 * (the hybrid similarity + Role Fit).
 *
 * ## The Jev caveat
 *
 * If the Gateway key is missing or Jev fails, the engine keeps its
 * token-based scores and the numbers printed here will NOT match the
 * video's. The script says so explicitly rather than printing a number
 * that looks authoritative.
 */

import './load-env';

import { blankResumeData } from '@/lib/resume-schema';
import { scoreResumeHybridFromEnvelope } from '@/lib/scoring-async/score-hybrid';
import {
  demoResumeSections,
  DEMO_JOB_CONTEXT,
  DEMO_JOB_CONTEXT_2
} from './demo-fixtures';
import type { ResumeData } from '@/lib/resume-schema/resume-data';
import type { JobPosting } from '@/lib/resume-schema/job-posting';

const RESET = '[0m';
const BOLD = '[1m';
const DIM = '[2m';
const GREEN = '[32m';
const YELLOW = '[33m';

// ── Rebuild the seeded variant's envelope, exactly as the seeder does ──
//
// scripts/seed-demo.ts:
//   const master = await createMasterResume(userId, MASTER_NAME, demoResumeSections)
//   → data = blankResumeData(); data.name = MASTER_NAME; data.sections = demoResumeSections
//
// lib/db/queries.ts createVariant():
//   const variantData = { ...structuredClone(master.data),
//                          name: `${master.data.name} — Variant`,
//                          jobContext }

const MASTER_NAME = 'Jordan Ellis — Master Resume';

function buildVariantEnvelope(jobContext: JobPosting): ResumeData {
  const master = blankResumeData();
  master.name = MASTER_NAME;
  master.sections = demoResumeSections;

  return {
    ...structuredClone(master),
    name: `${master.name} — Variant`,
    jobContext
  };
}

const DIMENSION_LABELS: Record<string, string> = {
  atsMatching: 'Keywords',
  structure: 'Format',
  contentQuality: 'Impact',
  alignment: 'Experience match',
  intentCoverage: 'Intent coverage',
  roleFit: 'Role fit',
  seniorityFit: 'Seniority fit'
};

/**
 * The ONE edit the demo makes — the "Scout rewrote it" beat.
 *
 * *"Built the asynchronous transcription pipeline"* →
 * *"Built the event-driven transcription pipeline"*
 *
 * The pipeline already WAS event-driven; the resume just never used the
 * posting's word for it. This is the edit the video films, and the reason
 * the score moves: the posting asks for event-driven architectures, and
 * this line now says so.
 *
 * Measured before and after — never predicted.
 */
const DEMO_EDIT = {
  from: 'Built the asynchronous transcription pipeline',
  to: 'Built the event-driven transcription pipeline'
};

/** Apply the demo edit to a copy of the envelope. */
function applyDemoEdit(data: ResumeData): ResumeData {
  const copy = structuredClone(data);
  for (const entry of copy.sections.work ?? []) {
    for (const position of entry.positions ?? []) {
      // The schema calls the bullet list `highlights`.
      position.highlights = position.highlights.map((highlight) =>
        highlight.includes(DEMO_EDIT.from)
          ? highlight.replace(DEMO_EDIT.from, DEMO_EDIT.to)
          : highlight
      );
    }
  }
  return copy;
}

type Breakdown = Awaited<ReturnType<typeof scoreResumeHybridFromEnvelope>>;

function printBreakdown(label: string, breakdown: Breakdown): void {
  console.log(`${BOLD}${label}${RESET}`);
  console.log(
    `  ${BOLD}Overall:${RESET} ${GREEN}${breakdown.overallScore}${RESET} / 100`
  );
  for (const [key, dimensionLabel] of Object.entries(DIMENSION_LABELS)) {
    const value =
      breakdown.dimensionScores[key as keyof typeof breakdown.dimensionScores];
    console.log(
      `  ${dimensionLabel.padEnd(18)} ${String(Math.round(value)).padStart(3)}`
    );
  }
  console.log('');
}

async function main(): Promise<void> {
  const data = buildVariantEnvelope(DEMO_JOB_CONTEXT);

  console.log('');
  console.log(`${BOLD}Demo fixture — measured with the shipped engine${RESET}`);
  console.log(
    `${DIM}scripts/measure-demo-score.ts · ${new Date().toISOString().slice(0, 10)}${RESET}`
  );
  console.log('');

  const before = await scoreResumeHybridFromEnvelope(data, DEMO_JOB_CONTEXT);
  printBreakdown(
    'BEFORE — the pristine seeded fixture (Cartwheel, Backend Platform)',
    before
  );

  const after = await scoreResumeHybridFromEnvelope(
    applyDemoEdit(data),
    DEMO_JOB_CONTEXT
  );
  printBreakdown('AFTER — one truthful edit (event-driven)', after);

  console.log(
    `${BOLD}The move:${RESET} ${before.overallScore} → ${after.overallScore}` +
      `   (Keywords ${Math.round(before.dimensionScores.atsMatching)} → ` +
      `${Math.round(after.dimensionScores.atsMatching)})`
  );
  console.log('');

  // The second posting — the "refusal" beat. It names no genuine skills,
  // so the demo's point is that the score stays low and Scout refuses.
  // The plan quotes this variant's score too, so it gets measured here.
  const refusal = await scoreResumeHybridFromEnvelope(
    buildVariantEnvelope(DEMO_JOB_CONTEXT_2),
    DEMO_JOB_CONTEXT_2
  );
  printBreakdown(
    'SECOND POSTING — Northwind Supply (Customer Ops) · the refusal beat',
    refusal
  );

  // Did Jev actually run? If it did not, the keyword / intent numbers
  // above are the token-based fallback and will NOT match the video's.
  const ic = after.intentCoverageBreakdown;
  if (ic?.fallback) {
    console.log(
      `${YELLOW}!${RESET} Intent coverage is at its neutral fallback — the v2 intent data was not`
    );
    console.log(
      `${YELLOW}!${RESET} available, so this run is NOT comparable to the video's numbers.`
    );
    console.log('');
  }

  console.log(`${BOLD}Criteria (after)${RESET}`);
  for (const [key, value] of Object.entries(after.criteriaScores ?? {})) {
    console.log(`  ${key.padEnd(24)} ${String(Math.round(value)).padStart(3)}`);
  }
  console.log('');
  console.log(
    `${DIM}The scorecard renders Math.round() of these values. Paste them into`
  );
  console.log(`${DIM}docs/plans/demo-video.md and brag-output/brag-plan.md.${RESET}`);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
