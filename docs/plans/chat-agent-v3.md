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

- **Trigger:** first user message in a chat session where a
  `jobContext` exists and no analysis has been recorded for this
  resume + JD hash yet.
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

Phase A — context and correctness
- dynamic template list in the system prompt (replaces the hardcode that
  just bit us)
- `getAtsScore` read tool
- persona rewrite of `lib/chat/system-prompt.ts`

Phase B — capability
- `recomputeAtsScore`, print-settings tools, `validateResume`
- proactive repair behaviour

Phase C — the expensive work
- first-session analysis, cached per (resume, JD hash)
- industry-convention table

Phase D — proactivity
- agent-initiated recommendations after each edit ("this removed a
  keyword the JD asked for")

## 8. Open questions

1. **How much do we let it write without asking?** A resume is the
   user's; over-writing it is worse than under-writing it. Proposal:
   edit freely when the request is explicit, propose-and-confirm when
   it is inferred ("you have no metrics, want me to add them?").
2. **Does the ATS-recompute tool need Pro gating?** It is a real model
   call; a Free user spamming it is a bill.
3. **How long should the first-session analysis take to stream before
   the agent responds normally?** Probably: respond immediately with the
   critique streaming in behind it, rather than blocking.
4. **Do we expose "what changed" as a diff the user accepts/rejects per
   edit?** This is the difference between "removed a step" and "moved a
   step". Strongly inclined yes, but it is a UI project, not an agent
   project.