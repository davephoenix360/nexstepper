# AI Chat Assistant — Plan

## Objective

A floating AI co-pilot bubble accessible from the variant editor that can read the
current resume, job description, and template state; edit the resume; and switch the
active template. The assistant is context-aware per session, with a persistent chat
history sidebar. Free users get 20 user-turns/day; Pro is unlimited.

## User-visible behavior

When a user opens a variant (or master) resume, a small circular AI bubble appears in
the bottom-right corner. Clicking it opens a modal chat window that stays open while
the user interacts with it — it can be minimized back to the bubble. The assistant
can:

- Answer questions about the resume ("how does my experience look?")
- Edit individual bullets or sections (changes land in the live preview without refresh)
- Suggest or switch the active template (e.g. "use the executive template")
- Explain ATS scoring tips

A session list in the sidebar lets the user browse, resume, or delete past chats.
Starting a new session begins fresh — no cross-session context.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Variant editor RSC (page.tsx)                           │
│  └── <ResumeChatBubble /> (client, rendered server-side) │
│      ├── <ChatSidebar />  (session list)                │
│      └── <ChatWindow />   (modal: header + messages +    │
│                            input)                        │
└─────────────────────────────────────────────────────────┘
          │ POST /api/chat  (streaming)
          ▼
┌─────────────────────────────────────────────────────────┐
│  app/api/chat/route.ts                                  │
│  - Rate-limit check (free: 20/day)                      │
│  - streamText() with tools                             │
│  - Persists messages to DB                              │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  lib/chat/                                              │
│  ├── system-prompt.ts   (buildResumeContext)            │
│  ├── tools/index.ts    (tool registry)                  │
│  └── execute-tool.ts  (dispatch to implementations)    │
└─────────────────────────────────────────────────────────┘
```

### Streaming approach

`@ai-sdk/react` is NOT in `package.json`. We implement a thin streaming client using
`useState` + `fetch` + `ReadableStream`:

1. Client sends message via `fetch(POST /api/chat, { body: JSON, signal: abort })`.
2. API route calls `streamText()` from `ai` and pipes the `ReadableStream` directly
   back to the client via `Response(stream)`.
3. Client reads chunks via `response.body.getReader()` and accumulates them into state.
4. No new npm packages needed.

This is the same pattern the Vercel AI SDK docs recommend for custom clients.

### Rate limiting

Per-user daily token budget: Free = 20 turns, Pro = unlimited.

A `chat_usage` table tracks `userId + date → tokensUsed`. The API route checks before
streaming. If Free is exhausted, it returns `{ error: 'rate_limited', resetsAt: <tomorrow> }`
instead of streaming. The client surfaces an inline banner.

### Context injection

The system prompt includes:
- Full resume JSON (truncated to last 8KB to fit in context)
- JD text if `jobContext` is attached
- Template ID
- Available template IDs (minimal, classic, executive, creative, modern)
- Current score (if a score snapshot exists)
- User display name

The context is injected fresh on every API call (not stored in the chat history table)
so the model always sees the current state even when replaying history.

## Scope (in)

1. **DB schema** — `chat_sessions` + `chat_messages` + `chat_usage` tables.
2. **API route** — `POST /api/chat` (streaming with `streamText` + tools) and
   `GET /api/chat?sessions=true` (session list) and `GET /api/chat?sessionId=` (history load).
3. **Chat lib** — system prompt builder, tool registry, tool implementations.
4. **UI** — floating bubble, collapsible modal, message list, input, sidebar with session list.
5. **Template-switching tool** — edits `template` on the resume revision.
6. **Resume-editing tool** — patches the resume via `saveResumeRevisionAction` flow.
7. **Quota enforcement** — free-tier daily-turn limit checked server-side.
8. **Chat history** — create, list, delete, resume sessions.

## Non-goals (out)

- Multi-turn tool-call chains across multiple API calls (single `streamText` call per turn).
- Voice / image input.
- Chat history shared between different resumes (each resume variant is an isolated context).
- Automatic title generation for sessions (first user message used as title).

## Files

**New:**

```
lib/chat/
├── system-prompt.ts        # buildResumeContext() + buildSystemPrompt()
├── tools/
│   ├── index.ts            # tool registry (tools[] for streamText)
│   ├── edit-resume.ts      # patchResume() — merges partial ResumeData
│   ├── switch-template.ts  # patchResume({ template: '...' })
│   └── types.ts            # ToolInput / ToolResult types shared across tools
└── execute-tool.ts         # dispatch() — resolves toolId → result

lib/db/queries.ts           # +7 chat query functions
app/api/chat/route.ts       # GET + POST handlers
components/chat/
├── chat-bubble.tsx         # floating bubble button (bottom-right)
├── chat-window.tsx         # modal: header + session list + chat view
├── chat-sidebar.tsx        # session list panel
├── chat-message.tsx        # user + assistant message row
├── chat-input.tsx          # textarea + send button
└── use-chat-stream.ts      # custom hook: streaming fetch → messages state

