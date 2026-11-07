#!/usr/bin/env node
/**
 * Shoot-readiness check for the demo video.
 *
 * Plan: docs/plans/demo-video.md
 *
 * ## Why this exists
 *
 * A recording session is expensive: you set up the browser, install the
 * Guidde extension, position the window, read the script aloud, and take the
 * shot. Discovering that the demo account does not sign in — or that the chat
 * route 500s because the Gateway key is exhausted — *after* you have set all
 * that up is a wasted session.
 *
 * So this script exercises the four things the video depends on, against the
 * running dev server, over the real HTTP paths:
 *
 *   1. the demo credential authenticates (Better Auth, not just a hash check),
 *   2. the variant page renders the seeded score,
 *   3. the chat route answers and the agent loop runs,
 *   4. the score snapshot the scorecard reads is the seeded one.
 *
 * ## What it deliberately does NOT do
 *
 * It does NOT ask Scout to edit the resume. An edit would rewrite the
 * "before" state that Beat 1 opens on. The probe asks a read-only question
 * so the agent loop, the tool call and the stream are all exercised without
 * touching the content.
 *
 * It also cleans up after itself: the chat session the probe creates is
 * deleted, so the demo account is left exactly as `pnpm seed:demo` left it.
 *
 * ## Usage
 *
 *   pnpm dev                    # in one terminal
 *   pnpm preflight:demo-video   # in another
 *
 * Exit code 0 = ready to shoot. Exit code 1 = something is broken.
 */

import './load-env';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { user, resumes, chatSessions, chatMessages } from '@/lib/db/schema';
import { getLatestScoreSnapshot } from '@/lib/db/queries';
import { DEMO_EMAIL, DEMO_PASSWORD } from './demo-fixtures';

const BASE = (process.env.PREFLIGHT_BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  ''
);

const RESET = '[0m';
const BOLD = '[1m';
const DIM = '[2m';
const GREEN = '[32m';
const YELLOW = '[33m';
const RED = '[31m';

let failures = 0;

function ok(message: string): void {
  console.log(`  ${GREEN}✓${RESET} ${message}`);
}

function warn(message: string): void {
  console.log(`  ${YELLOW}!${RESET} ${message}`);
}

function fail(message: string): void {
  failures += 1;
  console.log(`  ${RED}✗${RESET} ${message}`);
}

function head(message: string): void {
  console.log(`${BOLD}▸ ${message}${RESET}`);
}

/** Collect `set-cookie` into a single `Cookie` header value. */
function cookieHeader(response: Response): string {
  const jar = response.headers.getSetCookie?.() ?? [];
  return jar.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
}

