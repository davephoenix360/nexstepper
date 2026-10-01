import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import {
  streamText,
  stepCountIs,
  type ModelMessage,
  type ToolSet,
  type ToolResultPart
} from 'ai';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { resumes } from '@/lib/db/schema';
import {
  appendChatMessage,
  addChatTokens,
  createChatSession,
  getChatMessages,
  getChatSession,
  getResume,
  getSubscription,
  countVariantsByMasterId,
  listChatSessions,
  parseChatToolCalls,
  tryConsumeChatTurn,
  updateChatSessionTitle
} from '@/lib/db/queries';
import { PLANS } from '@/lib/db/schema';
import { asPlanId } from '@/lib/billing';
import { buildSystemPrompt, type ResumeKind } from '@/lib/chat/system-prompt';
import { scoreResumeFromEnvelope } from '@/lib/scoring';
import { CHAT_TOOLS } from '@/lib/chat/tools';
import { executeTool } from '@/lib/chat/execute-tool';
import { getModel, CHAT_MODEL, CHAT_GATEWAY_PROVIDER_OPTIONS, CHAT_MAX_OUTPUT_TOKENS, CHAT_MAX_STEPS } from '@/lib/ai/providers';
import { trackServer } from '@/lib/posthog/server';
import { PostHogEvents } from '@/lib/posthog/events';

// ─── Resume-kind context ─────────────────────────────────────────────────────

/**
 * Work out whether the chat is attached to a master resume or a variant, and
 * name the parent master.
 *
 * Without this the assistant had no idea which kind of resume it was looking
 * at, so it could not give kind-aware advice — and a user asking "is this my
 * master?" got a guess. It also changes what good editing looks like: a
 * master should stay general, a variant is allowed to be narrow.
 *
 * Cheap enough to run per turn: one indexed count plus, for a variant, one
 * primary-key lookup.
 */
async function resolveResumeKind(
  resume: { id: string; isMaster: boolean; parentResumeId: string | null },
  userId: string
): Promise<ResumeKind> {
  if (resume.isMaster) {
    const variantCount = await countVariantsByMasterId(resume.id, userId).catch(
      () => 0
    );
    return { isMaster: true, variantCount };
  }

  let parentResumeName: string | undefined;
  let variantCount = 0;
  if (resume.parentResumeId) {
    const [parent] = await db
      .select({ name: resumes.name })
      .from(resumes)
      .where(
        and(eq(resumes.id, resume.parentResumeId), eq(resumes.userId, userId))
      )
      .limit(1);
    parentResumeName = parent?.name;
    variantCount = await countVariantsByMasterId(
      resume.parentResumeId,
      userId
    ).catch(() => 0);
  }

  return { isMaster: false, parentResumeName, variantCount };
}

// ─── Request / response types ─────────────────────────────────────────────────

const SendMessageSchema = z.object({
  // `null` is the "start a new conversation" case — the route creates
  // a session below. `undefined` covers "field omitted entirely".
  sessionId: z.string().nullable().optional(),
  resumeId: z.string(),
  message: z.string().min(1).max(4000)
});

const ListSessionsSchema = z.object({
  resumeId: z.string()
});

/** The `value` shape a `tool-result` part is allowed to carry. */
type ToolResultValue = Extract<ToolResultPart['output'], { type: 'json' }>['value'];

/**
 * Coerce an arbitrary value from the JSONB `tool_result` column into
 * something the AI SDK will accept as a `JSONValue` inside a
 * `tool-result` part.
 *
 * A round-trip through `JSON.stringify` is the honest coercion: it drops
 * `undefined`, converts `Date`s and `BigInt`s, and throws on cycles — which
 * is why it is wrapped. Without this, a non-serialisable value would be
 * stringified by the SDK as `[object Object]` and the model would read a
 * successful tool call as a broken one.
 */
function toJsonValue(raw: unknown): ToolResultValue {
  if (raw === null) return null;
  if (
    typeof raw === 'string' ||
    typeof raw === 'number' ||
    typeof raw === 'boolean'
  ) {
    return raw;
  }
  try {
    return JSON.parse(JSON.stringify(raw)) as ToolResultValue;
  } catch {
    return String(raw);
  }
}

