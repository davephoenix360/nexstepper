#!/usr/bin/env node
/**
 * Seed the demo account used for the product demo video.
 *
 * Plan: docs/plans/demo-video.md §"Recording prep".
 *
 * ## What it creates
 *
 *   A demo account (`demo@nexstepper.com`) on the Pro plan, holding:
 *
 *   - a master resume for a synthetic candidate (Jordan Ellis),
 *   - a tailored VARIANT of that master against a backend-platform posting,
 *   - a real, computed ATS score for that variant (persisted snapshot),
 *   - a first-session analysis, so Scout opens the conversation already
 *     informed rather than asking what it can work out itself,
 *   - a second posting that names NO real skills, for the "refusal" beat.
 *
 * ## Why the score is computed for real
 *
 * A demo video that shows a hand-written score is a fabrication, and this
 * product's entire claim is that its number is honest. The hybrid scorer is
 * called here — the same function the Recompute button calls — and the
 * snapshot is written through the same query helper, so the page renders
 * exactly the number the seeder printed.
 *
 * ## Safety
 *
 * This repo has TWO Neon projects: `.env.local` points at the dev database,
 * `.env.production.local` at the live one. The seeder refuses to run if the
 * resolved database host matches production's. There is no override flag on
 * purpose — if you ever need to write to production deliberately, change
 * this file rather than looking for a bypass.
 *
 * ## Usage
 *
 *   pnpm seed:demo            # seed if the demo account is missing
 *   pnpm seed:demo:reset      # wipe the demo account and re-seed
 *
 * Idempotent: running it twice leaves the state identical. The second run
 * is a no-op (the AI calls are not repeated, which is the point — a live
 * model would make the demo state drift between takes).
 */

import './load-env';

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from 'better-auth/crypto';

import { db } from '@/lib/db/drizzle';
import { user, account, subscriptions } from '@/lib/db/schema';
import {
  createMasterResume,
  createVariant,
  renameResume,
  createApplication,
  createResumeVariant,
  recordScoreSnapshot,
  recordResumeAnalysis,
  getResume
} from '@/lib/db/queries';
import { scoreResumeHybridFromEnvelope } from '@/lib/scoring-async/score-hybrid';
import { evaluateJevRequirements } from '@/lib/scoring-async/jev-requirements';
import { buildDynamicTips } from '@/lib/scoring/tips';
import {
  buildMatchBreakdown,
  maybeAppendSkillGapEntry
} from '@/lib/inline-issue/build-match-breakdown';
import {
  runFirstSessionAnalysis,
  hashJobDescription
} from '@/lib/chat/first-session-analysis';

import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_USER_NAME,
  demoResumeSections,
  DEMO_JD_TEXT,
  DEMO_JD_PARSED,
  DEMO_JD_TITLE,
  DEMO_JD_COMPANY,
  DEMO_JOB_CONTEXT,
  DEMO_JD2_TEXT,
  DEMO_JD2_PARSED,
  DEMO_JD2_TITLE,
  DEMO_JD2_COMPANY,
  DEMO_JOB_CONTEXT_2
} from './demo-fixtures';

// ─── Output helpers ─────────────────────────────────────────────────────────

const RESET = '[0m';
const BOLD = '[1m';
const DIM = '[2m';
const GREEN = '[32m';
const YELLOW = '[33m';
const RED = '[31m';

function log(message: string): void {
  console.log(message);
}

function step(message: string): void {
  console.log(`${BOLD}▸ ${message}${RESET}`);
}

function ok(message: string): void {
  console.log(`  ${GREEN}✓${RESET} ${message}`);
}

function warn(message: string): void {
  console.log(`  ${YELLOW}!${RESET} ${message}`);
}

function fail(message: string): void {
  console.error(`  ${RED}✗${RESET} ${message}`);
}

// ─── Environment guard ──────────────────────────────────────────────────────