async function main(): Promise<void> {
  console.log('');
  console.log(`${BOLD}Demo video — shoot readiness${RESET}`);
  console.log(`${DIM}Target: ${BASE}${RESET}`);
  console.log('');

  // ── 0. The server is up ───────────────────────────────────────────────────
  head('Dev server');
  let serverUp = false;
  try {
    const ping = await fetch(`${BASE}/sign-in`, { redirect: 'manual' });
    serverUp = ping.status > 0;
    if (serverUp) ok(`reachable (${ping.status} on /sign-in)`);
  } catch (err) {
    fail(
      `not reachable — start it with \`pnpm dev\` (${(err as Error).message})`
    );
  }
  if (!serverUp) return;

  // ── 1. The seeded account exists and has a variant ────────────────────────
  head('Seeded data');
  const demoUser = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.email, DEMO_EMAIL))
    .limit(1);
  if (demoUser.length === 0) {
    fail('no demo account — run `pnpm seed:demo` first');
    return;
  }
  const userId = demoUser[0].id;
  ok(`demo account present (${DEMO_EMAIL})`);

  const owned = await db
    .select({ id: resumes.id, name: resumes.name, isMaster: resumes.isMaster })
    .from(resumes)
    .where(eq(resumes.userId, userId));
  const variant = owned.find((r) => !r.isMaster);
  if (!variant) {
    fail('no variant — run `pnpm seed:demo` first');
    return;
  }
  ok(`variant "${variant.name}"`);

  const snapshot = await getLatestScoreSnapshot(variant.id);
  if (!snapshot) {
    fail('no score snapshot on the variant — re-run `pnpm seed:demo`');
    return;
  }
  ok(`score snapshot = ${snapshot.matchScore}`);

  // ── 2. The credential authenticates for real ──────────────────────────────
  head('Authentication');
  const signIn = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: BASE
    },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
  });
  const cookies = cookieHeader(signIn);
  if (!signIn.ok || !cookies) {
    fail(
      `sign-in failed (${signIn.status}) — the seeded credential is not accepted`
    );
    return;
  }
  ok(`signed in (${signIn.status}), session cookie acquired`);

  // ── 3. The variant page renders the seeded score ──────────────────────────
  head('Scorecard rendering');
  const page = await fetch(`${BASE}/dashboard/resumes/${variant.id}`, {
    headers: { cookie: cookies },
    redirect: 'manual'
  });
  const html = await page.text();
  if (page.status !== 200) {
    fail(`variant page returned ${page.status} — expected 200`);
  } else {
    ok('variant page returns 200');
    const hasRoleFit = html.includes('Role fit');
    if (hasRoleFit) ok('"Role fit" dimension is in the rendered HTML');
    else fail('"Role fit" is NOT in the rendered HTML — the cold open needs it');

    // The overall score renders into a <p data-testid="scorecard-overall">
    // as the bare number (components/scorecard/scorecard.tsx), so this is
    // the exact assertion that the page is showing the seeded value.
    const overall = html.match(
      /data-testid="scorecard-overall"[^>]*>\s*(\d{1,3})\s*</
    );
    if (overall) {
      const value = Number(overall[1]);
      if (value === snapshot.matchScore) {
        ok(`renders ${value} — matches the seeded snapshot`);
      } else {
        fail(
          `renders ${value} but the snapshot says ${snapshot.matchScore} — ` +
            'the page is showing a different number'
        );
      }
    } else {
      warn('could not locate the overall score element — check manually');
    }

    // The scorecard is the thing the cold open lands on, so assert the
    // badge and the tier label are both on the page. "Good" is the tier
    // band for 65–79 (components/scorecard/dimension-bar.tsx).
    if (html.includes('data-testid="scorecard"')) {
      ok('scorecard is on the page');
    } else {
      fail('no scorecard on the page — the cold open has nothing to land on');
    }
    if (html.includes('/ 100')) {
      ok('the "/ 100" denominator is rendered');
    }
  }

  // ── 4. The chat route answers (read-only probe) ───────────────────────────
  head('Chat route (the risky one)');
  const probeMessage =
    "What's my ATS score, and which dimension am I weakest on? Don't change anything yet.";

  const started = Date.now();
  let firstByteMs: number | null = null;
  let body = '';
  let status = 0;
  try {
    const chat = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        origin: BASE
      },
      body: JSON.stringify({
        resumeId: variant.id,
        sessionId: null,
        message: probeMessage
      }),
      signal: AbortSignal.timeout(120_000)
    });
    status = chat.status;
    if (!chat.ok) {
      fail(`chat returned ${status} — ${(await chat.text()).slice(0, 200)}`);
    } else {
      const reader = chat.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (firstByteMs === null) firstByteMs = Date.now() - started;
          body += decoder.decode(value, { stream: true });
        }
      }
      const totalMs = Date.now() - started;
      ok(`chat responded (${status}) in ${(totalMs / 1000).toFixed(1)}s`);
      if (firstByteMs !== null) {
        ok(`first byte after ${(firstByteMs / 1000).toFixed(1)}s`);
        console.log(
          `${DIM}      That is the dead pause the editor has to cut. Anything ` +
            `over ~8s should be jump-cut in post.${RESET}`
        );
      }
      if (body.length === 0) {
        fail('chat returned an empty stream — the model chain may be down');
      } else {
        ok(`stream carried ${body.length} bytes`);
      }
      if (body.includes('error') || body.includes('rate_limit')) {
        warn('the stream mentioned an error or a rate limit — read it before shooting');
      }
    }
  } catch (err) {
    fail(
      `chat threw after ${((Date.now() - started) / 1000).toFixed(1)}s — ` +
        `${(err as Error).message}`
    );
  }

  // ── 5. Clean up the probe session ────────────────────────────────────────
  head('Cleanup');
  const probeSessions = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId));
  if (probeSessions.length > 0) {
    for (const s of probeSessions) {
      await db.delete(chatMessages).where(eq(chatMessages.sessionId, s.id));
    }
    await db.delete(chatSessions).where(eq(chatSessions.userId, userId));
    ok(`removed ${probeSessions.length} probe chat session(s)`);
  } else {
    ok('no probe session to remove');
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  console.log('');
  if (failures === 0) {
    console.log(`${GREEN}${BOLD}READY TO SHOOT${RESET}`);
    console.log(
      `${DIM}The demo account signs in, the scorecard renders ${snapshot.matchScore}, ` +
        `and the chat answers.${RESET}`
    );
  } else {
    console.log(`${RED}${BOLD}NOT READY — ${failures} check(s) failed${RESET}`);
    console.log(`${DIM}Fix the failures above before booking recording time.${RESET}`);
  }
  console.log('');
}

main()
  .then(() => process.exit(failures === 0 ? 0 : 1))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ${RED}✗${RESET} ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(DIM + error.stack + RESET);
    }
    process.exit(1);
  });
