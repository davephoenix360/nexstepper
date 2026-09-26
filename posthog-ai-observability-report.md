# PostHog AI Observability Setup

## Status

Wired and build-verified. A live generation was not sent because this setup does not use or expose the application's AI Gateway credentials; follow the verification steps below to confirm ingestion in PostHog.

## Integration

- Selected **Vercel AI SDK (Node)** because the project uses `ai` with `@ai-sdk/gateway`; the project is on AI SDK v6, so it uses the supported `@posthog/ai` `withTracing` wrapper rather than the AI SDK v7 OpenTelemetry integration.
- Added `@posthog/ai` to `package.json` and the pnpm lockfile.
- Reused the existing server PostHog client and its `POSTHOG_KEY` / `POSTHOG_HOST` configuration. Those values are configured in `.env.local`; no credentials were added to source code.
- All gateway models returned by `lib/ai/providers.ts` are wrapped with `withTracing`. The fallback helpers in `lib/ai/fallback.ts` retain one trace ID through every fallback attempt.
- The chat route (`POST /api/chat`) supplies the authenticated opaque user ID as the distinct ID, the persisted chat `sessionId` as `$ai_session_id`, and a fresh UUID as the trace ID for each chat turn.
- The AI bullet-rewrite action also supplies its authenticated user ID, the resume ID as its logical AI session, and a per-request trace ID.
- Vercel AI SDK handles the registered chat tools as trace spans; no separate tool-capture loop was added.

## Verification completed

- `pnpm typecheck` passed.
- `pnpm build` passed.

## Verify ingestion

1. Sign in, open a resume, and send a chat message from the in-app assistant.
2. Send a second message in that same chat session. For a deeper trace, request a supported action such as a template switch so the model invokes a tool.
3. In PostHog, open **AI Observability → Traces** and inspect the newest trace.
4. Confirm that:
   - both turns share the chat session's `$ai_session_id`;
   - each submitted message has a distinct trace ID;
   - generations are attributed to the authenticated user ID;
   - tool executions appear in the trace when a tool is used.

## Privacy mode

- **Effective setting:** prompt and completion recording is enabled. `posthogPrivacyMode: false` is set in `lib/ai/providers.ts:218` for the Vercel AI SDK v6 wrapper.
- **What is captured:** with privacy mode off, SDK-captured AI generation events include prompt inputs and model outputs, in addition to model, token, latency, and cost metadata.
- **When to change it:** enable privacy mode before sending prompts or responses whose sensitive content must not be stored in PostHog.
- **How to change it:** set `posthogPrivacyMode: true` in `lib/ai/providers.ts`. This excludes `$ai_input` and `$ai_output_choices` from SDK-captured events; it does not remove previously stored events or arbitrary custom properties.
- [AI Observability privacy mode documentation](https://posthog.com/docs/ai-observability/privacy-mode)
