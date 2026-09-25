-- Migration 0006: chat_sessions, chat_messages, chat_usage
-- Plan: docs/plans/ai-chat-assistant.md

-- ─── chat_sessions ─────────────────────────────────────────────────────────
-- One conversation thread per user per resume variant. The title is the
-- first user message (or 'New conversation' before the first message).
-- `updated_at` drives the "most recent first" sort in the sidebar.

CREATE TABLE chat_sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  resume_id  TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX chat_sessions_user_idx
  ON chat_sessions(user_id, updated_at DESC);

-- ─── chat_messages ─────────────────────────────────────────────────────────
-- Append-only per-session history. One row per user or assistant turn.
-- `tool_calls` + `tool_result` enable full history reconstruction so
-- the model sees the full conversation when replaying.
--
-- `tokens_in` / `tokens_out` are the actual per-call token counts
-- from the AI SDK usage object.  These are written by the API route
-- after the stream finishes (available in the `finish` callback of
-- `streamText`).

CREATE TABLE chat_messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,       -- 'user' | 'assistant'
  content     TEXT NOT NULL,
  tool_calls  JSONB,               -- [{ id, name, args }]  (assistant only)
  tool_result JSONB,               -- serialized tool output  (assistant only)
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX chat_messages_session_idx
  ON chat_messages(session_id, created_at ASC);

-- ─── chat_usage ────────────────────────────────────────────────────────────
-- Daily token-budget tracker.  We count the user's input tokens per day
-- (tokens_in on user rows).  The API route checks this before streaming.
-- Free: 20 turns/day (enforced at the turn-count level, not token level,
-- because turn sizes vary wildly).  Pro: unlimited — we still write the
-- row so we have the data if we ever want analytics.
--
-- PRIMARY KEY (user_id, date) makes the upsert trivial: ON CONFLICT DO UPDATE
-- SET tokens_used = tokens_used + EXCLUDED.tokens_used, turns_used = turns_used + 1

CREATE TABLE chat_usage (
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  turns_used  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
