import { describe, expect, it } from 'vitest';

import { decideChatQuotaRejection } from '@/lib/billing/chat-quota';
import { PLANS } from '@/lib/db/schema';
import type { ChatUsage } from '@/lib/db/schema';

/**
 * Pins the daily chat quota behaviour added 2026-10-21.
 *
 * The bug these guard against: `tryConsumeChatTurn` returns `null` for
 * BOTH "out of turns" and "out of tokens", and the single surface that
 * shows quota to the user (`ChatInput`'s "N / M messages remaining")
 * is a TURN counter — so it is `null` on an unlimited-turn Pro plan.
 * Before this split, a Pro user who exhausted the daily token cap got
 * `code: 'RATE_LIMITED', limit: null`, i.e. "Daily limit reached" with
 * nothing on screen and no explanation.
 */

function usage(tokensUsed: number): ChatUsage {
  return {
    userId: 'user_1',
    date: '2026-10-21',
    tokensUsed,
    turnsUsed: 5
  };
}

describe('decideChatQuotaRejection', () => {
  it('reports the token cap when tokens are exhausted', () => {
    const d = decideChatQuotaRejection({
      usage: usage(PLANS.pro.chatTokensPerDay),
      tokenLimit: PLANS.pro.chatTokensPerDay,
      turnLimit: PLANS.pro.chatMessagesPerDay
    });
    expect(d.reason).toBe('token_limit');
    expect(d.body).toMatchObject({
      code: 'TOKEN_LIMIT_REACHED',
      tokensUsed: PLANS.pro.chatTokensPerDay,
      tokenLimit: PLANS.pro.chatTokensPerDay
    });
  });

  it('does not tell a Free user they used their "Pro" allowance', () => {
    // The copy used to say "You've used today's Pro AI allowance" to
    // everyone. A Free user who hits the token cap was told they had
    // used a Pro allowance they do not have — which reads as a bug in
    // the product rather than as their own limit.
    //
    // A finite turn limit IS the Free plan (only Free has a finite
    // `chatMessagesPerDay`), so it doubles as the plan signal.
    const free = decideChatQuotaRejection({
      usage: usage(PLANS.free.chatTokensPerDay),
      tokenLimit: PLANS.free.chatTokensPerDay,
      turnLimit: PLANS.free.chatMessagesPerDay
    });
    expect(free.body.error).toContain('free AI allowance');
    expect(free.body.error).not.toContain('Pro AI allowance');

    const pro = decideChatQuotaRejection({
      usage: usage(PLANS.pro.chatTokensPerDay),
      tokenLimit: PLANS.pro.chatTokensPerDay,
      turnLimit: PLANS.pro.chatMessagesPerDay
    });
    expect(pro.body.error).toContain('Pro AI allowance');
  });

  it('reports the turn limit when turns are exhausted but tokens are not', () => {    const d = decideChatQuotaRejection({
      usage: usage(10), // far under the Pro token cap
      tokenLimit: PLANS.pro.chatTokensPerDay,
      turnLimit: PLANS.pro.chatMessagesPerDay
    });
    expect(d.reason).toBe('turn_limit');
    expect(d.body).toMatchObject({ code: 'RATE_LIMITED', limit: null });
  });

  it('prefers the token message when a plan is over BOTH limits', () => {
    // On a Pro plan the turn limit is Infinity, so reporting the turn
    // limit here would be actively wrong ("Daily limit reached" when
    // turns are unlimited).
    const d = decideChatQuotaRejection({
      usage: usage(PLANS.pro.chatTokensPerDay),
      tokenLimit: PLANS.pro.chatTokensPerDay,
      turnLimit: Infinity
    });
    expect(d.reason).toBe('token_limit');
  });

  it('falls back to the turn limit when there is no usage row at all', () => {
    // The gate rejected, so a row should exist — but a missing row must
    // not crash the route or invent a token-limit message.
    const d = decideChatQuotaRejection({
      usage: null,
      tokenLimit: PLANS.pro.chatTokensPerDay,
      turnLimit: 20
    });
    expect(d.reason).toBe('turn_limit');
    expect(d.body).toMatchObject({ code: 'RATE_LIMITED', limit: 20 });
  });

  it('surfaces a finite Free turn limit and never Infinity', () => {
    const d = decideChatQuotaRejection({
      usage: usage(0),
      tokenLimit: PLANS.free.chatTokensPerDay,
      turnLimit: PLANS.free.chatMessagesPerDay
    });
    // Narrow explicitly rather than via `d.body.code` — TS does not
    // propagate a discriminant on the parent through a nested property.
    if (d.reason !== 'turn_limit') throw new Error(`expected turn_limit, got ${d.reason}`);
    expect(d.body).toMatchObject({ limit: PLANS.free.chatMessagesPerDay });
    expect(d.body.limit).not.toBe(Infinity);
  });

  it('always returns a UTC ISO date as resetsAt', () => {
    const d = decideChatQuotaRejection({
      usage: usage(0),
      tokenLimit: PLANS.free.chatTokensPerDay,
      turnLimit: 20
    });
    expect(d.body.resetsAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('PLANS quota shape', () => {
  it('Pro is unlimited on turns but NOT on tokens', () => {
    // The whole point of the 2026-10-21 change: an unbounded turn count
    // with no spend ceiling is an unbounded bill. Reverting Pro to
    // `Infinity` tokens without replacing this with another ceiling
    // would silently delete the margin floor.
    expect(PLANS.pro.chatMessagesPerDay).toBe(Infinity);
    expect(Number.isFinite(PLANS.pro.chatTokensPerDay)).toBe(true);
  });

  it('Free has a finite token cap as a safety net', () => {
    expect(Number.isFinite(PLANS.free.chatTokensPerDay)).toBe(true);
  });

  it('Free token cap does not bite before the turn limit for normal use', () => {
    // The assumption here used to be "~10K tokens per turn", which was
    // never measured. It is now: a chat turn on the FREE chain costs
    // ~13K tokens (median of 6 turns measured against the real agent
    // loop on 2026-11-01 — `reflection/beam-free`, the free chain's
    // primary, serves ~11–13K of the prompt from cache).
    //
    // 20 turns × 13K ≈ 260K, under the 300K cap, so the TURN limit is
    // what an ordinary Free user hits — which is what the "20/day"
    // badge says. The token cap stays a safety net for one
    // pathological giant message.
    const MEASURED_TOKENS_PER_TURN = 13_000;
    expect(PLANS.free.chatTokensPerDay).toBeGreaterThan(
      PLANS.free.chatMessagesPerDay * MEASURED_TOKENS_PER_TURN
    );
  });

  it('the PRO chain would bite the Free token cap — which is why Free gets its own chain', () => {
    // The same measurement on the Pro chain's primary
    // (`anthropic/claude-haiku-5.5`) is ~20.8K tokens per turn, and
    // that endpoint served 0 cached tokens in the same run.
    //
    // 20 turns × 20.8K ≈ 416K — OVER the Free 300K cap. A Free user
    // on the Pro chain would therefore have been rejected at ~14
    // messages a day, while the UI badge said "Free · 20/day" and the
    // composer said "N / 20 messages remaining today". This is why the
    // free tier is routed to its own $0 chain, and it is why the free
    // chain's measured cost is the number the cap has to clear.
    const PRO_CHAIN_TOKENS_PER_TURN = 20_833;
    expect(PLANS.free.chatTokensPerDay).toBeLessThan(
      PLANS.free.chatMessagesPerDay * PRO_CHAIN_TOKENS_PER_TURN
    );
  });

  it('Pro token cap keeps worst-case AI spend under half a $5 subscription', () => {
    // Priced at the live-verified $0.10 in / $0.50 out per 1M
    // (anthropic/claude-haiku-5.5, 2026-10-21), assuming a 90/10
    // input/output split. A regression that raises this number without
    // re-running the margin math is the thing this catches.
    const TOKENS_PER_1M_IN = 0.1;
    const TOKENS_PER_1M_OUT = 0.5;
    const INPUT_SHARE = 0.9;
    const DAILY_UNITS = PLANS.pro.chatTokensPerDay / 1_000_000;
    const monthlyCost =
      30 *
      (DAILY_UNITS * INPUT_SHARE * TOKENS_PER_1M_IN +
        DAILY_UNITS * (1 - INPUT_SHARE) * TOKENS_PER_1M_OUT);
    expect(monthlyCost).toBeLessThan(2.5); // < 50% of a $5 subscription
  });
});