# The chat fallback chain was ordered by price, not by whether the model can edit

**Date:** 2026-11-01
**Surface:** the AI chat agent, `POST /api/chat`
**Risk:** the fallback chain only engages when the primary is unavailable —
which is exactly when it has to work.

## Context

After the ByteString header crash was fixed and shipped
(`docs/drift/2026-11-01-chat-byte-string-header-crash.md`), a review of
the chat model chain turned up a claim that did not survive scrutiny.

`lib/ai/providers.ts` listed `reflection/beam-free` as the **first**
fallback, annotated *"verified structured output + clean tool calls"* —
and the ordering of the whole chain was explained by price:

> `reflection/beam-free` — **$0**, verified … First because it is free: if
> the primary 403s because credits ran out, this keeps Pro working at no
> cost.

So the chain was sorted by **cost**, and the $0 model led it.

## The problem with the verification

The "clean tool calls" claim came from a probe that used a **forced**
`tool_choice` against a **simple** tool. That proves a model *can* emit
a tool call.

It does not prove the model **chooses** to call one — which is the job
for the chat agent. The agent is never forced. It reads a 27KB system
prompt, decides whether the user's message warrants an `editResume`
call, and faces a large nested schema in a multi-step loop.

Those are different capabilities, and a model can have the first without
the second.

## The measurement

`tests/unit/ai/chat-tool-call-probe.test.ts` was added to close the gap.
Per model: 5 attempts at a realistic edit request, against the **real**
tool set (every `CHAT_TOOLS` entry with its real `inputSchema`) and the
**real** system prompt, with **no forced tool choice**. Ground truth for
"a tool call happened" is the SDK's `execute` callback, which only runs
on a genuine tool call. Arguments are then validated against the real
Zod schema and scanned for reasoning leaks — a model that puts its own
thinking where the resume text goes would have the merge write it onto
the user's resume.

| model | edited | leak | narrate | badArgs | errors | median |
|---|---|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 5/5 | 0 | 0 | 0 | 0 | 5.6s |
| `amazon/nova-micro` | 5/5 | 0 | 0 | 0 | 0 | **2.7s** |
| `zai/glm-5.3-flash` | 5/5 | 0 | 0 | 0 | 0 | 23.0s |
| `inclusionai/ling-3.1-flash-1019` | 5/5 | 0 | 0 | 0 | 0 | **52.2s** |
| `reflection/beam` | 3/5 | 0 | 0 | 0 | 0 | 8.5s |
| `reflection/beam-free` | 3/5 | 0 | 0 | 0 | 0 | 8.2s |
| `nvidia/nemotron-3.5-lightning-free` | 3/5 | 0 | 0 | 0 | 0 | 6.4s |
| `stealth/glyph-cluster` | 403 | — | — | — | 5 | — |
| `minimax/minimax-h3` | **not a language model** | — | — | — | 5 | — |

### The probe that lied, and how it was caught

The **first** version of the probe passed `parameters` to `tool()`
instead of `inputSchema`. AI SDK 6 renamed the field, and leaving it as
`parameters` makes the SDK treat the tool as **schemaless** — the model
gets no schema to fill in. The route builds its tool set with
`inputSchema`; the first probe did not.

That probe produced confident, specific, **wrong** conclusions:

| model | first probe said | truth (with `inputSchema`) |
|---|---|---|
| `amazon/nova-micro` | "hard-errors 40% of the time" | **5/5 clean, fastest at 2.7s** |
| `nvidia/nemotron-3.5-lightning-free` | "never calls the tool (0/5)" | **3/5 — it edits** |

Both were artefacts of a schemaless tool, not properties of the models.
The tell was the error itself: *"Model produced invalid sequence as part
of ToolUse"* is exactly what a model produces when it has no schema to
fill in.

It was caught because the probe was read against the route's source
before the numbers were acted on. The fix was to **copy the route's tool
construction verbatim** into the probe, and the probe's file header now
says so, so the next person cannot repeat it.

### A correction to an earlier claim

