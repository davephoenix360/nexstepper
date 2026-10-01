# Chat Agent v2 + AI Parsing Loading Modal — Plan

## Objective

The chat assistant does not behave like an agent. Users say things like
"I don't like the summary on my resume" and get a suggestion back instead of
an edit; they then have to say "now update my resume" and *still* often get no
tool call. Separately, the resume-import flow shows a static "Parsing your
resume…" line with no personality.

This plan does two things:

1. **Make the chat a real agent** — swap the chat onto a stronger model, fix
   five concrete defects in the tool loop, and rewrite the system prompt so the
   assistant acts on intent and can answer product questions.
2. **Replace the AI-parsing loading text** with a modal that has rotating
   emoji headlines and rotating tips (resume craft + cover letters + how to use
   Nexstepper).

The parser model is deliberately **not** touched. `mistral/mistral-nemo` is
correct for the parser (large strict-JSON extraction) and the user confirmed it
parses well. It is a bad *agent* model, and those are different jobs.

## Diagnosis — why the agent does not act

Five independent defects. Any one of them alone breaks the loop; together they
make it feel broken.

| # | Defect | Where | Effect |
|---|---|---|---|
| **1** | `stopWhen` is never set, and the AI SDK defaults to **`stepCountIs(1)`** | `app/api/chat/route.ts` | The model gets exactly one step. If it spends that step calling a tool, the turn ends — it can never read the result and say "Done, I rewrote your summary." This is *the* reason a good tool call still looks like nothing happened. |
| **2** | `editResume` requires a **mandatory `id` on every array entry**, and the resume context sent to the model **contains no IDs at all** | `lib/chat/tools/types.ts` + `buildResumeContext` | The model physically cannot supply a valid `id`. It invents one or omits the field; validation fails; the tool returns `Invalid editResume arguments` and the user sees nothing happen. |
| **3** | `buildMergedData` rebuilds the whole `sections` object from `existing.sections` in **each** conditional spread | `lib/chat/tools/edit-resume.ts` | Later spreads **clobber** earlier ones. A call carrying both `contact` and `experience` silently discards the contact edit. This is "it said it updated the summary and nothing changed." |
| **4** | Tool schema disagrees with `ResumeData`: skills as `{id,name,level}` (real shape is `{name,level,keywords}`), projects with `link` (real key is `url`) | `lib/chat/tools/types.ts` vs `lib/resume-schema/` | AI-authored skills land with **no keywords** (empty categories in the PDF) and project links are dropped. Cast to `any`, so Zod never complains. |
| **5** | History is rebuilt as the v4 `UIMessage` shape with `toolInvocations` + a `Math.random()` `toolCallId`, and tool results are **never sent back** as a `role: 'tool'` message | `app/api/chat/route.ts` | The model sees a malformed transcript and never sees what its tool returned. Multi-turn tool use degrades badly. |

Plus two prompt-level causes:

- The system prompt says *"Call this ONLY when the user explicitly asks for a
  specific change in their own words"* and *"Never call this without user
  instruction."* "I don't like my summary" is an **implicit** request. The
  prompt was hardened for prompt-injection safety and over-corrected into
  instructing the model to be passive.
- *"If the user asks something outside resume help, politely redirect."* There
  is **zero** product knowledge in the prompt, so the agent cannot answer a
  single question about Nexstepper.

### Model choice

`mistral/mistral-nemo` is a **12B** model. It is fine at one-shot structured
extraction and poor at multi-turn instruction following and tool calling. The
constraint that picked it (strict `json_schema` mode + free tier) does not apply
to chat, which uses plain tool definitions.

Verified two ways: the public Gateway catalog for pricing, and the
**authenticated CLI** for account-level availability —

```bash
npx vercel@latest ai-gateway models endpoints inclusionai/ling-3.1-flash --format json
```

> The globally-installed CLI is `45.0.8`, which has **no `ai-gateway`
> subcommand** — it silently falls through to `vercel deploy --help`. Use the
> `npx` form for any Gateway work.

`models endpoints` is the signal that matters, because it reports the
account's own view: live endpoint tags, uptime, and latency. The model-browser
page has twice listed a model as free-tier that this account could not actually
call, so browser metadata is not evidence.

| model | in / out | ctx | tool-use | structured-output | reasoning | free |
|---|---|---|---|---|---|---|
| **`inclusionai/ling-3.1-flash`** | **$0 / $0** | 262K | ✅ | ❌ | none/low/med/high | ✅ |
| `alibaba/qwen3.7-flash` | $0.03 / $0.13 | 991K | ✅ | ✅ | …max | ❌ |
| `inception/mercury-2.5` | $0.04 / $0.15 | 260K | ✅ | ❌ | ✅ | ❌ |
| `mistral/mistral-nemo` (was) | $0.04 / $0.17 | 60K | ✅ | ✅ | ❌ | ✅ |

