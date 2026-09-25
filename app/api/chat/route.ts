import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { streamText, type ModelMessage, type ToolSet, type TextStreamPart } from 'ai';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { resumes } from '@/lib/db/schema';
import {
  appendChatMessage,
  createChatSession,
  getChatMessages,
  getChatUsage,
  getChatSession,
  getResume,
  listChatSessions,
  parseChatToolCalls,
  updateChatSessionTitle,
  upsertChatUsage
} from '@/lib/db/queries';
import { PLANS } from '@/lib/db/schema';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { scoreResumeFromEnvelope } from '@/lib/scoring';
import { CHAT_TOOLS } from '@/lib/chat/tools';
import { executeTool } from '@/lib/chat/execute-tool';
import { getModel } from '@/lib/ai/providers';
import { PARSER_MODEL } from '@/lib/ai/providers';

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

  // ── Rate limit (Free: 20 turns/day) ──────────────────────────────────────
  const usage = await getChatUsage(userId);
  const freeLimit = PLANS.free.chatMessagesPerDay;
  if (usage.turnsUsed >= freeLimit) {
    return NextResponse.json(
      {
        error: 'Daily limit reached',
        code: 'RATE_LIMITED',
        limit: freeLimit,
        resetsAt: usage.date
      },
      { status: 429 }
    );
  }

  // ── Resolve or create session ─────────────────────────────────────────────
  let sessionId = existingSessionId;
  let title = 'New conversation';
  if (sessionId) {
    const existing = await getChatSession(sessionId, userId);
    if (!existing || existing.userId !== userId || existing.resumeId !== resumeId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    title = existing.title;
  } else {
    const created = await createChatSession(userId, resumeId, title);
    sessionId = created.id;
  }

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
    atsScore
  );

  // ── Load chat history (last 20 messages to keep prompt size manageable) ───
  const history = await getChatMessages(sessionId);
  const recentHistory = history.slice(-20);

  // Rebuild ModelMessage[] from DB rows
  const messages: ModelMessage[] = recentHistory.map((row) => {
    const base = { role: row.role as 'user' | 'assistant', content: row.content };
    if (row.role === 'assistant' && row.toolCalls) {
      try {
        const tc = row.toolCalls as Array<{ name: string; args: unknown }>;
        return {
          ...base,
          role: 'assistant' as const,
          toolInvocations: tc.map((t) => ({
            toolCallId: `call_${Math.random().toString(36).slice(2)}`,
            toolName: t.name,
            args: t.args,
            state: 'result' as const,
            result: row.toolResult ?? { ok: true, result: null }
          }))
        };
      } catch {
        return base;
      }
    }
    return base;
  });

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
    CHAT_TOOLS.map((tool) => [
      tool.name,
      {
        description: tool.description,
        // CHAT_TOOLS still stores the Zod schema under `parameters`
        // for backwards-compat; remap to the SDK's expected name.
        inputSchema: tool.parameters,
        execute: async (args: unknown) => {
          try {
            return await executeTool(resumeId, tool.name, args);
          } catch (err) {
            return { ok: false, error: (err as Error).message };
          }
        }
      }
    ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as unknown as ToolSet;

  // ── Stream response ────────────────────────────────────────────────────────
  const model = getModel(PARSER_MODEL, {
    distinctId: userId,
    sessionId,
    traceId: randomUUID()
  });

  const result = await streamText({
    model,
    system,
    messages,
    tools,
    maxOutputTokens: 4000,
    temperature: 0.3
  });

  // ── Create a ReadableStream we can await on to record usage after send ───
  const resultStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      let assistantText = '';
      let toolCallsJson: Array<{ name: string; args: unknown }> = [];
      let toolResultJson: string | null = null;
      let finishReason: string | null = null;

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
            toolCallsJson.push({ name: part.toolName, args: part.input });
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'tool_call', toolName: part.toolName, args: part.input })}\n\n`)
            );
          } else if (part.type === 'tool-result') {
            toolResultJson = JSON.stringify(part.output);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'tool_result', result: part.output })}\n\n`)
            );
          } else if (part.type === 'finish') {
            finishReason = part.finishReason ?? null;
          }
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
          toolResult: toolResultJson
        });

        await upsertChatUsage(userId, 0);
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
      'X-Title': title
    }
  });
}