/**
 * The daily allowance the chat UI shows.
 *
 * ## Why this file exists
 *
 * The chat window's badge used to hard-code `"Free · 20/day"`. The
 * number comes from `PLANS[plan].chatMessagesPerDay`, so the badge was a
 * second, independent copy of a fact that already had a source of truth.
 *
 * The 2026-11-24 change altered what that number MEANS. It is no longer
 * a gate: Free turns 1–20 use the Pro chain, and turn 21+ keeps chatting
 * on the $0 chain under the 600K token cap. Sending `20` as the enforced
 * `X-Chat-Limit` would make the client disable the composer at turn 20,
 * so the badge is now explicitly an allowance of *Pro-model messages*,
 * and the enforced turn limit is `unlimited` for every plan.
 *
 * These tests make sure the UI says what actually happens.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PLANS } from '@/lib/db/schema';

const WINDOW = readFileSync(
  resolve(process.cwd(), 'components/chat/chat-window.tsx'),
  'utf8'
);
const BUBBLE = readFileSync(
  resolve(process.cwd(), 'components/chat/chat-bubble.tsx'),
  'utf8'
);
const ROUTE = readFileSync(resolve(process.cwd(), 'app/api/chat/route.ts'), 'utf8');

describe('the daily allowance shown in the chat', () => {
  it('is not hard-coded in the chat window', () => {
    // A literal "20" in this file is the bug. The number must come from
    // the server (the `dailyLimit` prop, which the page fills from
    // `PLANS`).
    expect(WINDOW).not.toMatch(/20\s*\/\s*day/);
    expect(WINDOW).not.toMatch(/Free\s*·\s*20/);
  });

  it('names it as an allowance of Pro-model messages, not a stop', () => {
    expect(WINDOW).toContain('${dailyLimit} Pro/day');
    expect(WINDOW).toContain('${dailyLimit} Pro messages/day, then free models');
    expect(WINDOW).not.toContain('messages remaining today');
  });

  it('is threaded from the page through the bubble to the window', () => {
    // The page reads `PLANS`, so a change to the displayed allowance
    // shows up in the badge without anyone touching the chat UI.
    expect(BUBBLE).toContain('dailyLimit');
    expect(WINDOW).toContain('dailyLimit');
  });

  it('is informational — no plan has a turn gate any more', () => {
    expect(PLANS.free.chatMessagesPerDay).toBe(20);
    expect(Number.isFinite(PLANS.pro.chatMessagesPerDay)).toBe(false);
    expect(ROUTE).toContain(
      'tryConsumeChatTurn(userId, Number.POSITIVE_INFINITY, tokenLimit)'
    );
    expect(ROUTE).toContain("turnLimit: 'unlimited'");
  });

  it('matches the enforced Free token cap', () => {
    // The token cap is the only quota that can reject a Free turn. It
    // clears the measured ~416K cost of 20 Pro-chain turns plus
    // headroom for the $0 chain.
    expect(PLANS.free.chatTokensPerDay).toBe(600_000);
    expect(Number.isFinite(PLANS.free.chatTokensPerDay)).toBe(true);
  });
});