During this work it was reported that `reflection/beam-free` *"narrated
the edit instead of calling the tool"* — replying "Done. I rewrote your
bullet to …" with nothing changed. **That did not reproduce.** The
original observation came from a probe configured with a **4-step**
budget; the route actually runs `CHAT_MAX_STEPS = 6`. Under the real
configuration the model called the tool every time it acted, and the
failure mode is different: it **asks a clarifying question** instead of
acting ("the bullet already has a metric — what outcome do you want to
lead with?"). That is honest — it is the `needs-you` state the agent is
designed for — but it is a stall, not a fake success.

Across every model and every attempt: **zero narrations, zero payload
leaks, zero malformed arguments.** The property the chain never had is
now measured and pinned.

## The fix

### The chat chain: price order → reliability order

```
before: haiku → beam-free → nova-micro → glm-5.3-flash → nemotron
after:  haiku → nova-micro → glm-5.3-flash → beam-free → nemotron
```

- **`amazon/nova-micro` leads the fallbacks.** Edits 5 of 5 and is the
  fastest caller at 2.7s. It used to sit second, behind a $0 model that
  edits 3 of 5.
- **`zai/glm-5.3-flash` second.** 5/5 clean and 20 healthy endpoints —
  the best failover diversity available. Slow at 23s, so reliability
  first, latency second.
- **`reflection/beam-free` third.** $0, pinned to the single free
  endpoint — the entry that survives credits running out. It is also the
  only $0 entry with a verified schema-exact structured-output record,
  which the first-session analysis depends on.
- **`nvidia/nemotron-3.5-lightning-free` last.** $0, 1M context, 3/5.

### A $0-only chain for free users

Free users now get their own chain: `reflection/beam-free` →
`nvidia/nemotron-3.5-lightning-free`. Both are strictly $0 on every
endpoint this account can be routed to, so a free user's conversation
costs us nothing.

`reflection/beam` would edit more reliably, but it is **not** strictly
$0: only its `reflection` endpoint is free, and the gateway may route
to baseten / nebius / togetherai at $0.25–$0.40 in / $1.00–$1.20 out
per 1M. At the free plan's ceiling (20 turns and 300K tokens a day)
that is roughly **$1.70–$4 per active free user per month**.

The honest trade: free users get a real agent that edits in **3 of 5**
attempts against the Pro chain's **5 of 5**, and asks a clarifying
question the rest of the time.

The decision lives in one function, `resolveChatModelPlan(plan)`, so the
plan → model decision has a single owner and can be asserted in a test
rather than re-derived at each call site.

## The guard

`tests/unit/ai/providers.test.ts` now pins:

- the exact chain order, with the measurement date;
- that the $0 model that edits less often does not lead the chain;
- that no narrator, payload leaker, or non-language-model is in the
  chain — including `minimax/minimax-h3`, which the catalogue lists at
  $0 with a context window and which is actually a **video model**;
- that the free chain contains **only** $0 models, and that no priced
  model that edits 5 of 5 (`claude-haiku-5.5`, `nova-micro`,
  `glm-5.3-flash`) is reachable from it;
- that the free chain spans two providers, so one outage cannot take it
  down.

`tests/unit/ai/chat-tool-call-probe.test.ts` is the tool that produced
the numbers. It is skipped by default so CI stays deterministic; run it
deliberately:

```bash
RUN_AI_PROBE=1 npx vitest run tests/unit/ai/chat-tool-call-probe.test.ts
```

## The lessons

**A capability claim is only as good as the payload it was verified
with.** The standing rule in `lib/ai/providers.ts` already said "call it
with the actual payload" — and the chain had been arranged around a
verification that used a *different* payload than production. The
verification passed. It was just verifying the wrong thing.

**And the probe needs checking too.** The first probe measured a
schemaless tool — a different configuration from the one it was
supposed to stand in for — and produced two confident, specific, wrong
conclusions. A measurement of the wrong thing is worse than no
measurement, because it gets acted on. The probe now mirrors the route's
tool construction verbatim, and its header says why.

**A fallback chain is ordered by what happens when it engages**, which is
the worst moment to discover the model cannot do the job. Price is a
tiebreaker, and only once reliability is established.

## Follow-ups

- The **first-session analysis** still runs on the paid chat chain. It
  is one call per variant creation (~$0.003), so the cost is small, but
  it is the last paid call a free user can reach.
- The 52s turn from `ling-3.1-flash-1019` was measured across 5
  attempts; it may be congestion rather than the model's real speed.

## One more thing the measurement found: the free tier's daily allowance was a lie

The same probe recorded tokens per turn, which turned a quiet accounting
problem into a visible one.

| chain | tokens per turn (median of 6) | prompt cached? | 20 turns |
|---|---|---|---|
| Pro (`anthropic/claude-haiku-5.5`) | ~20,833 | **no** (0 cached) | ~416K |
| Free (`reflection/beam-free`) | ~12,980 | yes (11–13K cached) | ~260K |
| Free fallback (`nvidia/nemotron-3.5-lightning-free`) | ~16,070 | yes (12–17K cached) | ~321K |

The Free plan's daily token cap is 300K and its turn allowance is 20.
So:

- **On the Pro chain, the cap binds first.** 300K ÷ 20,833 ≈ **14
  messages a day**. The badge said "Free · 20/day" and the composer said
  "N / 20 messages remaining today", and the server was rejecting the
  fifteenth. The copy when it did reject was *"You've used today's **Pro**
  AI allowance"* — told to a user who had no Pro allowance.
- **On the free chain, the turn limit binds first.** 300K ÷ 12,980 ≈ 23,
  so 20 turns ≈ 260K fits inside the cap. The badge is now **true**.

So routing free users to their own $0 chain did not just make them free
— it made the advertised allowance real. That is the concrete reason
the free tier needed its own chain rather than a discount on the Pro
one.

Three fixes came out of it:

1. **The token-cap copy is plan-aware.** A finite turn limit *is* the
   Free plan (only Free has a finite `chatMessagesPerDay`), so it
   doubles as the plan signal: "You've used today's free AI allowance".
2. **The badge reads the limit instead of hard-coding it.** It used to
   be a literal `"Free · 20/day"` — a second copy of a number that
   already had a source of truth (`PLANS`) and was already being sent
   back on `X-Chat-Limit`. It now takes the limit as a prop from the
   page, which reads `PLANS`.
3. **The test that guarded the quota was guarding a guess.** It asserted
   the Free cap cleared `20 turns × 10,000 tokens` — an assumption that
   was never measured, and that was false for the Pro chain. It now
   uses the measured 13K, and a companion test asserts that the Pro
   chain's 20.8K would *not* clear it — so nobody quietly puts the Pro
   chain back on the free tier without the failure showing up.

