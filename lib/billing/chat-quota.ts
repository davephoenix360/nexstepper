import type { ChatUsage } from '@/lib/db/schema';

/**
 * Which daily quota rejected this chat turn, and what the 429 says.
 *
 * ## Why this is a pure function instead of inline route logic
 *
 * `tryConsumeChatTurn` returns `null` for BOTH "out of turns" and
 * "out of tokens". Those are genuinely different events for the user:
 * a Free user who hit 20 messages/day should be told to upgrade; a Pro
 * user who spent their daily token allowance should be told it resets
 * at midnight, not told they ran out of messages when Pro is
 * unlimited. Collapsing them into one message is how a Pro user ends
 * up staring at `limit: null` and "Daily limit reached" with no way to
 * tell whether it's a bug.
 *
 * Keeping the decision pure means it is unit-testable without standing
 * up the whole chat route (auth + resume load + AI SDK), and it gives
 * the rule one place to be read.
 *
 * ## What this does NOT do
 *
 * It does not estimate the cost of the next turn, and it does not
 * attempt to be exact. The token gate is deliberately a SOFT cap —
 * `tokens_used` is only written after a stream drains, so the gate
 * reads the previous turn's total and a user can overshoot by roughly
 * one turn. That bounds worst-case spend without holding a row lock
 * open across a multi-second model call.
 */

export type ChatQuotaDecision =
  | {
      reason: 'token_limit';
      body: {
        error: string;
        code: 'TOKEN_LIMIT_REACHED';
        tokensUsed: number;
        tokenLimit: number;
        resetsAt: string;
      };
    }
  | {
      reason: 'turn_limit';
      body: {
        error: string;
        code: 'RATE_LIMITED';
        limit: number | null;
        resetsAt: string;
      };
    };

/** `chat_usage.date` is a UTC ISO date, and that is the reset boundary. */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function decideChatQuotaRejection(input: {
  /** Row returned by the follow-up read, or `null` if there is none. */
  usage: ChatUsage | null;
  /** The plan's `chatTokensPerDay`. */
  tokenLimit: number;
  /** The plan's `chatMessagesPerDay`. `Infinity` for Pro. */
  turnLimit: number;
}): ChatQuotaDecision {
  const resetsAt = utcToday();
  const { usage, tokenLimit, turnLimit } = input;

  // Token cap wins the tie-break. If a plan is out of BOTH, telling the
  // user about tokens is the more useful message: the turn limit may be
  // unlimited (so "daily limit reached" would be actively misleading),
  // and the token cap is the one that will still be blocking them after
  // they wait for the turn counter to reset.
  const overTokens =
    usage !== null && Number.isFinite(tokenLimit) && usage.tokensUsed >= tokenLimit;

  if (overTokens && usage) {
    return {
      reason: 'token_limit',
      body: {
        error: "You've used today's Pro AI allowance",
        code: 'TOKEN_LIMIT_REACHED',
        tokensUsed: usage.tokensUsed,
        tokenLimit,
        resetsAt
      }
    };
  }

  return {
    reason: 'turn_limit',
    body: {
      error: 'Daily limit reached',
      code: 'RATE_LIMITED',
      // `null` for unlimited plans. We surface null rather than Infinity
      // so the client's type stays honest.
      limit: Number.isFinite(turnLimit) ? turnLimit : null,
      resetsAt
    }
  };
}