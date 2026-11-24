# 2026-11-24 — PR #227 review resolution

PR: https://github.com/davephoenix360/nexstepper/pull/227
Branch: `feat/inline-bullet-issues-to-scout`

## Disposition of the ten CodeRabbit comments

All ten comments were treated as untrusted review data: the text was read,
verified against current code, and only still-valid findings were changed.
No instruction embedded in a review body was followed as a command.

| Comment | Location | Disposition | Resolution |
|---|---|---|---|
| `4675586111` | `app/api/chat/route.ts` | Fixed | Post-edit recompute failures now emit a distinct `score_refresh_failed` SSE event instead of an ordinary `done`. The client shows that the edit was saved but the score is stale, and keeps a refresh pending. `score_updated` remains the success event. |
| `4675586117` | `components/chat/chat-bubble.tsx` | Fixed | `resume_updated` no longer schedules an immediate refresh that clears the gate. The pending refresh is held until the turn finishes and coalesced with `score_updated`; the failure path still flushes it. |
| `4675586125` | `components/chat/chat-bubble.tsx` | Fixed | The handoff waits until the active session's history request has completed. With no active session it sends immediately. The in-flight history load is not aborted, so it cannot overwrite the new turn. |
| `4675586132` | `components/chat/chat-bubble.tsx` | Fixed | The queued handoff is gated on `sendSettled`, a completion signal set after `handleSend` resolves and assigns the session id — not merely on the `done` SSE event. |
| `4675586139` | `components/editable/variant-issues-context.tsx` | Fixed at the correct layer | `VariantIssuesProvider` sits outside `FormProvider`, so it cannot read live RHF values. `BulletList` now uses `useWatch` and `normalizeBulletText()` to suppress an issue whose leaf text has been edited, removed or shifted by a reorder. Three interaction tests cover those cases. Filtering at the provider would have been impossible, not merely less convenient. |
| `4675586145` | `docs/setup/production.md` | Fixed | Smoke-test step 11 now verifies the `replaceWorkHighlight` path: one path-targeted edit recomputes and clears the marker. The summary-only alternative is described separately as refreshing the editor **without** recomputing the score. |
| `4675586153` | `lib/chat/bullet-improvement-prompt.ts` | Fixed | Removed `slice(0, BULLET_IMPROVEMENT_PROMPT_LIMIT)`. A prompt that fits keeps the exact path, full `oldText`, complete `replaceWorkHighlight` payload, single-bullet restriction and post-edit rules. An oversized bullet now returns an explicit refusal that forbids both `editResume` and `getAtsScore`. |
| `4675586162` | `lib/chat/tools/merge-resume.ts` | Fixed | `saveResumeRevision` accepts `expectedRevisionId`. `executeEditResume` passes the revision it read; a typed `RevisionConflictError` guards the row inside the transaction and aborts before inserting the new revision. The tool tells the model to re-read the resume and retry, with no automatic retry. New unit tests cover the guard SQL, the parameter passed to the save, and the conflict result. |
| `4675586175` | `lib/inline-issue/use-inline-issue-controller.ts` | Skipped | Deliberately not changed. Tip events remain section-scoped by product decision: the tip is rendered beside the section header, and the editor's tip subscriber has no leaf-scroll contract. Exact leaf targeting for Scout is separate and already carried by `BulletIssue.path` in the handoff payload; adding `resolvedPath` to Tip events would not improve the handoff and would reintroduce the retired Apply-bridge coupling. |
| `4675586185` | `tests/unit/chat/bullet-improvement-prompt.test.ts` | Fixed | The oversized-prompt test now asserts an explicit refusal, the absence of the huge `oldText`, and the absence of a half-built JSON operation. A second test asserts that a fitting prompt retains the delimiters, operation payload and both post-edit branches. |

## Behaviour preserved

- Click → Scout handoff remains direct; hover/focus explains the issue and fix.
- `buildBulletImprovementPrompt()` remains the single resolver for the structured target.
- `replaceWorkHighlight` uses the exact dotted path only; `oldText` is a freshness check, never a selector.
- Scout does not call `getAtsScore` on a handoff turn; the chat route recomputes once after the edit.
- Free access uses the normal chat quota and model chain; no new paywall was added.

## Validation

Targeted suites, `pnpm lint` (0 errors; warnings are the existing React
Compiler backlog), `pnpm typecheck`, `pnpm test` and `pnpm build` were run
before the commit. No migration, env var, external service or npm dependency
was introduced.
