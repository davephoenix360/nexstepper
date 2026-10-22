import 'server-only';

/**
 * Jev (TypeSafe's System One model) — a typed DECISION model.
 *
 * ## What this is
 *
 * Jev is not a chat model. You give it shared `state` and a map of typed
 * questions, and it returns typed answers with probabilities. It never
 * generates prose, which is exactly why it is useful here: the ATS
 * scoring engine asks questions like "is this JD line a genuine skill?"
 * and "how strongly does the resume demonstrate this requirement?" —
 * questions a chat model answers with narration.
 *
 * ## How we reach it
 *
 * Through the **Vercel AI Gateway's TypeSafe-compatible API**:
 *
 *     POST https://ai-gateway.vercel.sh/typesafe/v1/systemone
 *
 * Not the AI SDK's `experimental_decide`, which needs `ai` >= 7.0.128
 * (this project is on 6.0.224). The gateway path is one `fetch`, it uses
 * the `AI_GATEWAY_API_KEY` we already hold, and it speaks Jev's native
 * protocol — so it returns the `noul` probability, the choice's inline
 * `confidence`, and the score's `legend`, all of which the AI SDK path
 * reshapes or drops.
 *
 * See `docs/plans/ai-sdk-7-upgrade-assessment.md`.
 *
 * ## Cost
 *
 * $0.042 per million input tokens; output tokens are free. A full
 * requirement evaluation (JD + resume + ~40 questions) is roughly 3,000
 * input tokens — about **$0.00013**. The whole 50-JD validation sweep
 * (150 calls) cost $0.0058.
 *
 * ## Data handling
 *
 * The request is pinned to the `typesafe-ai` provider, which is the
 * gateway endpoint with **zero data retention**. Without the pin the
 * gateway could route to a different provider; the response's
 * `provider_metadata.gateway.routing.resolvedProvider` records which one
 * actually served it, and `assertZeroDataRetention` refuses a response
 * that came from anywhere else.
 *
 * The privacy policy names the same subprocessors as the model registry
 * (`lib/ai/providers.ts`) — changing one without the other leaves the
 * policy describing a chain we no longer call.
 */

/**
 * The model id.
 *
 * **Versioned on purpose.** `jev-latest` moves when TypeSafe ships, which
 * would silently change every score. The measurement harness pins the
 * same id so the corpus fixture stays comparable.
 */
export const JEV_MODEL = 'jev-1.14.0';

/** The gateway's TypeSafe-compatible endpoint. */
export const JEV_GATEWAY_URL =
  'https://ai-gateway.vercel.sh/typesafe/v1/systemone';

/**
 * The provider to pin. `typesafe-ai` is the gateway endpoint with zero
 * data retention; the other route (`digitalocean`) does not have it.
 */
export const JEV_PROVIDER = 'typesafe-ai';

/* ------------------------------------------------------------------ */
/* Question + answer shapes                                            */
/* ------------------------------------------------------------------ */

/** "Is this true?" — answered with a probability of yes. */
export interface JevNoulQuestion {
  type: 'noul';
  instructions: string;
}

/** "Which of these?" — answered with a choice and per-option probabilities. */
export interface JevChoiceQuestion {
  type: 'choice';
  instructions: string;
  /** The options, keyed by a stable slug. */
  criteria: Record<string, string>;
}

/** "Where on this rubric?" — answered with a probability-weighted position. */
export interface JevScoreQuestion {
  type: 'score';
  instructions: string;
  /** The rubric levels, in order. */
  criteria: string[];
}

export type JevQuestion =
  | JevNoulQuestion
  | JevChoiceQuestion
  | JevScoreQuestion;

export interface JevNoulAnswer {
  type: 'noul';
  /** Probability that the answer is yes, 0–1. */
  noul: number;
}