// ─── GET /api/chat?resumeId=…&sessionId=… ─────────────────────────────────────
//
// Two flavours:
//   ?resumeId=…                → list the user's chat sessions for this resume
//   ?resumeId=…&sessionId=…    → list that session's messages (in chronological order)
//
// `sessionId` requires `resumeId` so the ownership check can run on the resume
// before we return any session/message data.

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const resumeId = searchParams.get('resumeId');
  const sessionId = searchParams.get('sessionId');

  const parsed = ListSessionsSchema.safeParse({ resumeId });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid resumeId' }, { status: 400 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const [ownership] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, parsed.data.resumeId), eq(resumes.userId, userId)))
    .limit(1);

  if (!ownership) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // ── Session messages ─────────────────────────────────────────────────────
  if (sessionId) {
    const owned = await getChatSession(sessionId, userId);
    if (!owned || owned.resumeId !== resumeId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const rows = await getChatMessages(sessionId);
    // Map DB rows → ChatMessageRow shape the client expects.
    // `toolCalls` is stored as a JSON string in the JSONB column; parse it back.
    const messages = rows.map((row) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      toolCalls: parseChatToolCalls(row.toolCalls),
      toolResult: (row.toolResult ?? undefined) as unknown
    }));
    return NextResponse.json({
      session: {
        id: owned.id,
        title: owned.title,
        updatedAt: owned.updatedAt
      },
      messages
    });
  }

  // ── Sessions list ─────────────────────────────────────────────────────────
  const sessions = await listChatSessions(userId, parsed.data.resumeId);
  return NextResponse.json({ sessions });
}

