# AI agent v3 — plan

Status: **proposal, not started.** Written 2026-10-21 after a manual
testing session on the CleerDental variant. Nothing here is implemented.

Drift for the bugs that prompted this: `docs/drift/2026-10-21-*.md`.

---

## 1. What this is trying to be

The competitor workflow we are replacing:

1. copy resume
2. copy job description
3. paste both into ChatGPT
4. describe vaguely what you want
5. copy the result back
6. reformat by hand because ChatGPT returned prose, not a document

**Step 6 is where people give up.** The value we sell is not "an LLM
knows some words about resumes". It is steps 1–6 *collapsed into zero*:
the agent already has the resume, already has the JD, and writes the
result back into the document the user will actually submit.

That framing sets the bar for everything below. A feature that does not
remove a step for the user is not worth building for this agent.

## 2. Persona

Currently the system prompt is a set of rules. It needs an identity, and
the identity should be a **role with real standards**, not a helpful
assistant:

- **Resume writer** — knows that a bullet is `<action> + <how> +
  <measurable outcome>`, that "team lead" is a weasel word, that
  responsibilities are not accomplishments
- **Resume reviewer / HR screener** — knows what gets a resume binned in
  the first six seconds: date gaps, unexplained title changes, a
  summary that restates the title, no metrics anywhere
- **Recruiter for the target role** — reads the JD, then reads the
  resume, and can say "here is the gap between them"

Behavioural consequences, all of which are testable:

- **Be opinionated.** "Your summary is weak because it lists job titles
  instead of outcomes" is more useful than "consider strengthening your
  summary". Do not hedge into uselessness.
- **Explain the edit.** Say what changed and why, in a sentence, every
  time it calls a tool. The user is learning, not just clicking accept.
- **Never invent.** No fabricated metrics, no invented employers, no
  skills the user has not evidenced. If a bullet needs a number and we
  do not have one, *ask* — that is the single most valuable question the
  agent can ask.
- **Respect the user's content.** Refuse to invent; ask instead.

## 3. Context it currently does not have

| needs | has it? | fix |
|---|---|---|
| resume content | yes | — |
| job description | yes (via `jobContext`) | — |
| **template list** | **no** | inject registry into the system prompt at request time |
| **ATS score** | **no** | new read tool |
| **page settings** | **no** | new read/write tools |
| print settings | no | same as page settings |
| which templates are ATS-safe | no | registry has `atsSafe` — say so in the prompt |
| target role / seniority | partially (`roleFamily`, `seniorityLevel` exist) | surface them explicitly |

**Template list must be dynamic.** `lib/chat/tools/index.ts` currently
hardcodes template ids into the `switchTemplate` description, which is
exactly how Jake became unreachable. Build the list from
`templateRegistry` *at request time*, including each template's `name`,
`atsSafe`, `category`, and `maxPages` — so the agent can say "Jake is
serif and single-column, good for ATS" rather than just naming an id.

## 4. Tools it should have

Existing: `editResume` (16 ops), `switchTemplate`, `mergeResume`.

Missing, in rough priority order:

1. **`getAtsScore(resumeId)`** — read the latest `score_snapshots` row
   and the 4-dimension breakdown. The agent can currently edit a resume
   it cannot see the score of, which is the most obvious missing sense.
2. **`recomputeAtsScore(resumeId)`** — after a big edit, the score is
   stale. The agent should be able to refresh it and tell the user what
   moved. *(Also fixes a real product gap: nothing recomputes the score
   after an AI edit today.)*

   **This tool costs the user nothing.** Verified 2026-10-21: the ATS
   engine makes **zero** AI Gateway calls. `lib/scoring/` is pure
   TypeScript — BM25, dictionaries, structural checks, weighted
   composition — and there is a purity test (`tests/unit/scoring/purity.test.ts`)
   that fails the build if an AI call is introduced there. The hybrid
   path's semantic half runs `Xenova/all-MiniLM-L6-v2` **locally** via
   `@huggingface/transformers` + ONNX (dynamic import, ~25 MB model
   cached in `/tmp`), which costs Vercel CPU time and cold start, not
   tokens. So there is nothing to gate: keep ATS recompute free for
   everyone, as decided. The only AI cost in the JD path is the
   one-time `mustHaveSkills` extraction when the JD is first pasted —
   which already happens, and is not part of recompute.

3. **`getPrintSettings` / `updatePrintSettings`** — margin, line height,
   font size, section spacing. "Make it fit on one page" is a request we
   currently cannot answer.
4. **`getResumeMeta`** — what templates exist, what's ATS-safe, what the
   current page length is. Feeds §3.
5. **`validateResume`** — dry-run the schema, return the problems without
   writing. Lets the agent fix a broken field before the user hits Save
   and gets a wall of errors.

**Proactive repair.** The user's example: *"if a user is missing a field
in their resume and cannot save, our ai agent should be proactive enough
to fix it."* This is a first-class behaviour, not a tool:

