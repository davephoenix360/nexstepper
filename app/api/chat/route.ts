import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { streamText, type ModelMessage, type ToolSet, type TextStreamPart } from 'ai';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { resumes, NewChatMessage } from '@/lib/db/schema';
import {
  appendChatMessage,
  createChatSession,
  getChatMessages,
  getChatUsage,
  getChatSession,
  getResume,
  listChatSessions,
  updateChatSessionTitle,
  upsertChatUsage
} from '@/lib/db/queries';
import { PLANS } from '@/lib/db/schema';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { CHAT_TOOLS } from '@/lib/chat/tools';
import { executeTool } from '@/lib/chat/execute-tool';
import { getModel } from '@/lib/ai/providers';
import { PARSER_MODEL, PARSE_FALLBACKS } from '@/lib/ai/providers';

const LOG_PREFIX = '[chat-server]';

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
      console.warn(LOG_PREFIX, 'GET messages — session not owned', { sessionId, resumeId, userId });
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const rows = await getChatMessages(sessionId);
    console.log(LOG_PREFIX, 'GET messages', { sessionId, count: rows.length });
    // Map DB rows → ChatMessageRow shape the client expects.
    // `toolCalls` is stored as a JSON string in the JSONB column; parse it back.
    const messages = rows.map((row) => {
      let toolCalls: Array<{ name: string; args: unknown }> | undefined;
      if (row.toolCalls) {
        try {
          const parsedTc =
            typeof row.toolCalls === 'string'
              ? JSON.parse(row.toolCalls)
              : row.toolCalls;
          if (Array.isArray(parsedTc)) toolCalls = parsedTc;
        } catch (err) {
          console.warn(LOG_PREFIX, 'failed to parse toolCalls JSON', { sessionId, rowId: row.id, err: (err as Error).message });
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolResult: unknown = row.toolResult ?? undefined;
      return {
        id: row.id,
        role: row.role as 'user' | 'assistant',
        content: row.content,
        toolCalls,
        toolResult
      };
    });
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
  console.log(LOG_PREFIX, 'GET sessions', { resumeId, count: sessions.length });
  return NextResponse.json({ sessions });
}

// ─── POST /api/chat ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const reqStartedAt = Date.now();
  console.log(LOG_PREFIX, 'POST /api/chat ←');

  const json = await req.json().catch((e) => {
    console.error(LOG_PREFIX, 'failed to parse request body', e);
    return null;
  });
  const parsed = SendMessageSchema.safeParse(json);
  if (!parsed.success) {
    console.warn(LOG_PREFIX, 'schema validation failed', parsed.error.flatten());
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { sessionId: existingSessionId, resumeId, message } = parsed.data;
  console.log(LOG_PREFIX, 'validated body', {
    existingSessionId,
    resumeId,
    messageLen: message.length
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession?.user) {
    console.warn(LOG_PREFIX, 'unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = authSession.user.id;
  console.log(LOG_PREFIX, 'auth OK', { userId });

  // ── Ownership check ───────────────────────────────────────────────────────
  const resume = await getResume(resumeId, userId);
  if (!resume) {
    console.warn(LOG_PREFIX, 'resume not found / not owned', { resumeId, userId });
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }
  console.log(LOG_PREFIX, 'resume loaded', { resumeId, template: resume.resume.template });

  // ── Rate limit (Free: 20 turns/day) ──────────────────────────────────────
  const usage = await getChatUsage(userId);
  const freeLimit = PLANS.free.chatMessagesPerDay;
  console.log(LOG_PREFIX, 'rate limit check', { turnsUsed: usage.turnsUsed, limit: freeLimit });
  if (usage.turnsUsed >= freeLimit) {
    console.warn(LOG_PREFIX, 'rate limit hit', { userId });
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
      console.warn(LOG_PREFIX, 'session not found / mismatch', { sessionId });
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    title = existing.title;
    console.log(LOG_PREFIX, 'using existing session', { sessionId, title });
  } else {
    const created = await createChatSession(userId, resumeId, title);
    sessionId = created.id;
    console.log(LOG_PREFIX, 'created new session', { sessionId });
  }

  // ── Build system prompt (fresh context every turn) ────────────────────────
  const system = buildSystemPrompt(resume.data, resume.data.jobContext ?? undefined);

  // ── Load chat history (last 20 messages to keep prompt size manageable) ───
  const history = await getChatMessages(sessionId);
  const recentHistory = history.slice(-20);
  console.log(LOG_PREFIX, 'history loaded', { totalRows: history.length, using: recentHistory.length });

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
  console.log(LOG_PREFIX, 'persisted user message', { sessionId });

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
      console.log(LOG_PREFIX, 'auto-titled new session', { sessionId, title });
    }
  }

  // Include the just-sent user message in the in-memory messages array
  // BEFORE calling streamText. Without this, `messages` only contains the
  // past history (which is empty for a brand-new session) and the SDK
  // throws `AI_InvalidPromptError: messages must not be empty`.
  messages.push({ role: 'user', content: message });
  console.log(LOG_PREFIX, 'in-memory messages ready for streamText', {
    messagesLen: messages.length,
    historyLen: recentHistory.length
  });

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
          console.log(LOG_PREFIX, 'tool execute() called', { name: tool.name, args });
          try {
            const result = await executeTool(resumeId, tool.name, args);
            console.log(LOG_PREFIX, 'tool execute() result', { name: tool.name, ok: result.ok });
            return result;
          } catch (err) {
            console.error(LOG_PREFIX, 'tool execute() threw', { name: tool.name, err });
            return { ok: false, error: (err as Error).message };
          }
        }
      }
    ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as unknown as ToolSet;

  // ── Stream response ────────────────────────────────────────────────────────
  const model = getModel(PARSER_MODEL);
  console.log(LOG_PREFIX, 'calling streamText()', {
    model: PARSER_MODEL,
    historyLen: messages.length,
    toolsCount: Object.keys(tools).length
  });

  const result = await streamText({
    model,
    system,
    messages,
    tools,
    maxOutputTokens: 4000,
    temperature: 0.3
  });
  console.log(LOG_PREFIX, 'streamText() resolved, starting ReadableStream pump');

  // ── Create a ReadableStream we can await on to record usage after send ───
  const resultStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      let assistantText = '';
      let toolCallsJson: Array<{ name: string; args: unknown }> = [];
      let toolResultJson: string | null = null;
      let finishReason: string | null = null;
      let partCount = 0;

      try {
        // AI SDK v6: iterate `fullStream` for typed TextStreamPart events.
        // `textStream` only yields plain strings (accumulated text), not
        // typed events — we need fullStream to detect tool-call, tool-result,
        // finish, etc.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const part of result.fullStream as AsyncIterable<any>) {
          partCount++;
          console.log(LOG_PREFIX, `fullStream part #${partCount}`, {
            type: part.type,
            keys: Object.keys(part).filter((k) => k !== 'type')
          });

          if (part.type === 'text-delta') {
            assistantText += part.text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', delta: part.text })}\n\n`)
            );
            console.log(LOG_PREFIX, '  → emitted text-delta SSE', { len: part.text.length });
          } else if (part.type === 'tool-call') {
            toolCallsJson.push({ name: part.toolName, args: part.input });
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'tool_call', toolName: part.toolName, args: part.input })}\n\n`)
            );
            console.log(LOG_PREFIX, '  → emitted tool_call SSE', { name: part.toolName });
          } else if (part.type === 'tool-result') {
            toolResultJson = JSON.stringify(part.output);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'tool_result', result: part.output })}\n\n`)
            );
            console.log(LOG_PREFIX, '  → emitted tool_result SSE');
          } else if (part.type === 'finish') {
            finishReason = part.finishReason ?? null;
            console.log(LOG_PREFIX, '  fullStream finish event', { finishReason });
          } else if (part.type === 'error') {
            console.error(LOG_PREFIX, '  fullStream error event', part.error);
          } else if (part.type === 'start-step' || part.type === 'finish-step') {
            // Noisy but useful — log at debug verbosity only
            console.log(LOG_PREFIX, `  step ${part.type === 'start-step' ? 'start' : 'finish'}`);
          } else if (part.type === 'text-start' || part.type === 'text-end') {
            console.log(LOG_PREFIX, `  text segment ${part.type}`);
          }
        }

        // Final done marker
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done', finishReason })}\n\n`)
        );
        console.log(LOG_PREFIX, 'stream pump done', {
          totalParts: partCount,
          assistantTextLen: assistantText.length,
          toolCallsCount: toolCallsJson.length,
          toolResult: toolResultJson ? 'present' : 'null',
          finishReason
        });
      } catch (err) {
        console.error(LOG_PREFIX, 'stream pump threw', err);
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
        console.log(LOG_PREFIX, 'persisted assistant message + bumped usage');
      } catch (err) {
        console.error(LOG_PREFIX, 'failed to persist assistant message:', err);
      }
    }
  });

  console.log(LOG_PREFIX, 'POST /api/chat →', {
    status: 200,
    sessionId,
    title,
    elapsedMs: Date.now() - reqStartedAt
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
