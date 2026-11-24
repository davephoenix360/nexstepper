# Inline bullet issues → Scout — Plan

> Plan template: [`AGENTS.md` § Planning discipline](../../AGENTS.md#planning-discipline).
> Branch: `feat/inline-bullet-issues-to-scout`. Commit footer: `Plan: docs/plans/inline-bullet-issues-to-scout.md`.

## Objective

The ATS scorecard currently tells the user which bullets are weak in a
hover tooltip and, for Pro users, offers a small “Rewrite with AI”
popover on the dimension row. That puts the issue in one place and the
fix in another, and it makes the scorecard — not the resume — the place
where the user has to act.

This plan moves the issue to the resume itself. Work bullets that the
scorer has actually measured as weak get a small attention icon on their
left. Hovering or keyboard-focusing the icon explains the problem and the
fix. Clicking it opens **Scout**, the main chat agent, and sends a
bullet-specific improvement request through the normal chat pipeline.

The small AI rewrite popover and its Pro-only server action are retired.
Free users get the same handoff, subject to the existing chat quota and
free model chain.

## User-visible behavior

1. The user opens a **variant** with a scored snapshot that contains
   per-bullet Jev data.
2. Bullets with a measured Impact or Action Verb Usage problem show a
   small attention icon to their left in the editor.
   - One icon per bullet, even if two criteria flag the same bullet.
   - The icon is editor-only and never prints.
3. Hovering or focusing the icon shows a short explanation:
   - **Impact:** “This reads as a task, not an outcome. Say what changed
     because of this work, not just what you did.”
   - **Action Verb Usage:** “This bullet opens flatly. Lead with a stronger
     action verb.”
4. Clicking the icon:
   - opens Scout’s chat panel,
   - sends a prepared prompt scoped to that exact bullet,
   - does **not** open any intermediate AI modal.
5. Scout explains what it will change, uses the resume-editing tool to
   replace only that bullet, and measures the score again.
6. The saved revision appears in the editor through the existing
   `resume_updated` refresh path. The score and the marker set refresh
   with it; the fixed bullet loses its icon when the issue is gone.
7. If the user is at their daily chat limit, the normal chat limit message
   appears — the handoff does not bypass quota.
8. The scorecard’s hover tooltip remains, but becomes dimension-level
   guidance: e.g. “3 of 8 bullets describe a task rather than an outcome —
   see the marked bullets.” Clicking the dimension row still scrolls and
   pulses the relevant section, but no longer calls AI.

Locked product decisions:

- **Click sends directly to Scout.** No confirmation popover.
- **Initial criteria: Impact and Action Verb Usage.** The architecture is
  criterion-aware so more dimensions can be added later.
- **Free users have access.** No `requirePro()` gate in the new flow.

## Scope (in)

- A pure, structured per-bullet issue resolver built from the persisted
  score breakdown.
- Attention icons in the shared editable bullet row, across all six
  templates.
- Hover/focus explanation and click-to-Scout handoff.
- A repeatable chat handoff channel, distinct from the one-shot
  `?autotailor=1` prompt.
- A bullet-specific prompt builder.
- A surgical `replaceWorkHighlight` operation on the chat `editResume`
  tool.
- Deterministic score recomputation after a successful handoff edit.
- Retirement of the old dimension-row AI rewrite popover and its
  Pro-only action.
- Tests for every boundary listed under “Test plan”.

## Non-goals (out of this plan)

- **Markers for every ATS criterion.** Only criteria with measured,
  bullet-level evidence get icons in v1. Skills, headline, summary,
  eligibility gates and project fields keep their existing scorecard /
  inline-tip treatment.
- **Changing the scoring engine.** This plan consumes `jevBullets`; it does
  not change thresholds, weights or model calls.
- **A new DB table or persisted issue state.** Issues are derived from the
  persisted breakdown, so there is nothing to migrate or reconcile.
- **Inline markers in preview/share/read-only rendering.** This is an
  editor affordance. It is hidden in print and does not appear on the
  public share link.
- **A second AI rewrite endpoint.** All AI work goes through Scout and the
  existing `/api/chat` route.
- **Changing the Free model chain or quota.** The handoff uses what is
  already there.
- **Auto-applying Scout’s suggestion.** The user still sees Scout’s
  explanation and the normal tool-result “Changes applied” affordance.

## Architecture

### Current flow being replaced

```text
ScorecardPanel (Impact row)
  → DimensionBar click / wand
  → ScorecardClient
  → useInlineIssueController.trigger()
  → inline tip + InlineIssuePopover (Pro only)
  → enrichBulletAction()
  → 3 rewrites
  → nexstepper:inline-issue:apply
  → form.setValue()
```

### New flow

```text
ScoreBreakdown.jevBullets + ResumeData
  → buildBulletIssues()                        [pure]
  → VariantIssuesProvider                      [editor context]
  → BulletAttention (per flagged bullet)
      hover/focus → reason + fix
      click       → askScout(request)
  → ChatHandoffProvider
  → ChatBubble.handleSend(prompt)
  → /api/chat (auth, quota, SSE, persistence)
  → Scout calls editResume.replaceWorkHighlight
  → executeEditTool saves one revision
  → shared recompute helper persists new snapshot
  → score_updated + resume_updated SSE
  → router.refresh()
  → markers and scorecard agree with the new resume
```

### Five pieces

| piece | file | job |
|---|---|---|
| issue source | `lib/scoring/bullet-issues.ts` | derive structured bullet issues from the breakdown |
| editor context | `components/editable/variant-issues-context.tsx` | publish issues by dotted editor path |
| inline affordance | `components/editable/bullet-attention.tsx` | icon, tooltip, click-to-Scout |
| chat handoff | `components/chat/chat-handoff-provider.tsx` | repeatable “ask Scout” requests |
| surgical edit | `lib/chat/tools/types.ts` + `merge-resume.ts` | replace one highlight, not the whole array |

### 1. The issue source — one resolver, not rendered text

`DynamicTips` is `Partial<Record<SubCriterionKey, ReactNode>>`. It is for
display, not for deriving targets. Parsing it would recreate exactly the
class of bug where the advice names one bullet and the action edits
another.

New pure module:

```ts
// lib/scoring/bullet-issues.ts
export type BulletIssue = {
  path: string;              // sections.work.0.positions.2.highlights.1
  criterion: SubCriterionKey;
  dimensionLabel: string;    // "Impact" | "Action Verb Usage"
  reason: string;
  fix: string;
  currentText: string;
  company?: string;
  role?: string;
  occurrence: number;        // context only; the dotted path is authoritative
};

export function buildBulletIssues(
  breakdown: ScoreBreakdown,
  resume: ResumeData
): BulletIssue[];
```

Implementation contract:

- Use `collectHighlightEntries(resume)` so paths are aligned with
  `breakdown.jevBullets` positionally.
- Use the same thresholds as the current dynamic tips:
  - `impact < 1.5` → `Accomplishment Focus`
  - `opening < 1.5` → `Action Verb Usage`
- Extract those thresholds into a shared constant so the tip, the issue
  resolver and the match breakdown cannot drift.
- Derive `company` / `role` from the dotted path by looking up the work
  entry and position; the prompt needs them as fallback targeting hints.
- Aggregate by path: if both criteria flag the same bullet, return two
  issues for that path and let the icon combine their reasons.
- If `breakdown.jevBullets` is absent, return `[]`. Do not guess from the
  prose tip and do not show an icon without a measurement.

`buildDynamicTips()` and `buildMatchBreakdown()` must consume this
resolver (or assert agreement with it in tests) so that:

- the tooltip’s “3 of 8” count equals the number of icons;
- the scorecard’s Impact target equals the first Impact issue path;
- the prompt sent to Scout names the icon’s bullet.

This is the repo’s existing **one value, one resolver** rule applied to a
new surface.

### 2. Editor context and icon placement

`BulletList` is the one primitive through which all editable bullet
lists render: five templates use `FieldBullets → BulletList`, Classic uses
`BulletList` directly. It already owns the per-row remove button, so the
attention icon belongs there.

Add:

```tsx
// components/editable/bullet-list.tsx
const leafPath = `${path}.${i}`;
const issues = useBulletIssues(leafPath);

<li className="group relative ...">
  {issues.length > 0 && (
    <BulletAttention key={leafPath} path={leafPath} issues={issues} />
  )}
  <EditableText path={leafPath} ... />
  {/* existing remove button */}
</li>
```

Non-negotiables:

- The icon is a **sibling** of `EditableText`, never a child. Inline-issue
  and rich-text code read `textContent` from
  `[data-testid="editable-${path}"]`; icon text would corrupt that.
- `type="button"`, `aria-label`, `data-testid="bullet-issue-${path}"`.
- `no-print`, not merely `print:hidden`, matching editor chrome.
- `onMouseDown={(e) => e.preventDefault()}` so clicking it cannot collapse
  a text selection in a neighbouring field.
- Radix `Tooltip` for hover/focus; click calls `askScout()` directly.
- No hard-coded left offset that assumes one template’s padding. Verify
  visually in `/dev/design-lab` across all six templates.

Provider:

```tsx
// components/editable/variant-issues-context.tsx
<VariantIssuesProvider issues={bulletIssues}>
  <EditableResume ... />
</VariantIssuesProvider>
```

The provider must **derive from the prop**, not copy it into
`useState(initialIssues)` on mount. Otherwise an RSC refresh after Recompute
or a Scout edit would leave stale icons — the same trap as
`useForm({ defaultValues })`.

### 3. Repeatable chat handoff

`autoPrompt` is deliberately one-shot: it opens the panel and sends only
when there are zero sessions, which is right for `?autotailor=1` and wrong
for repeated bullet clicks.

New client provider:

```ts
// components/chat/chat-handoff-provider.tsx
type ChatHandoffRequest = {
  id: string;
  prompt: string;
  label?: string;       // e.g. "Improve this Impact bullet"
  targetPath?: string;
};

const { askScout } = useChatHandoff();
```

`ChatBubble` consumes the current request:

- open the panel;
- wait for `sessionsLoaded`;
- if a turn is streaming, queue the request until `isStreaming` is false;
- send through the existing `handleSend(request.prompt)` path;
- track handled request IDs in a ref so a re-render cannot send twice;
- suppress `autoPrompt` for that mount if a handoff was consumed;
- let the existing quota check produce the limit notice.

No new API route, no new auth path, no new model selection. The free model
chain comes from `resolveChatModelPlan(plan)` as it does for every chat
turn.

### 4. Bullet-specific prompt

New pure module:

```ts
// lib/chat/bullet-improvement-prompt.ts
buildBulletImprovementPrompt(issue: BulletIssue): string
```

The prompt must be bounded to the `/api/chat` 4,000-character limit and
contain:

- the exact current bullet text;
- company/role context when available;
- why it was flagged;
- what to change;
- “change only this bullet”;
- “do not invent facts or metrics”;
- “if you need a fact, ask me”;
- instruction to call `editResume.replaceWorkHighlight` with the exact `path`
  and `oldText` from the issue; company/role/occurrence are context, not
  selectors;
- instruction that the app recomputes the score automatically and that Scout
  must not call `getAtsScore` in the handoff turn.

The JD does not need duplicating: the chat system prompt already carries
the canonical job context and score provenance.

### 5. Surgical single-bullet edit

Today `updateWork.set.highlights` replaces the **whole** array for a role.
A handoff saying “improve this bullet” would therefore ask the model to
echo every other bullet back, which is a known source of silent collateral
edits.

Add a new operation to `editResume`:

```ts
// lib/chat/tools/types.ts
replaceWorkHighlight: z.array(
  z.object({
    path: z.string().regex(/^sections\.work\.\d+\.positions\.\d+\.highlights\.\d+$/),
    oldText: z.string().min(1),
    newText: z.string().min(1)
  })
).optional()
```

`buildMergedData()` implementation:

- parse `path` into `{ workIndex, positionIndex, highlightIndex }`;
- read that one leaf directly — never match by company or title;
- normalize `oldText` by trim + whitespace collapse and require it to still
  match the addressed leaf (freshness check);
- replace only that element;
- add an `applied` line naming the change;
- add a `warnings` line and do nothing when the path is gone or text is stale.

Company/title matching was tried first and failed the reported case: one
company held both `Senior Software Engineer` and `Software Engineer`, so a
substring selector matched two positions. The dotted path is already carried
by every measured issue and addresses one leaf unambiguously.

The existing conflict rule stays: `applied.length === 0` means no revision
is written, and the warning goes back to the model so it can retry rather
than claim success.

Tests pin that every other highlight and every other field is unchanged.

### 6. Recompute after a successful handoff edit

A bullet edit that leaves the old score snapshot in place would leave the
old icon on the screen, which is worse than no icon.

Extract the scoring/persistence body of `recomputeScoreAction` into a
shared server helper, e.g.:

```ts
// lib/scoring-async/recompute-variant.ts
recomputeVariantScore(resumeId, userId): Promise<{
  breakdown: ScoreBreakdown;
  tips: DynamicTips;
  matchBreakdown: MatchBreakdown;
}>
```

Use it from:

- `app/(dashboard)/dashboard/resumes/[id]/score-actions.ts` (Recompute button);
- `app/api/chat/route.ts` after a turn whose `replaceWorkHighlight` tool
  succeeded.

The chat route then emits a `score_updated` SSE event. `useChatStream`
gains an `onScoreUpdated` callback; `ChatBubble` coalesces it with the
existing `resume_updated` refresh into one `router.refresh()`.

No second scorer, no second persistence path. This follows the canonical
snapshot rule in `AGENTS.md` §10.

### 7. Retire the old surface

Once the new path is green:

- Remove `showProRewriteCta` from `DimensionBar` / `ScorecardPanel` and the
  wand icon from the scorecard row.
- Simplify `useInlineIssueController` to the tip/pulse behavior, or replace
  it with a small `triggerInlineIssueTip()` helper.
- Delete:
  - `lib/inline-issue/inline-issue-popover.tsx`
  - `app/(dashboard)/dashboard/resumes/[id]/_components/enrich-bullet-action.ts`
  - `lib/inline-issue/prompts.ts`
  - the Pro-rewrite branches of `suppression-notice.ts`
- Keep the inline tip and section pulse for every user, including Free.

## Files

- **New:**
  - `lib/scoring/bullet-issues.ts`
  - `lib/chat/bullet-improvement-prompt.ts`
  - `components/editable/variant-issues-context.tsx`
  - `components/editable/bullet-attention.tsx`
  - `components/chat/chat-handoff-provider.tsx`
  - `lib/scoring-async/recompute-variant.ts`
  - `tests/unit/scoring/bullet-issues.test.ts`
  - `tests/unit/chat/bullet-improvement-prompt.test.ts`
  - `tests/unit/chat/replace-work-highlight.test.ts`
  - `tests/interaction/bullet-attention.test.tsx`
- **Changed:**
  - `lib/scoring/tips.tsx`
  - `lib/scoring/highlight-paths.ts` (if a shared threshold/occurrence helper belongs here)
  - `lib/inline-issue/build-match-breakdown.ts`
  - `lib/inline-issue/use-inline-issue-controller.ts`
  - `components/editable/bullet-list.tsx`
  - `components/editable/editable-resume.tsx` (only if provider placement requires it)
  - `components/scorecard/dimension-bar.tsx`
  - `components/scorecard/scorecard.tsx`
  - `app/(dashboard)/dashboard/resumes/[id]/_components/scorecard-client.tsx`
  - `app/(dashboard)/dashboard/resumes/[id]/page.tsx`
  - `app/(dashboard)/dashboard/resumes/[id]/score-actions.ts`
  - `components/chat/chat-bubble.tsx`
  - `components/chat/use-chat-stream.ts`
  - `lib/chat/tools/types.ts`
  - `lib/chat/tools/merge-resume.ts`
  - `app/api/chat/route.ts`
- **Deleted after migration:**
  - `lib/inline-issue/inline-issue-popover.tsx`
  - `app/(dashboard)/dashboard/resumes/[id]/_components/enrich-bullet-action.ts`
  - `lib/inline-issue/prompts.ts`

## DB / schema

- Migrations: none.
- New tables / columns / indexes: none.
- Env vars: none.

Existing persisted fields are sufficient:

- `score_snapshots.breakdown` carries `jevBullets`;
- `score_snapshots.matchBreakdown` and `dynamicTips` remain for the
  scorecard;
- resume revisions remain the source of truth for bullet text.

## Dependencies

- npm packages: none.
- External services: none.
- Env keys to add to `.env.example`: none.

Radix Tooltip is already in the UI stack.

## Risks

1. **The model edits the wrong bullet.**
   - Mitigation: `replaceWorkHighlight` targets the exact dotted path; a
     stale `oldText` fails with a warning; tests cover duplicate bullet text
     and overlapping role titles at one company, and assert no other field
     changes.
2. **The icon comes from a different computation than the tooltip.**
   - Mitigation: one `buildBulletIssues()` resolver feeds both; anti-drift
     tests assert counts and first-target equality.
3. **The marker outlives the fix.**
   - Mitigation: server-side recompute after a successful handoff edit,
     `score_updated` SSE, one coalesced `router.refresh()`.
4. **The handoff fires twice or after navigation.**
   - Mitigation: request IDs in a ref, one-shot consumption, explicit queue
     while streaming, no URL state for handoff requests.
5. **Free users hit an unexpected paywall.**
   - Mitigation: no Pro check on the new path; the only limit is the
     existing chat quota, with the existing limit copy.
6. **The icon breaks print or template layout.**
   - Mitigation: `no-print`, sibling-of-`EditableText` placement, print
     cleanliness test, visual pass in the design lab across all six
     templates.

## Acceptance criteria

- [x] A scored variant with `jevBullets` shows icons only on bullets with
      `impact < 1.5` or `opening < 1.5`.
- [x] A summary of all flagged bullets is shown once per bullet when two
      criteria flag the same text.
- [x] Hover and keyboard focus show the reason and the fix.
- [x] Click sends a prompt to Scout immediately; no intermediate AI modal
      appears.
- [x] Scout applies the change through `replaceWorkHighlight`, changing
      only the flagged bullet.
- [x] Scout asks for missing facts instead of inventing metrics.
- [x] Free users with quota can complete the handoff; users at the limit
      see the normal chat limit message.
- [x] After the edit, the resume revision, score snapshot and icon set all
      reflect the new state without a manual page reload.
- [x] Scorecard tooltip counts and icon counts agree.
- [x] No attention icon appears in print, preview/share, or read-only
      rendering.
- [x] The dimension-row wand and the old enrich action are gone.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` are green.

## Test plan

- **Unit — issue derivation**
  - `tests/unit/scoring/bullet-issues.test.ts`
  - path alignment with `collectHighlightEntries`;
  - threshold boundaries;
  - both criteria;
  - aggregation by path;
  - no `jevBullets` → no issues;
  - agreement with `buildDynamicTips` and `buildMatchBreakdown`.
- **Unit — prompt and tool**
  - `tests/unit/chat/bullet-improvement-prompt.test.ts`
  - `tests/unit/chat/tools-schema.test.ts` (`replaceWorkHighlightSchema`)
  - `tests/unit/chat/merge-resume.test.ts` (`replaceWorkHighlight`)
  - `tests/unit/scoring/highlight-paths.test.ts` (`parseWorkHighlightPath`)
  - exact prompt content and 4,000-char bound;
  - single-bullet replacement by exact path;
  - duplicate bullet text and overlapping role titles at one company;
  - no-op writes no revision;
  - other highlights and fields untouched.
- **Interaction**
  - `tests/interaction/bullet-attention.test.tsx`
  - icon rendered beside a real template bullet;
  - hover/focus text;
  - click dispatches exactly one handoff request;
  - no-print class;
  - print simulation removes the icon.
- **Chat handoff**
  - `tests/interaction/chat-handoff-provider.test.tsx`
  - `tests/interaction/chat-bubble-handoff.test.tsx`
  - `tests/interaction/use-chat-stream-score-events.test.tsx`
  - opens panel;
  - waits for sessions;
  - queues while streaming;
  - does not re-send on re-render;
  - respects the quota path;
  - coalesces `resume_updated` + `score_updated` into one refresh.
- **Retired surface**
  - `tests/unit/inline-issue/retired-rewrite-surface.test.ts`
  - no scorecard rewrite CTA;
  - no Apply half of the bridge;
  - old action/popover/prompt/probe files gone;
  - no rewrite analytics event or script.
- **Manual smoke**
  - Variant with a known weak Impact bullet → icon → hover → click →
    Scout edits only that bullet → marker disappears.
  - Same as Free user.
  - Same at the daily limit.
  - Print preview from editor and share link show no icon.
  - Recompute button refreshes icons.

## Rollback plan

No migrations and no env changes, so rollback is a clean revert of the PR.

If the new flow misbehaves in production but the code should stay:

1. Stop rendering `BulletAttention` from `BulletList` — one-line guard.
2. Leave `buildBulletIssues()` in place; it is pure and harmless.
3. Restore the scorecard’s previous tooltip copy from the prior commit if
   the shortened wording is confusing.

If Scout’s single-bullet edit is the problem, remove
`replaceWorkHighlight` from the tool schema; the rest of the chat remains
unchanged because the operation is additive.

A drift memo is required after ship:
`docs/drift/YYYY-MM-DD-inline-bullet-issues-to-scout.md`.

## Open questions

None. Product decisions are locked:

- direct send on click;
- Impact + Action Verb Usage first, with the resolver designed for later
  dimensions;
- Free access through the existing chat quota.