migrations/0006_*.sql        # chat_sessions, chat_messages, chat_usage
```

**Changed:**

```
app/(dashboard)/dashboard/resumes/[id]/page.tsx  # + <ResumeChatBubble>
app/globals.css                                  # + .chat-bubble, .chat-window
lib/db/schema.ts                                 # + 3 chat tables
```

## DB / schema

```sql
-- chat_sessions: one per user-initiated conversation
CREATE TABLE chat_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  resume_id   TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'New conversation',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX chat_sessions_user_idx ON chat_sessions(user_id, updated_at DESC);

-- chat_messages: append-only per-session history
CREATE TABLE chat_messages (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,  -- 'user' | 'assistant'
  content      TEXT NOT NULL,
  tool_calls   JSONB,           -- [{ id, name, args }] if role=assistant and tool invoked
  tool_result  JSONB,           -- serialized result of tool call
  tokens_in    INTEGER NOT NULL DEFAULT 0,
  tokens_out   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX chat_messages_session_idx ON chat_messages(session_id, created_at ASC);

-- chat_usage: daily token budget tracker (upserted per user + date)
CREATE TABLE chat_usage (
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  tokens_used  INTEGER NOT NULL DEFAULT 0,
  turns_used   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
```

**Key design choices:**

- `tool_calls` + `tool_result` on each row means the full conversation can be
  reconstructed for re-streaming or audit. Only the user's turn (which triggers one
  `streamText` call) counts toward the quota — assistant messages are read-only.
- `tokens_in` + `tokens_out` per row: quota is enforced on `tokens_in` (the user's
  prompt). This matches how token costs are calculated and is more stable than
  counting messages (which can vary wildly in size).
- `updated_at` on `chat_sessions` drives the "most recent first" sort in the sidebar.

## API design

```
POST /api/chat
  Body:    { sessionId?: string; resumeId: string; message: string }
  Returns: ReadableStream (text/event-stream compatible, raw delta stream)
           On rate-limit: { error: 'rate_limited', resetsAt: ISO string }

GET /api/chat?sessions=true
  Query:   resumeId
  Returns: { sessions: ChatSessionSummary[] }

GET /api/chat?sessionId=<id>
  Returns: { messages: ChatMessageRow[] }
```

## Tool definitions

### `editResume`

Edits the active resume by merging a partial `ResumeData` patch. Mirrors the
`enrichBulletAction` pattern (Zod input validation → `saveResumeRevisionAction`
flow). Changes persist to DB and appear in the live preview via the existing
`dispatchInlineIssueApply` event bridge (or a new `dispatchResumeApply` event).

```typescript
// Tool input schema
const editResumeSchema = z.object({
  changes: resumeDataSchema.partial(),
  reason: z.string().describe('Why this change helps with the job or user goal'),
});
```

### `switchTemplate`

Changes `data.template` to one of the available templates. Input is a union of
the valid template IDs.

```typescript
const switchTemplateSchema = z.object({
  template: z.enum(['minimal', 'classic', 'executive', 'creative', 'modern']),
  reason: z.string(),
});
```

## UI components

### `ResumeChatBubble`

Server Component rendered by `page.tsx`. Accepts `resumeId` and `planId`. Renders
a fixed-position `<ChatWindow />` that is open/closed/minimized via `useState` in a
client wrapper. No portal needed — it sits at the bottom of the RSC's JSX tree.

### `ChatWindow`

Client Component. State: `mode: 'chat' | 'history'`. In `'chat'` mode: message list
+ input. In `'history'` mode: session list. Collapses to bubble icon on minimize.

### `useChatStream`

Custom hook. Manages: `messages[]`, `isLoading`, `error`. On send: `fetch POST`,
reads `response.body`, appends chunks to messages. Handles abort. On mount:
loads session list.

## Acceptance criteria

1. Clicking the bubble opens a chat window; clicking the minimize button returns to
   the bubble.
2. Typing a message and pressing Enter (or Send) streams the assistant's response
   in real time.
3. The assistant can edit a bullet and the change appears in the resume preview
   without refresh.
4. The assistant can switch the template and the preview updates immediately.
5. The session sidebar shows all past sessions for the current resume, most recent
   first. Clicking a session loads its history.
6. Starting a new session clears the message list (no cross-session context).
7. A Free user who exceeds 20 turns sees a rate-limit banner; a Pro user has no
   limit.
8. Chat history persists across page reloads.
9. The bubble and chat window are `no-print` (hidden from PDF output).

## Test plan

- Unit: `buildResumeContext()` truncates large resumes, includes JD, templates.
- Unit: `editResumeSchema` rejects invalid partial ResumeData.
- Unit: `switchTemplateSchema` rejects invalid template IDs.
- Unit: quota check returns `rate_limited` for Free at 20 turns.
- Integration: API route streams text for a valid message.
- Integration: API route returns rate-limit error for exhausted Free user.
- Integration: template-switching tool patches the correct `resume_id`.
- Smoke: open resume → click bubble → send "change my summary to X" → preview updates.

## Rollback

Delete the three chat tables + migration, remove the `ChatBubble` from the page,
delete `lib/chat/` and `components/chat/`. No other tables depend on the new ones.