/**
 * Read `KEY=VALUE` pairs out of a dotenv file without evaluating it.
 *
 * Deliberately dumb: it only needs to find one URL, and a dotenv file is
 * `KEY=value` lines with optional comments.
 */
function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqAt = line.indexOf('=');
    if (eqAt === -1) continue;
    const key = line.slice(0, eqAt).trim();
    let value = line.slice(eqAt + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Resolve the target database and refuse anything that looks like prod.
 *
 * Returns the hostname so the caller can print it — a seeding run should
 * never be a mystery about where it wrote.
 */
function resolveTargetDatabase(): string {
  const url = process.env.POSTGRES_URL;
  const host = hostOf(url);

  if (!url || !host) {
    throw new Error(
      'POSTGRES_URL is not set. The seeder loads .env.local then .env — ' +
        'make sure one of them points at the DEV database.'
    );
  }

  const prodEnv = readEnvFile(
    path.resolve(process.cwd(), '.env.production.local')
  );
  const prodHost = hostOf(prodEnv.POSTGRES_URL ?? prodEnv.DATABASE_URL);

  if (prodHost && prodHost === host) {
    throw new Error(
      `Refusing to seed: POSTGRES_URL points at the PRODUCTION database (${host}).\n` +
        'The seeder only ever writes to the dev database.'
    );
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV=production. The seeder is a local tool.'
    );
  }

  return host;
}

// ─── Seeding ────────────────────────────────────────────────────────────────

const MASTER_NAME = 'Jordan Ellis — Master Resume';
const VARIANT_NAME = 'Jordan Ellis — Cartwheel (Backend Platform)';