// ─── POST /api/chat ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = SendMessageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { sessionId: existingSessionId, resumeId, message } = parsed.data;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = authSession.user.id;

  // ── Ownership check ───────────────────────────────────────────────────────
  const resume = await getResume(resumeId, userId);
  if (!resume) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }

  // ── Quota gate (atomic, plan-aware) ──────────────────────────────────────
  //
  // Consumes the turn in the SAME statement that checks it, so
  // concurrent requests can't race past the limit. Previously this
  // was a SELECT-then-compare-then-increment (increment happened in
  // the stream's `finally`), which let N parallel requests all pass
  // the gate. See `tryConsumeChatTurn` for the full reasoning.
  //
  // The limit comes from the caller's actual plan, not a hardcoded
  // Free constant — otherwise a Pro user silently inherits the Free
  // cap when we flip soft-launch off.
  let plan: ReturnType<typeof asPlanId>;
  try {
    const sub = await getSubscription();
    plan = asPlanId(sub.plan);
  } catch (err) {
    // Surface a clean 503 instead of an opaque 500 if the subscription
    // lookup fails (DB hiccup, Neon cold start, etc.). The client can
    // show "service temporarily unavailable" and the user can retry.
    // Logged to stderr so Sentry's auto-instrumentation can pick it up.
    console.error('[api/chat] subscription lookup failed', err);
    return NextResponse.json(
      { error: 'Service temporarily unavailable', code: 'SUBSCRIPTION_LOOKUP_FAILED' },
      { status: 503 }
    );
  }
  const freeLimit = PLANS[plan].chatMessagesPerDay;
  const unlimited = !Number.isFinite(freeLimit);
  const usage = await tryConsumeChatTurn(userId, freeLimit);
  if (!usage) {
    // Zero rows back means the `WHERE turns_used < limit` predicate
    // failed — we're at or over quota. We don't have a row to read
    // `resetsAt` from, so compute today's date directly; the counter
    // resets at UTC midnight because that's what the `date` column
    // is keyed on. `limit` is `null` for unlimited plans (would be a
    // 429 on an unlimited plan only if the plan lookup itself raced —
    // shouldn't happen, but we surface null rather than Infinity to
    // keep the client type honest).
    return NextResponse.json(
      {
        error: 'Daily limit reached',
        code: 'RATE_LIMITED',
        limit: unlimited ? null : freeLimit,
        resetsAt: new Date().toISOString().slice(0, 10)
      },
      { status: 429 }
    );
  }

  // ── Resolve or create session ─────────────────────────────────────────────
  let sessionId = existingSessionId;
  let title = 'New conversation';
  let isNewSession = false;
  if (sessionId) {
    const existing = await getChatSession(sessionId, userId);
    if (!existing || existing.userId !== userId || existing.resumeId !== resumeId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    title = existing.title;
  } else {
    const created = await createChatSession(userId, resumeId, title);
    sessionId = created.id;
    isNewSession = true;
  }

  trackServer(userId, PostHogEvents.CHAT_MESSAGE_SENT, {
    sessionId,
    resumeId,
    isNewSession
  });

  // ── Build system prompt (fresh context every turn) ────────────────────────
  //
  // The ATS score is re-computed here from the envelope rather than read
  // from the latest `score_snapshots` row, so the model sees numbers
  // that reflect any in-memory edits the user just made (the snapshot
  // is only written by `recomputeScoreAction`, which the user may not
  // have clicked since their last edit). The engine is pure/sync and
  // runs in ~10–50ms — negligible next to the model call.
  //
  // Gated on `resume.resume.isMaster` (master resumes don't have JDs)
  // and on a non-null `jobContext` (the score is meaningless without one).
  const atsScore =
    !resume.resume.isMaster && resume.data.jobContext
      ? scoreResumeFromEnvelope(
          resume.data,
          resume.data.jobContext,
          new Date()
        )
      : null;

  const system = buildSystemPrompt(
    resume.data,
    resume.data.jobContext ?? undefined,
    atsScore,
    await resolveResumeKind(resume.resume, userId)
  );

  // ── Load chat history (last 20 messages to keep prompt size manageable) ───
  const history = await getChatMessages(sessionId);
  const recentHistory = history.slice(-20);

  // Rebuild a real `ModelMessage[]` transcript from the DB rows.
  //
  // The previous version produced the AI SDK **v4 UIMessage** shape —
  // `{ role, content, toolInvocations: [...] }` with a fresh
  // `toolCallId: call_${Math.random()...}` on every request. That is not a
  // valid `ModelMessage`, so the SDK saw an assistant message with a plain
  // string body plus tool calls it could not pair with any result. The model
  // therefore never learned what its own tools had returned, and multi-turn
  // tool use degraded into "I did the thing" claims with no grounding.
  //
  // The correct v5/v6 encoding is two messages per tool turn:
  //   assistant: content: [{type:'text'…}, {type:'tool-call', toolCallId, toolName, input}]
  //   tool:      content: [{type:'tool-result', toolCallId, toolName, output}]
  // The `toolCallId` must be the SAME on both, so we persist it with the
  // tool call and read it back here rather than inventing one.
  const messages: ModelMessage[] = [];
  for (const row of recentHistory) {
    if (row.role === 'user') {
      messages.push({ role: 'user', content: row.content });
      continue;
    }

    const calls = parseChatToolCalls(row.toolCalls);
    if (!calls || calls.length === 0) {
      messages.push({ role: 'assistant', content: row.content });
      continue;
    }

    const assistantContent: Array<
      | { type: 'text'; text: string }
      | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
    > = [];
    if (row.content.trim().length > 0) {
      assistantContent.push({ type: 'text', text: row.content });
    }
    for (const call of calls) {
      assistantContent.push({
        type: 'tool-call',
        // Fall back to a deterministic id for rows written before ids were
        // persisted — stable across turns, which is what the pairing needs.
        toolCallId: call.id ?? `legacy-${row.id}-${call.name}`,
        toolName: call.name,
        input: call.args
      });
    }
    messages.push({ role: 'assistant', content: assistantContent });

    // Replay the result so the model can see what the tool actually did.
    // The column is `[{ id, result }]` per tool.
    const resultById = new Map<string, unknown>();
    if (Array.isArray(row.toolResult)) {
      for (const entry of row.toolResult as Array<{ id?: string; result?: unknown }>) {
        if (entry && typeof entry === 'object' && entry.id) {
          resultById.set(entry.id, entry.result);
        }
      }
    }

    // The SDK requires a `ToolResultOutput` discriminator whose `value` is a
    // `JSONValue`. Tool results come back as `unknown` from the JSONB column,
    // so coerce defensively — an unserialisable value would otherwise reach
    // the model as `[object Object]` and read as a failed tool.
    const toolContent: ToolResultPart[] = [];
    for (const call of calls) {
      const toolCallId = call.id ?? `legacy-${row.id}-${call.name}`;
      const raw = resultById.get(toolCallId) ?? { ok: true, result: 'applied' };
      toolContent.push({
        type: 'tool-result',
        toolCallId,
        toolName: call.name,
        output: { type: 'json', value: toJsonValue(raw) }
      });
    }
    messages.push({ role: 'tool', content: toolContent });
  }

  // Append the user's message to the DB immediately
  await appendChatMessage(sessionId, {
    role: 'user',
    content: message,
    toolCalls: null,
    toolResult: null
  });

  // Auto-title new sessions with a preview of the first user message.
  // `recentHistory` was loaded BEFORE we persisted the current turn, so if
  // it's empty this is the first message in the session and we should
  // replace the placeholder "New conversation" title with something useful.
  if (recentHistory.length === 0) {
    const preview = message
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50)
      .trimEnd();
    const newTitle = preview.length < message.trim().length ? preview + '…' : preview;
    const updated = await updateChatSessionTitle(sessionId, userId, newTitle);
    if (updated) {
      title = updated.title;
    }
  }

  // Include the just-sent user message in the in-memory messages array
  // BEFORE calling streamText. Without this, `messages` only contains the
  // past history (which is empty for a brand-new session) and the SDK
  // throws `AI_InvalidPromptError: messages must not be empty`.
  messages.push({ role: 'user', content: message });

  // ── Build tools as a ToolSet object (AI SDK v6 requires Record<string, Tool>) ─
  //
  // AI SDK v6 renamed the per-tool schema field from `parameters` to
  // `inputSchema` — see `BaseTool<INPUT>` in @ai-sdk/provider-utils.
  // If we leave it as `parameters`, the SDK treats the tool as
  // schemaless and the model has no idea what shape to fill in.
  // Symptom: model emits the tool call but with `args: {}` (empty).
  //
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = Object.fromEntries(
    Object.entries(CHAT_TOOLS).map(([toolName, tool]) => [
      toolName,
      {
        description: tool.description,
        // CHAT_TOOLS stores the Zod schema under `parameters`; remap to the
        // SDK's expected `inputSchema` (AI SDK v6 renamed it).
        inputSchema: tool.parameters,
        execute: async (args: unknown) => {
          try {
            return await executeTool(resumeId, toolName, args);
          } catch (err) {
            return { ok: false, error: (err as Error).message };
          }
        }
      }
    ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as unknown as ToolSet;

  // ── Stream response ────────────────────────────────────────────────────────
  //
  // CHAT_MODEL, not PARSER_MODEL. The parser needs strict-JSON structured
  // output on a huge schema; the chat needs multi-turn instruction following
  // and tool calling. The gateway `order` means a model that is unavailable on
  // this account degrades to the next one instead of failing the turn.
  const model = getModel(CHAT_MODEL, {
    distinctId: userId,
    sessionId,
    traceId: randomUUID()
  });

  const result = await streamText({
    model,
    system,
    messages,
    tools,
    providerOptions: CHAT_GATEWAY_PROVIDER_OPTIONS,
    // Without this the SDK stops after ONE step, so a turn that spends its
    // step on a tool call can never read the result and confirm to the user.
    // That is what made a successful edit look like nothing happened.
    stopWhen: stepCountIs(CHAT_MAX_STEPS),
    maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
    temperature: 0.3
  });

  // ── Create a ReadableStream we can await on to record usage after send ───
  const resultStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      let assistantText = '';
      // Tool calls, each carrying the SDK-assigned `toolCallId`. Persisting
      // the id is what lets the NEXT turn pair a `tool-result` message with
      // its `tool-call` (the route used to mint a random id per request,
      // which made that pairing impossible).
      let toolCallsJson: Array<{ id: string; name: string; args: unknown }> = [];
      // One entry per tool result, keyed by the same id, so a multi-step turn
      // that edits twice round-trips both.
      let toolResultsJson: Array<{ id: string; result: unknown }> = [];
      let finishReason: string | null = null;
      // Set when a resume-mutating tool ran, so we can tell the client to
      // revalidate the editor before the stream closes.
      let resumeMutated = false;

      try {
        // AI SDK v6: iterate `fullStream` for typed TextStreamPart events.
        // `textStream` only yields plain strings (accumulated text), not
        // typed events — we need fullStream to detect tool-call, tool-result,
        // finish, etc.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const part of result.fullStream as AsyncIterable<any>) {
          if (part.type === 'text-delta') {
            assistantText += part.text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', delta: part.text })}\n\n`)
            );
          } else if (part.type === 'tool-call') {
            toolCallsJson.push({
              id: part.toolCallId,
              name: part.toolName,
              args: part.input
            });
            if (part.toolName === 'editResume' || part.toolName === 'switchTemplate') {
              resumeMutated = true;
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'tool_call', toolCallId: part.toolCallId, toolName: part.toolName, args: part.input })}\n\n`)
            );
          } else if (part.type === 'tool-result') {
            toolResultsJson.push({ id: part.toolCallId, result: part.output });
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'tool_result', toolCallId: part.toolCallId, result: part.output })}\n\n`)
            );
          } else if (part.type === 'finish') {
            finishReason = part.finishReason ?? null;
          }
        }

        // Tell the client a resume-mutating tool actually landed, so the
        // editor revalidates and the user sees their own change instead of a
        // stale page sitting next to a chat claiming it was updated. Emitted
        // before `done` (and before the controller closes) so the client
        // processes it in order.
        if (resumeMutated) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'resume_updated' })}\n\n`)
          );
        }

        // Final done marker
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done', finishReason })}\n\n`)
        );
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`)
        );
      } finally {
        controller.close();
      }

      // ── Persist the assistant message to DB ─────────────────────────────
      try {
        await appendChatMessage(sessionId, {
          role: 'assistant',
          content: assistantText,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          toolCalls: toolCallsJson.length > 0 ? (JSON.stringify(toolCallsJson) as any) : null,
          toolResult: toolResultsJson.length > 0 ? toolResultsJson : null
        });

        // ── Record real token consumption ────────────────────────────────
        // Previously this was `upsertChatUsage(userId, 0)` — a
        // hardcoded zero — so `tokens_used` was permanently 0 and
        // the column did nothing. The turn itself was already
        // consumed atomically above; this only adds the token delta.
        // `result.usage` is populated once the stream has drained.
        // AI SDK 6's `result.usage` is a PromiseLike, so it has to be
        // awaited. The turn itself was already consumed atomically
        // above; this only adds the token delta.
        const usage = await result.usage;
        const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
        await addChatTokens(userId, totalTokens);
      } catch {
        // Persist failure is silent — the client already received the
        // assistant message via SSE. Dropping it on the floor here just
        // means we won't have history for next time.
      }
    }
  });

  return new Response(resultStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Session-Id': sessionId,
      'X-Title': title,
      // Post-consume usage so the client can render an honest
      // "N messages remaining today" readout. Previously the
      // bubble hardcoded `{ limit: 20, used: 0 }` and never
      // decremented, so the number the user saw was always the
      // full allowance regardless of how much they'd used.
      'X-Chat-Usage': `${usage.turnsUsed}`,
      'X-Chat-Limit': Number.isFinite(freeLimit) ? String(freeLimit) : 'unlimited'
    }
  });
}