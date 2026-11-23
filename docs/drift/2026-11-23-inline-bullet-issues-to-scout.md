# 2026-11-23 — Inline bullet issues hand off to Scout

## Vision recap

The core loop is master → JD parse → score → edit → share. The missing link
was the shortest one: a measured weak work bullet had no in-place way to act
on its own score. The scorecard had a Pro-only “Rewrite with AI” popover, but
it was anchored by a path spelling the editor never rendered, wrote through a
second AI path, and still left the bullet marker in place until a reload.

This change puts one attention icon beside each measured weak work bullet.
Hover or keyboard focus explains the issue and the fix; clicking sends a
bullet-specific prompt straight to Scout through the existing chat quota. The
old rewrite surface is retired, so there is one AI edit path and one score
read path.

## Roadmap status

- **Now:** local branch `feat/inline-bullet-issues-to-scout`. Plan and
  acceptance criteria are complete; gates are green; nothing is pushed.
- **Next (unchanged):** create the Pro product/price in Stripe and set
  `STRIPE_PRICE_ID_PRO`, then Reviews, Liveblocks collab UI, extension API,
  template studio. This work does not gate or alter any of them.
- **Later / parked (unchanged):** monorepo split, locked non-goals, and the
  parked “Optimize as a class of work”. This is not a new Optimize surface —
  it is an editor affordance that hands off to the existing agent.

## What shipped

1. **One measured issue resolver.** `lib/scoring/bullet-issues.ts` reads the
   persisted `jevBullets` measurements and the resume envelope through
   `collectHighlightEntries`, flags `impact < 1.5` or `opening < 1.5`, and
   returns dotted editor paths plus exact bullet text, company, role and
   duplicate occurrence. One issue per criterion per path; grouping keeps a
   single icon on a bullet flagged by both criteria. The same resolver feeds
   the icon, the scorecard counts and the match-breakdown anchor, with tests
   asserting agreement.

2. **Inline attention, not a modal.** `BulletAttention` renders left of the
   flagged work bullet with a Radix tooltip for reason + fix. It is
   `print:hidden` / `no-print`, and only the editable work-bullet path renders
   it — preview, public share and other highlight lists stay clean.

3. **Repeatable Scout handoff.** `ChatHandoffProvider` owns a queue of
   request IDs; `ChatBubble` opens the panel, waits for sessions to load,
   consumes each request once, and queues a second click while the first turn
   is streaming. Free users use the normal chat quota and model chain — no
   `requirePro()` gate, no second paywall.

4. **Surgical edit, measured result.** The handoff prompt names the exact
   bullet and tells Scout not to invent metrics or call `getAtsScore`. Scout
   edits through `replaceWorkHighlight`, which targets exact text plus
   company/role/occurrence and fails on ambiguity rather than guessing. The
   chat route only recomputes when the **tool result** reports success.

5. **One persistence path, two refresh mechanisms.** The Recompute action and
   the chat route both call `recomputeVariantScore()`, which re-reads the
   resume when no source is supplied and writes the full breakdown snapshot.
   Revalidation is deliberately outside the helper: Server Actions call
   `revalidateVariantScorePaths()` explicitly, while a streaming route emits
   `resume_updated` + `score_updated` and the client coalesces them into one
   `router.refresh()`. Route-handler `revalidatePath()` is not reliable after
   the response has returned but before the stream ends.

6. **Retired surface.** Gone: the scorecard dimension wand, the enrich-bullet
   action, the rewrite popover, its prompts/suppression notice, the Apply half
   of the inline-issue bridge, the `BULLET_ENRICHED` analytics event and the
   `probe:rewrite-target` script. The Tip/scroll/pulse bridge remains.
   `TipKind='rewrite'` remains only as a label for surviving tip copy.

7. **Anti-drift coverage.** New tests pin issue derivation and threshold
   boundaries, prompt content and 4,000-char bound, exact single-bullet
   replacement, icon DOM + print simulation, handoff queueing/rate-limit
   behaviour, real SSE parsing of `score_updated`, coalesced refresh, shared
   recompute persistence, list revalidation through the helper, and the
   absence of the retired CTA/action/Apply symbols. `pnpm lint`,
   `pnpm typecheck`, `pnpm test` and `pnpm build` are green.

No migrations, env vars, external services or npm dependencies were added.

## Drift callouts

- **Historical documents are intentionally left alone.** `ADR 0006`, the
  original `inline-issue-surface` plan and earlier drift memos describe the
  Apply/Pro-rewrite path. Rewriting history would make those records less
  truthful. This memo supersedes their AI-edit portions; their Tip, path and
  section-anchor contracts still hold.

- **The path resolver’s job narrowed.** `defaultPathForCriterion()` is no
  longer a rewrite target. It is the fallback scroll/pulse anchor for
  criteria without a measured bullet; exact flagged-bullet paths come from
  `buildBulletIssues()`. Comments and tests were updated to say so, and the
  dotted-path rule is still pinned against a real template render.

- **Revalidation is split by transport, not duplicated.** This is a deliberate
  architectural exception to “one resolver called by every surface”: the
  persisted score still has one write path, but how each caller invalidates
  the page depends on whether it runs inside a Server Action or a streaming
  route. The regression test for the list badge now asserts the helper is
  used rather than looking for a literal `revalidatePath()` in the action.

- **No product scope drift.** The two locked criteria are Impact and Action
  Verb Usage; the resolver is structured for more dimensions but does not
  silently add them. Free access is unchanged. Print and chat behaviour are
  unchanged apart from the successful-edit recompute event.

## Honest limits

- A stale snapshot whose `jevBullets` no longer aligns with the resume
  revision produces **no** icon rather than a guessed one. The next recompute
  restores the marker set.
- A recompute failure after a successful Scout edit is logged and the chat
  turn still succeeds; in that rare case no `score_updated` is emitted, so
  the marker remains until the next recompute or refresh. The successful
  resume revision is never rolled back.
- The automated suite covers the DOM, queue, stream parser and print
  simulation. The authenticated, real-browser smoke on a live variant is
  still the user’s check before pushing.

## Action items

1. Check out `feat/inline-bullet-issues-to-scout` locally and run the manual
   smoke: weak Impact bullet → hover → click → Scout edits only that bullet →
   marker disappears; repeat as a Free user and at the daily limit; verify
   editor print and public share show no icon.
2. Push / open a PR only after that check. The branch is currently local-only
   by request.
3. Do not reintroduce a second AI rewrite control from the old plans. New
   bullet-level advice belongs in `buildBulletIssues()` and Scout.