async function seed(): Promise<void> {
  const reset = process.argv.slice(2).includes('--reset');
  const host = resolveTargetDatabase();
  log(`${DIM}Target database: ${host}${RESET}`);

  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEMO_EMAIL))
    .limit(1);

  if (existing.length > 0 && !reset) {
    log('');
    step('Demo account already exists — nothing to do.');
    warn('Run with --reset to wipe it and re-seed from scratch.');
    await printSummary(existing[0].id);
    return;
  }

  if (existing.length > 0) {
    // Every domain table cascades from `user`, so deleting the row wipes
    // resumes, revisions, applications, variants, snapshots, analyses and
    // chat in one statement.
    await db.delete(user).where(eq(user.id, existing[0].id));
    log('');
    step('Wiped the previous demo account');
  }

  log('');
  step('Creating the demo account');

  const userId = randomUUID();
  const now = new Date();

  await db.insert(user).values({
    id: userId,
    name: DEMO_USER_NAME,
    email: DEMO_EMAIL,
    emailVerified: true,
    createdAt: now,
    updatedAt: now
  });

  // Better Auth's own hashing, so the account can genuinely sign in.
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await db.insert(account).values({
    id: randomUUID(),
    accountId: userId,
    providerId: 'credential',
    userId,
    password: passwordHash,
    createdAt: now,
    updatedAt: now
  });
  ok(`user + credential account (${DEMO_EMAIL})`);

  // A local mirror row, not a real Stripe subscription. It is enough for
  // `isProEffective()`, which is what gates the Pro surfaces.
  await db.insert(subscriptions).values({
    id: randomUUID(),
    userId,
    stripeCustomerId: `cus_demo_${userId.slice(0, 12)}`,
    stripeSubscriptionId: `sub_demo_${userId.slice(0, 12)}`,
    stripePriceId: 'price_demo_pro',
    plan: 'pro',
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now
  });
  ok('subscription (plan=pro, status=active)');

  log('');
  step('Creating the master resume');
  const master = await createMasterResume(userId, MASTER_NAME, demoResumeSections);
  await renameResume(master.id, userId, MASTER_NAME);
  ok(`master resume "${MASTER_NAME}"`);

  log('');
  step('Creating the two postings');
  const app1 = await createApplication(userId, {
    jobTitle: DEMO_JD_TITLE,
    company: DEMO_JD_COMPANY,
    jdText: DEMO_JD_TEXT,
    jdParsed: DEMO_JD_PARSED,
    sourceBoard: 'other'
  });
  ok(`application 1 — ${DEMO_JD_TITLE} @ ${DEMO_JD_COMPANY}`);

  const app2 = await createApplication(userId, {
    jobTitle: DEMO_JD2_TITLE,
    company: DEMO_JD2_COMPANY,
    jdText: DEMO_JD2_TEXT,
    jdParsed: DEMO_JD2_PARSED,
    sourceBoard: 'other'
  });
  ok(`application 2 — ${DEMO_JD2_TITLE} @ ${DEMO_JD2_COMPANY} (names no skills)`);

  log('');
  step('Creating the tailored variant');
  const variant = await createVariant(userId, master.id, {
    jobContext: DEMO_JOB_CONTEXT
  });
  if (!variant) throw new Error('Variant creation returned null');
  await renameResume(variant.id, userId, VARIANT_NAME);
  ok(`variant "${VARIANT_NAME}"`);

  log('');
  step('Scoring the variant (hybrid engine — one live model call)');
  const loaded = await getResume(variant.id, userId);
  if (!loaded) throw new Error('Variant vanished between creation and scoring');
  if (!loaded.data.jobContext) {
    throw new Error('Variant has no jobContext — the score would be meaningless.');
  }

  const breakdown = await scoreResumeHybridFromEnvelope(
    loaded.data,
    loaded.data.jobContext
  );
  const tips = buildDynamicTips(breakdown, loaded.data, loaded.data.jobContext);
  const matchBreakdown = maybeAppendSkillGapEntry(
    buildMatchBreakdown(breakdown),
    breakdown
  );

  // The link row and the snapshot carry the SAME number, so the list badge
  // and the scorecard cannot disagree — the bug this repo already fixed
  // once.
  await createResumeVariant(
    app1.id,
    variant.id,
    breakdown.overallScore,
    matchBreakdown,
    'Seeded by scripts/seed-demo.ts — synthetic demo account.'
  );
  await recordScoreSnapshot(variant.id, userId, {
    matchScore: breakdown.overallScore,
    matchBreakdown,
    dynamicTips: tips,
    breakdown,
    computedInMs: breakdown.computedInMs
  });
  ok(`score snapshot written — overall ${breakdown.overallScore}`);

  log('');
  step('Running the first-session analysis (so Scout opens informed)');
  const analysis = await runFirstSessionAnalysis(loaded.data, DEMO_JD_TEXT);
  if (analysis.ok) {
    await recordResumeAnalysis(
      variant.id,
      userId,
      hashJobDescription(DEMO_JD_TEXT),
      analysis.data
    );
    ok(`analysis recorded — "${analysis.data.headline}"`);
  } else {
    warn(`analysis unavailable (${analysis.code}): ${analysis.error}`);
    warn('Scout will still work, it will just ask a question first.');
  }

  await verifyHighlightBeats(loaded.data);
  await printSummary(userId);
}

/**
 * Verify the two "Highlight this job's skills" beats the video depends on.
 *
 * Beat 3: posting 1 must classify a workable set of genuine skills and at
 * least one eligibility gate, so the button has something to mark.
 *
 * Beat 6: posting 2 must classify ZERO genuine skills, so the button
 * refuses with the honest "this posting doesn't name skills your resume
 * lists" message. If it finds skills, the refusal beat cannot be filmed as
 * written and the founder needs to know NOW, not on shoot day.
 */