- on session start, validate
- if invalid: say so specifically ("your Work section has a role with no
  start date"), then offer the concrete fix
- never leave the user with an unsaveable document and no explanation

## 5. The first-session analysis (the expensive work)

Agreed: the deep analysis should run **once per (resume, JD) pair**, not
every turn.

Shape:

- **Trigger:** the moment the user pastes the JD and the variant is
  created — which is when resume + JD + ATS score are all simultaneously
  available. That is the earliest point the analysis can run, and it is
  the point the user already expects to wait (see the Q3 decision).
- **Runs once, cached** against the JD hash so editing the resume does
  not re-trigger it.
- **Produces** a structured critique the agent can reference for the rest
  of the conversation: per-dimension gaps, the top N highest-impact
  fixes ranked, and explicit "you already have this" evidence for things
  it should NOT ask about.

Cost matters: this is several model calls. Gate it behind the Pro plan
and run it lazily — do not block session start on it. Stream it.

## 6. Resume best practices to encode

Things the agent should know and apply without being asked:

- **Length.** 1 page early career, 2 pages up to ~15 years. Never 3
  without a reason. This matters most here because users start from a
  general resume with everything on it — **finetuning DOWN is a primary
  operation**, not a trim.
- **Bullets.** Action verb first. Past tense. One idea per bullet. A
  metric where one legitimately exists — and ask when it does not.
- **Summary.** 2–4 lines, no job-title list, no "hard-working" claims.
- **Skills.** Mirror the JD's language where honest. Do not keyword-stuff
  with skills the user lacks.
- **Dates.** Consistent format, no unexplained gaps.
- **Contact.** One location, no full street address, no age, no photo,
  no marital status. *(Several regions now treat age/marital status as
  discriminatory — this is a real compliance point, not taste.)*
- **Section order.** Reverse-chronological experience; education moves
  up only for students/recent grads.
- **Per-industry conventions.** Tech leans skills+projects; healthcare
  uses licensure/certifications; academia uses publications; trades use
  licences/certifications. The JD's `roleFamily` and
  `domainSignals` already carry enough signal to pick one.

The industry table should be a small structured file the system prompt
compacts from, not prose pasted into the prompt every request.

## 7. Sequencing

**Phase A — context and correctness. ✅ DONE** (branch
`feat/chat-agent-v3-phase-a`)

- ✅ dynamic template list in the system prompt — and, more importantly,
  the template ids are now derived from `templateRegistry` everywhere
  they were previously hand-written. There were **four** stale lists, not
  one: the tool description, the prompt's `AVAILABLE_TEMPLATES`, the
  executor's validator, and — the strictest of all — the `z.enum([...])`
  in the tool-argument schema, which meant the model could not even
  *name* a template that was missing from it.
- ✅ `getAtsScore` read tool — lets the agent re-measure the score after
  its own edit instead of guessing whether the edit helped. It uses the
  hybrid scorer (matching the scorecard the user is looking at) with a
  fallback to the pure sync scorer, and it persists a snapshot so the
  scorecard stays current.
- ✅ persona rewrite of `lib/chat/system-prompt.ts` — writer / reviewer /
  recruiter framing, the direct-request vs agent-noticed split, an
  explicit "never invent, ask for the number" rule, and a resume-craft
  section (length, bullets, summary, skills, dates, contact rules,
  per-industry conventions).

Phase B — capability. ✅ DONE (branch `feat/chat-agent-v3-phase-a`)

- ✅ print-settings read/write tools — the agent can finally answer "make it
  fit on one page"
- ✅ `validateResume` dry-run — validates the stored resume, and optionally
  a PROPOSED edit before committing it
- ✅ `executeEditResume` now returns the real Zod field paths on a rejected
  save, instead of a generic "Failed to save resume changes". The model
  could tell the user its edit failed but not why, so it could only report
  the failure; the user got the same error wall they already had. This is
  the difference between a tool failure and a repair loop.
- ✅ proactive repair behaviour in the system prompt
- ✅ **measured** length guidelines, replacing guesswork — see
  docs/plans/resume-length-guidelines.md and the section below

Phase C — the expensive work. ✅ DONE (branch `feat/chat-agent-v3-phase-a`)

- ✅ first-session analysis, cached per (resume, JD hash), run at
  JD-paste time behind the EXISTING parsing modal — no new loading
  screen needed, the product already had one there
- ✅ all three JD-time AI calls (formatter, intent extractor, analysis)
  run in parallel, so the wait is the slowest call rather than the sum
- ✅ the analysis reaches the system prompt, including the
  `alreadyCovered` anti-repetition list — the assistant does not ask for
  skills the resume already shows
- ✅ the fuller industry-convention table (the prompt carries a short
  version today)

Verified live against the user's own CleerDental variant: it caught the
Edmonton-vs-Ottawa hard requirement, the missing voice-AI and
healthcare-data exposure, and the absence of agentic work — while
correctly listing Python, TypeScript, LLMs and integrations as already
covered.

Cost: ~$0.003 per analysis (7.5K input / 3.5K output on Haiku 5.5).

Phase D — proactivity
- agent-initiated recommendations after each edit ("this removed a
  keyword the JD asked for")

Phase E — formatting fidelity + agent prompting UX. ✅ DONE

From a manual pass over the real product:

- ✅ **Empty location fields no longer print stray commas.** The Jake
  header renders all four location slots in EDIT mode (so each is
  clickable) and printed a comma before every one of them, while the
  placeholder text itself is `print:hidden`. The printed line came out
  as `123 Main St, , ,`. The shared `separatorBefore()` helper now
  decides per separator: visible on screen, visible in print only when
  the slot it precedes and something earlier both have values.
- ✅ **Item spacing is a real setting.** `sectionSpacing` controlled the
  gap between SECTIONS; there was no knob for the gap between ENTRIES
  inside a section — one work role and the next, one project and the
  next, one skill row and the next. Added `itemSpacing` with a
  popover control, a new `--resume-item-spacing` var, and three derived
  gaps so one knob moves all three rhythms without flattening the
  hierarchy. All eight template files now read the vars.
- ✅ **`coercePrintSettings` is field-tolerant.** It used to
  `safeParse` the whole object and fall back to ALL defaults on any
  failure — so adding one field to the schema would have silently
  reverted every stored resume's chosen margin. Each field now falls
  back to its own default.
- ✅ **Suggested prompt chips** in an empty chat, JD-aware when a job
  description is attached (`lib/chat/suggested-prompts.ts`).
- ✅ **The tailoring pass runs itself.** When a variant is created from
  a JD, the chat opens and runs the prompt the user was about to type
  ("tailor this for this JD, one to two pages, keep only the relevant
  stuff, improve the ATS score"). Pro only — Free users get the chip
  instead, and spend their own daily allowance on it if they want it.
  Guarded so a reload does not re-run it.

Measured data for the agent's length advice is regenerated from real
prints after every layout change — see
`docs/plans/resume-length-guidelines.md`.

## 8. Decisions (2026-10-21)

**Q1 — How much may the agent write without asking?**
Decided: **edit freely when the user asked directly; propose first when
the agent inferred it.** "Rewrite my summary for this role" just happens.
"You have no metrics on any bullet — want me to add them?" asks first.
The test is intent, not verb: if the user named the change, do it; if the
agent noticed something the user did not mention, raise it.

**Q2 — Gate the ATS recompute tool behind Pro?**
Decided: **no.** Recompute is free to run and stays free for everyone —
see the §4 note, it is pure TypeScript with a build-time purity test.
There is no bill to protect against, and gating it would mean taking away
something that costs us nothing.

**Q3 — Loading screen for the first analysis?**
Decided: **yes — and it should be a screen, not an inline spinner.**
Reuse the resume-upload loading screen the user already knows, triggered
at the moment they paste the JD. Rationale: at that instant we have
resume + JD + ATS score simultaneously, which is the earliest and
cheapest moment to run the analysis, and it front-loads the wait into a
moment the user already expects to wait. Then the chat opens with the
analysis already done, rather than making the first message feel slow.

**Q4 — Per-edit diff with accept/reject?**
Decided: **no, not now.** The agent already explains what it changed, and
the user's own argument is that a 1–2 page tailored resume is short enough
to read directly. Revisit only if users report not knowing what the agent
did — and capture that signal first rather than building it speculatively.

## 9. Cost of the first-session analysis

Priced against `anthropic/claude-haiku-5.5`, verified live via
`vercel ai-gateway models endpoints` on 2026-10-21: **$0.10 in / $0.50
out per 1M**, identical across all four endpoints (anthropic, bedrock,
claudeaws, vertexAnthropic).

Realistic payload, using the measured size of the CleerDental variant:

| input | tokens |
|---|---|
| resume revision (~20 KB) | ~5,000 |
| JD description (~3.4 KB) | ~900 |
| JD markdown (if present, ~6 KB) | ~1,500 |
| system prompt incl. dynamic templates + persona | ~3,000 |
| instructions + output schema | ~1,000 |
| **total input** | **~11,400** |

Output: a structured critique, ~2,000–3,000 tokens.

| | rate | cost |
|---|---|---|
| input | 11,400 × $0.10/1M | $0.00114 |
| output | 3,000 × $0.50/1M | $0.00150 |
| **total per analysis** | | **~$0.0027** |

**Roughly a quarter of a cent.** Even a deliberately generous multi-pass
version (4 calls: overall critique, per-section detail, rewrite
proposals, gap ranking) lands around **$0.01**.

Scale check against the product: 1,000 analyses costs **CA$2.70**. Every
free user creating two JD variants a month, 100 users, is **CA$0.60/month**
— noise against CA$5/mo Pro revenue. **The economics are not a constraint
here**; latency and quality are the real questions, not price.

> **Gap worth closing:** `vercel ai-gateway budgets list` returns *no
> budgets*. There is no metered spend ceiling on the AI Gateway at all. Not
> urgent at current volume, but the per-user token cap in `lib/db/queries.ts`
> is the only thing standing between a runaway loop and a surprise bill.
> Worth adding a gateway-level budget as a backstop above it.