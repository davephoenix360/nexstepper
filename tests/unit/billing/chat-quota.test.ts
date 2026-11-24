import { describe, expect, it } from 'vitest';

import { decideChatQuotaRejection } from '@/lib/billing/chat-quota';
import { PLANS } from '@/lib/db/schema';
import type { ChatUsage } from '@/lib/db/schema';

/**
 * Pins the daily chat quota behaviour.
 *
 * The bug these guard against: `tryConsumeChatTurn` returns `null` when
 * the token `ON CONFLICT ... WHERE` predicate fails, and the only quota
 * surface in the UI is a TURN readout — which no plan has any more
 * (Free's turns 21+ route to the $0 chain). Before the 2026-10-21 split,
 * a Pro user who exhausted the daily token cap got
 * `code: 'RATE_LIMITED', limit: null`, i.e. "Daily limit reached" with
 * nothing on screen and no explanation.
 *
 * Since 2026-11-24 the plan is passed EXPLICITLY: it used to be inferred
 * from a finite `chatMessagesPerDay`, which stopped working the moment
 * Free stopped having a turn gate.
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
      turnLimit: PLANS.pro.chatMessagesPerDay,
      plan: 'pro'
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
    // the product rather than as their own limit. The plan is now an
    // explicit argument, not an inference from the turn limit.
    const free = decideChatQuotaRejection({
      usage: usage(PLANS.free.chatTokensPerDay),
      tokenLimit: PLANS.free.chatTokensPerDay,
      turnLimit: PLANS.free.chatMessagesPerDay,
      plan: 'free'
    });
    expect(free.body.error).toContain('free AI allowance');
    expect(free.body.error).not.toContain('Pro AI allowance');

    const pro = decideChatQuotaRejection({
      usage: usage(PLANS.pro.chatTokensPerDay),
      tokenLimit: PLANS.pro.chatTokensPerDay,
      turnLimit: PLANS.pro.chatMessagesPerDay,
      plan: 'pro'
    });
    expect(pro.body.error).toContain('Pro AI allowance');
  });

  it('uses the explicit plan, even when the turn limit is finite', () => {
    // Regression guard: the OLD implementation inferred Free from
    // `Number.isFinite(turnLimit)`. A Pro caller passing a finite limit
    // must still get Pro wording.
    const d = decideChatQuotaRejection({
      usage: usage(PLANS.pro.chatTokensPerDay),
      tokenLimit: PLANS.pro.chatTokensPerDay,
      turnLimit: 20,
      plan: 'pro'
    });
    expect(d.body.error).toContain('Pro AI allowance');
    expect(d.body.error).not.toContain('free AI allowance');
  });

  it('reports the turn limit when turns are exhausted but tokens are not', () => {
    // This branch is unreachable from the route today (no plan has a
    // turn gate), but the decision helper still owns the fallback.
    const d = decideChatQuotaRejection({
      usage: usage(10), // far under the Pro token cap
      tokenLimit: PLANS.pro.chatTokensPerDay,
      turnLimit: PLANS.pro.chatMessagesPerDay,
      plan: 'pro'
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
      turnLimit: Infinity,
      plan: 'pro'
    });
    expect(d.reason).toBe('token_limit');
  });

  it('falls back to the turn limit when there is no usage row at all', () => {
    // The gate rejected, so a row should exist — but a missing row must
    // not crash the route or invent a token-limit message.
    const d = decideChatQuotaRejection({
      usage: null,
      tokenLimit: PLANS.pro.chatTokensPerDay,
      turnLimit: 20,
      plan: 'pro'
    });
    expect(d.reason).toBe('turn_limit');
    expect(d.body).toMatchObject({ code: 'RATE_LIMITED', limit: 20 });
  });

  it('surfaces a finite turn limit and never Infinity', () => {
    // The displayed allowance passed by the route. It is informational —
    // turn 21 is still a valid turn, just on the $0 chain.
    const d = decideChatQuotaRejection({
      usage: usage(0),
      tokenLimit: PLANS.free.chatTokensPerDay,
      turnLimit: PLANS.free.chatMessagesPerDay,
      plan: 'free'
    });
    if (d.reason !== 'turn_limit') throw new Error(`expected turn_limit, got ${d.reason}`);
    expect(d.body).toMatchObject({ limit: PLANS.free.chatMessagesPerDay });
    expect(d.body.limit).not.toBe(Infinity);
  });

  it('always returns a UTC ISO date as resetsAt', () => {
    const d = decideChatQuotaRejection({
      usage: usage(0),
      tokenLimit: PLANS.free.chatTokensPerDay,
      turnLimit: 20,
      plan: 'free'
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

  it('Free has a finite token cap as the only enforced quota', () => {
    expect(Number.isFinite(PLANS.free.chatTokensPerDay)).toBe(true);
    // No turn gate: the route passes Infinity to `tryConsumeChatTurn`.
    expect(PLANS.free.chatMessagesPerDay).toBe(20);
  });

  it('Free token cap clears the 20 Pro-chain turns plus fallback headroom', () => {
    // Measured 2026-11-01: ~20.8K tokens/turn on the Pro chain's primary
    // (0 cached), ~13K on the $0 chain (`reflection/beam-free` serves
    // 11–13K from cache). Free's first 20 turns now use the Pro chain,
    // so a 300K cap would have rejected them around turn 14. The cap is
    // 600K: ~416K for the allowance plus ~184K for a dozen $0 turns.
    const PRO_CHAIN_TOKENS_PER_TURN = 20_833;
    const FALLBACK_CHAIN_TOKENS_PER_TURN = 13_000;
    expect(PLANS.free.chatTokensPerDay).toBeGreaterThan(
      PLANS.free.chatMessagesPerDay * PRO_CHAIN_TOKENS_PER_TURN
    );
    expect(PLANS.free.chatTokensPerDay).toBeGreaterThan(
      PLANS.free.chatMessagesPerDay * PRO_CHAIN_TOKENS_PER_TURN +
        FALLBACK_CHAIN_TOKENS_PER_TURN
    );
    expect(PLANS.free.chatTokensPerDay).toBe(600_000);
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