async function verifyHighlightBeats(
  resume: Awaited<ReturnType<typeof getResume>> extends null
    ? never
    : NonNullable<Awaited<ReturnType<typeof getResume>>>['data']
): Promise<void> {
  log('');
  step('Verifying the two highlight beats');

  const primary = await evaluateJevRequirements(resume, DEMO_JOB_CONTEXT);
  if (primary.ok) {
    ok(
      `posting 1 — ${primary.requirements.length} genuine skill(s), ` +
        `${primary.gates.length} eligibility gate(s)`
    );
    for (const r of primary.requirements) {
      log(`${DIM}      · ${r.text}  (evidence ${r.evidence.toFixed(2)})${RESET}`);
    }
    for (const g of primary.gates) {
      log(`${DIM}      · [gate] ${g}${RESET}`);
    }
  } else {
    warn('posting 1 evaluation failed — the highlight beat is UNVERIFIED.');
  }

  const refusal = await evaluateJevRequirements(resume, DEMO_JOB_CONTEXT_2);
  if (refusal.ok) {
    if (refusal.requirements.length === 0) {
      ok(
        'posting 2 — 0 genuine skills, so the highlight refuses (the refusal beat works)'
      );
    } else {
      warn(
        `posting 2 — ${refusal.requirements.length} genuine skill(s) found. ` +
          'The refusal beat will NOT fire as written.'
      );
      for (const r of refusal.requirements) {
        log(`${DIM}      · ${r.text}${RESET}`);
      }
    }
  } else {
    warn('posting 2 evaluation failed — the refusal beat is UNVERIFIED.');
  }
}

async function printSummary(userId: string): Promise<void> {
  const { resumes } = await import('@/lib/db/schema');
  const { getLatestScoreSnapshot } = await import('@/lib/db/queries');

  const rows = await db
    .select({ id: resumes.id, name: resumes.name, isMaster: resumes.isMaster })
    .from(resumes)
    .where(eq(resumes.userId, userId));

  log('');
  log(`${BOLD}Demo account ready${RESET}`);
  log(`  sign in   ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  // Prove the credential actually authenticates. A demo you cannot sign
  // into is not a demo, and a subtly wrong hash format fails at the login
  // form rather than here.
  const credential = await db
    .select({ password: account.password })
    .from(account)
    .where(eq(account.userId, userId))
    .limit(1);
  const storedHash = credential[0]?.password;
  if (storedHash) {
    const valid = await verifyPassword({
      hash: storedHash,
      password: DEMO_PASSWORD
    });
    if (valid) ok('credential verified — the password signs in');
    else fail('credential INVALID — the stored hash does not match the password');
  } else {
    fail('no credential account found for this user');
  }

  for (const row of rows) {
    const snapshot = await getLatestScoreSnapshot(row.id);
    log(
      `  ${row.isMaster ? 'master  ' : 'variant '} ${row.name}` +
        (snapshot ? `  →  ${snapshot.matchScore}` : '')
    );
  }

  // The dimension breakdown, because the voiceover script needs the SAME
  // numbers the scorecard shows. A script that says "the ATS match is 42"
  // while the card says 61 is the list-badge bug in a video.
  for (const row of rows) {
    if (row.isMaster) continue;
    const snapshot = await getLatestScoreSnapshot(row.id);
    const breakdown = snapshot?.breakdown as
      | { dimensionScores?: Record<string, number> }
      | undefined;
    const scores = breakdown?.dimensionScores;
    if (!scores) continue;
    log('');
    log(`${BOLD}Score dimensions for "${row.name}"${RESET}`);
    for (const [label, key] of [
      ['Keywords', 'atsMatching'],
      ['Format', 'structure'],
      ['Impact', 'contentQuality'],
      ['Experience match', 'alignment'],
      ['Intent coverage', 'intentCoverage'],
      ['Role fit', 'roleFit'],
      ['Seniority fit', 'seniorityFit']
    ] as const) {
      const value = scores[key];
      if (typeof value === 'number') {
        log(`  ${label.padEnd(18)} ${value}`);
      }
    }
  }

  log('');
  log(`${DIM}The score above is the real number the scorecard will render.`);
  log(`Use it in the voiceover script — do not write a different one.${RESET}`);
}

// ─── Entry ──────────────────────────────────────────────────────────────────

seed()
  .then(async () => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    fail(message);
    if (error instanceof Error && error.stack) {
      console.error(DIM + error.stack + RESET);
    }
    process.exit(1);
  });