export interface JevChoiceAnswer {
  type: 'choice';
  choice: string;
  /** Confidence in the choice, 0–1. */
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface JevScoreAnswer {
  type: 'score';
  /**
   * The probability-WEIGHTED position on the rubric — NOT the argmax.
   *
   * With rubric `["not at all", "listed", "in a bullet", "with an
   * outcome"]` and probabilities `{0: 0.9, 1: 0.08, 2: 0.01, 3: 0.01}`
   * the score is `0.11`, not `0`. That softness is useful: a resume that
   * half-demonstrates a requirement lands between two levels instead of
   * being rounded to one.
   */
  score: number;
  confidence: number;
  /** The rubric levels, echoed back. */
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
}

export type JevAnswer =
  | JevNoulAnswer
  | JevChoiceAnswer
  | JevScoreAnswer;

export interface JevCallResult {
  /** The answers, keyed by question id. */
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
  /** The gateway's own cost report, in USD. */
  cost?: string;
  /** Which provider actually served the request. */
  resolvedProvider?: string;
  elapsedMs?: number;
}

/** Thrown when a Jev call fails. Carries the HTTP status when there was one. */
export class JevError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'JevError';
    this.status = status;
  }
}

function getApiKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) {
    throw new JevError(
      'AI_GATEWAY_API_KEY is not set — Jev cannot be called. (It is the same key the rest of the AI Gateway traffic uses.)'
    );
  }
  return key;
}

/**
 * Call Jev with a shared state and a set of typed questions.
 *
 * Every question sees the same `state` and every question is evaluated
 * in parallel, so latency barely moves with the number of questions —
 * one call answers everything we need about a JD and a resume.
 */
export async function jevDecide(input: {
  /** The shared context every question is answered against. */
  state: string;
  /** The questions, keyed by id. */
  questions: Record<string, JevQuestion>;
  model?: string;
  /** Hard cap on the call. The gateway is usually ~200ms. */
  timeoutMs?: number;
}): Promise<JevCallResult> {
  const apiKey = getApiKey();
  const model = input.model ?? JEV_MODEL;
  const timeoutMs = input.timeoutMs ?? 15_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(JEV_GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Pin the zero-data-retention provider. See the file header.
        'x-vercel-ai-gateway-order': `${JEV_PROVIDER}:${model}`
      },
      body: JSON.stringify({
        model,
        state: input.state,
        questions: input.questions
      }),
      signal: controller.signal
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new JevError(`Jev call timed out after ${timeoutMs}ms`);
    }
    throw new JevError(
      `Jev call failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();

  if (!response.ok) {
    throw new JevError(
      `Jev call failed (${response.status}): ${body.slice(0, 300)}`,
      response.status
    );
  }

  let parsed: JevRawResponse;
  try {
    parsed = JSON.parse(body) as JevRawResponse;
  } catch {
    throw new JevError(
      `Jev returned a non-JSON body: ${body.slice(0, 300)}`,
      response.status
    );
  }

  if (!parsed.answers || typeof parsed.answers !== 'object') {
    throw new JevError('Jev returned a response with no answers');
  }

  const resolvedProvider =
    parsed.provider_metadata?.gateway?.routing?.resolvedProvider;

  return {
    answers: parsed.answers,
    usage: parsed.usage,
    cost: parsed.provider_metadata?.gateway?.cost,
    resolvedProvider,
    elapsedMs: Date.now() - startedAt
  };
}

interface JevRawResponse {
  answers?: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
  provider_metadata?: {
    typesafe?: { confidence?: Record<string, number> };
    gateway?: {
      cost?: string;
      routing?: { resolvedProvider?: string };
    };
  };
}

/**
 * Refuse a response that was served by a provider without zero data
 * retention.
 *
 * The gateway would normally route this model to `typesafe-ai` anyway —
 * the response metadata records `fallbacksAvailable: []` — but a
 * privacy guarantee should be checked, not assumed.
 */
export function assertZeroDataRetention(result: JevCallResult): void {
  if (
    result.resolvedProvider &&
    result.resolvedProvider !== JEV_PROVIDER
  ) {
    throw new JevError(
      `Jev was served by "${result.resolvedProvider}", not the zero-data-retention provider "${JEV_PROVIDER}". Refusing to use the result.`
    );
  }
}

/**
 * Read a `noul` answer as a probability.
 *
 * Returns null when the answer is missing or the wrong type, so a
 * partial response degrades to "no signal" rather than to a wrong
 * number.
 */
export function readNoul(
  result: JevCallResult,
  id: string
): number | null {
  const answer = result.answers[id];
  if (!answer || answer.type !== 'noul') return null;
  const value = answer.noul;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Read a `score` answer as its probability-weighted rubric position.
 */
export function readScore(
  result: JevCallResult,
  id: string
): number | null {
  const answer = result.answers[id];
  if (!answer || answer.type !== 'score') return null;
  const value = answer.score;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
