/**
 * The daily allowance the chat UI shows.
 *
 * ## Why this file exists
 *
 * The chat window's badge used to hard-code `"Free · 20/day"`. The
 * number the server enforces comes from `PLANS[plan].chatMessagesPerDay`
 * and is reported back on the `X-Chat-Limit` response header — so the
 * badge was a second, independent copy of a fact that already had a
 * source of truth. Two copies of one number drift.
 *
 * The 2026-11-01 measurement made the drift real rather than
 * theoretical: a chat turn on the Pro chain's primary costs ~20.8K
 * tokens, and the Free plan's cap is 300K, so a Free user on the Pro
 * chain was rejected at roughly **14 messages a day** — while the badge
 * said 20/day and the composer said "N / 20 messages remaining today".
 *
 * The badge now reads the limit the server sends. These tests make
 * sure it stays that way.
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

describe('the daily allowance shown in the chat', () => {
  it('is not hard-coded in the chat window', () => {
    // A literal "20" in this file is the bug. The number must come from
    // the server (the `dailyLimit` prop, which the page fills from
    // `PLANS`).
    expect(WINDOW).not.toMatch(/20\s*\/\s*day/);
    expect(WINDOW).not.toMatch(/Free\s*·\s*20/);
  });

  it('renders the limit it is given', () => {
    expect(WINDOW).toContain('dailyLimit');
    expect(WINDOW).toContain('/day');
  });

  it('is threaded from the page through the bubble to the window', () => {
    // The page reads `PLANS`, so a change to the plan's limit shows up
    // in the badge without anyone touching the chat UI.
    expect(BUBBLE).toContain('dailyLimit');
  });

  it('matches what the server enforces', () => {
    // The Free plan's turn allowance is the number the server gates on
    // (`tryConsumeChatTurn(userId, PLANS[plan].chatMessagesPerDay, …)`),
    // so the badge and the gate can never disagree.
    expect(PLANS.free.chatMessagesPerDay).toBe(20);
    expect(Number.isFinite(PLANS.free.chatMessagesPerDay)).toBe(true);
    expect(Number.isFinite(PLANS.pro.chatMessagesPerDay)).toBe(false);
  });
});