**Decision: `inclusionai/ling-3.1-flash` as chat primary.** Free, free-tier
eligible, healthy (status 0, 99.96% uptime over 1h), 262K context against
Nemo's 60K — which matters because every turn re-sends the whole resume, so on
Nemo a long resume truncated and the agent started "forgetting" the user's own
data. Its own description: *"hybrid reasoning language model for coding,
multi-step analysis, and tool-using agents. 560B total parameters with 25B
activated."*

**The `structured-output` column is the whole argument.** It is the only reason
Nemo was ever right for the parsers, and it is the reason Ling 3.1 Flash
*cannot* be. The parser/chat split is a capability boundary, not a
preference — which is why `PARSER_MODEL` is untouched in this plan.

**Fallback chain** (cross-provider, so one incident can't take chat down):
`alibaba/qwen3.7-flash` → `inception/mercury-2.5` → `mistral/mistral-nemo`.
Nemo is last deliberately: it is the only model *proven* to work on this
account. Applied via the gateway's own `providerOptions.gateway.order` rather
than a retry loop, because once bytes are streamed to the client we cannot
silently restart on a different model — and the failure we most need to
survive (model-not-available → 403) surfaces immediately.

**Latency.** Ling is ~4–5× slower to first token (tft p50 2.3s vs Nemo's
0.44s) but generates 2–5× faster (93 vs 19–46 tok/s). A multi-step turn that
completes in one pass should be a net wash, and the streaming UI covers the
perceived wait. Ling also exposes a `reasoning` effort knob; default to
`none` and only A/B `low` if tool calls prove flaky — tft is already 2.3s.

## User-visible behavior

- "I don't like the summary" → the agent proposes a rewrite **and calls the
  tool**, then confirms what it changed. No second prompt required.
- "Make it more technical" / "add Python to my skills" / "I worked at Acme as
  Staff Engineer from 2023" → each maps to a surgical edit that preserves
  everything the user did not mention.
- "What's a master resume?" / "How do variants work?" / "Is Pro out yet?" →
  answered from a product-knowledge block in the system prompt.
- Long resumes no longer break the edit call (no required IDs, no full-array
  echo, no clobbering).
- AI import shows a modal with a rotating emoji headline and a rotating tip
  carousel (resume craft, cover letters, Nexstepper usage) while it parses.

## Scope (in)

- New `CHAT_MODEL` / `CHAT_FALLBACKS` in `lib/ai/providers.ts`.
- `editResume` rewritten as **surgical operations** (set basics, add/update/
  remove work, education, skills, projects, plus certificates/languages/
  interests/awards and a `clearSection` escape hatch).
- Merge logic rewritten so every operation accumulates instead of clobbering.
- Multi-step tool loop (`stopWhen`), correct `ModelMessage` history, persisted
  tool-call IDs, model fallback, larger `maxOutputTokens`.
- System prompt rewritten: agentic posture, interpretation of implicit
  intent, product knowledge, retained injection hardening.
- Editor refreshes live after a successful `editResume` / `switchTemplate`.
- `AiParsingModal` with headline rotation + tip carousel, wired into the
  import flow.

## Non-goals (out of this plan)

- **Changing `PARSER_MODEL`.** Parsing works; do not touch it.
- Streaming tool *arguments* (today the badge renders after the call
  completes). The route already buffers; real-time argument streaming is a
  separate UX slice.
- Chat-specific Pro gating or quota changes — the 20-turn/day Free quota is
  untouched.
- Cover-letter generation. A locked v1 non-goal (AGENTS.md). The loading-modal
  tips may *discuss* cover letters as advice only.
- A tool for creating variants from chat. Tempting, but it needs the
  JD-parse + variant-creation action wired behind a trust boundary; that is
  its own plan.
- i18n for the tips. Multi-language is a locked non-goal.

## Architecture

### Tool redesign

One `editResume` tool, many optional operations. **No IDs, ever** — the model
never has to echo existing content back, so there is nothing to hallucinate,
nothing to truncate, and no full-array replacement to get wrong.

```
setBasics?    { name?, headline?, email?, phone?, website?, linkedin?,
                github?, city?, region?, countryCode?, summary? }
addWork?      [{ company, role, location?, startDate?, endDate?, highlights? }]
updateWork?   [{ matchCompany, matchRole?, set: { role?, location?,
                startDate?, endDate?, highlights?, description? } }]
removeWork?   [{ company, role? }]
addEducation? / removeEducation?
addSkills?    [{ category, keywords[] }]      // merges into existing category
removeSkills? [{ category, keywords[] }]
addProject? / updateProject? / removeProject?
addCertificates? / addLanguages? / addInterests? / addAwards?
clearSection? ['work' | 'education' | ... ]
```

`addSkills` **merges** keywords into a matching category instead of replacing
it, which is what the real `{name, level, keywords}` schema wants and what the
old `{id,name,level}` tool silently destroyed.

Entries are located by `matchCompany` / `matchRole` / institution — human
strings the model can actually see in the resume context. A match failure is
reported back to the model as a tool result so it can retry with a different
matcher instead of silently doing nothing.

### Loop

```
user msg
  → streamText({ stopWhen: stepCountIs(6) })
      step 1: model calls editResume        → executor runs, returns result
      step 2: model reads result, confirms in prose
  → persist assistant content + toolCalls (with stable ids) + toolResult
```

Tool results go back into history as proper `role: 'tool'` messages with the
persisted IDs, so turn 2+ can reason about what it already did.

## Files

- **New:** `docs/plans/chat-agent-v2.md`, `components/resumes/ai-parsing-modal.tsx`,
  `lib/resume-tips.ts`
- **Changed:** `lib/ai/providers.ts`, `lib/chat/tools/types.ts`,
  `lib/chat/tools/edit-resume.ts`, `lib/chat/tools/index.ts`,
  `lib/chat/system-prompt.ts`, `app/api/chat/route.ts`,
  `components/chat/chat-bubble.tsx`, `components/chat/chat-message.tsx`,
  `app/(dashboard)/dashboard/resumes/_components/create-master-form.tsx`
- **Deleted:** none
- **DB / migrations:** none. `chat_messages.tool_calls` already has an `id`
  field that the route was simply not writing.

## Risks

1. **`ling-3.1-flash` could 403 on this account** (precedent: two models did).
   → Fallback chain down to the proven Nemo; agentic fixes (1–5) help on any
   model, so the feature degrades in quality, not in function.
2. **Aggressive acting could surprise users** (rewrites they didn't want).
   → System prompt distinguishes surgical from destructive ops; `clearSection`
   and `remove*` require explicit user language. Every call is reversible via
   revisions, and the agent reports exactly what it changed.
3. **A 262K context model could be slower** than Nemo on cold cache.
   → `inception/mercury-2.5` is a fast fallback; tip modal and streaming
   already cover perceived latency.

## Acceptance criteria

- [x] `editResume` merged data survives a call that sets `basics` **and**
      `education` (regression test for the clobber bug). → `merge-resume.test.ts`
- [x] AI-authored skills round-trip `keywords`; project `url` survives. → same
- [x] No `id` is required anywhere in the `editResume` schema. → `tools-schema.test.ts`
- [x] `streamText` is called with `stopWhen` > 1. → `stepCountIs(CHAT_MAX_STEPS)`
- [x] Tool results are replayed as `role: 'tool'` with persisted IDs; no
      `Math.random()` tool-call IDs in the request path.
- [x] System prompt contains Nexstepper product knowledge and no
      "politely redirect" instruction; still contains the injection guard.
- [x] `CHAT_MODEL !== PARSER_MODEL`.
- [x] Parsing modal shows a headline and a tip, and tips rotate on a timer.
- [x] `pnpm typecheck` clean; full unit suite green. → **1090/1090, 86 files**

## Test plan

- **Unit:** merge-logic tests (multi-op accumulation, skill merge, match
  failure, clearSection), tool-schema tests (no required ids, keywords/url
  accepted), system-prompt tests (product knowledge present, passivity
  removed, injection guard intact), tips tests (rotation, all tips
  non-empty). → 26 + 10 + 19 + 12 = 67 tests, all green.
- **Integration:** none — the chat route is not currently covered by
  integration tests and adding a DB-backed harness is out of scope.
- **Manual smoke:** sign in → open resume → ask "I don't like my summary" →
  confirm a revision was written and the editor refreshed → ask a product
  question → import a PDF and watch the modal.

## Rollback plan

Every change is a revert of this branch. `PARSER_MODEL` is untouched, so
reverting restores the previous chat behaviour and leaves parsing intact. The
modal is a self-contained component; if it misbehaves, drop
`<AiParsingModal>` from the import form and the parse path still works.

## Open questions

- **Resolved 2026-10-01.** The CLI confirmed `ling-3.1-flash` is free-tier and
  healthy on this account (endpoint tagged `free`, status 0, 99.96% uptime), so
  the primary should work. The fallback chain remains as insurance, and
  `mistral/mistral-nemo` is last in it because it is the only model proven on
  this account.
- **Not yet verified end-to-end.** The multi-step tool loop (`stopWhen`) and the
  agentic prompt have never been exercised against the live gateway — every
  claim about them is from reading the code and the SDK types, plus unit tests
  on the pure pieces. First real run is the actual test.
- **Ling's `reasoning` effort knob** is left at the default (`none`). If tool
  calls are still unreliable after this ships, try `low` before considering a
  paid model — tft is already ~2.3s, so this is not free.
