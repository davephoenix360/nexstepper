# AI model reference for nexstepper

> Reference doc, not code. Which models we can / can't call via Vercel AI
> Gateway, what they cost, and what they can actually do.
>
> **Everything below was verified by live API call on 2026-10-21** on the
> Nexstepper account, after a Gateway credit top-up. Superseded numbers are
> kept in the changelog at the bottom rather than deleted, because the
> pattern of them changing is the most useful thing in this file.

The codebase doesn't import this file. It's a handbook for future model
decisions.

## Source of truth, in priority order

1. **A live call.** Not the CLI. Not the website. The only thing that
   settles whether a model works for us is a request that exercises the
   capability we need.
2. `npx --yes vercel@latest ai-gateway models endpoints <id> --format json`
   — account-level. Says what *this* account is served, and gives per-endpoint
   price, latency, uptime, and `supported_parameters`.
3. `npx --yes vercel@latest ai-gateway models ls --format json` — global
   catalog. Says what exists. Prices here are the post-credit list price and
   do **not** reflect free-tier access.
4. <https://vercel.com/ai-gateway/models> — marketing metadata. Has been
   wrong on this account four separate times. Do not plan against it.

> Use `npx --yes vercel@latest`, never the global `vercel`. The global CLI on
> this machine is 45.0.8 and has no `ai-gateway` subcommand — it silently
> prints `vercel deploy` help instead of erroring.

## The free-tier trap

A model is only free for this account when the call succeeds **and** the
endpoint is priced at 0. Every one of these carried a `free` tag or a
"$0" marketing claim and still could not be called:

| model | claimed by | reality |
|---|---|---|
| `zai/glm-5.3-flash` | vercel.com browser page | 20 healthy endpoints, **none** free-tagged, $0.06–$0.45 per 1M in |
| `inclusionai/ling-3.0-flash-fin-free` | the CLI's own free-tier listing | `403 Free tier users do not have access`; id later left the catalog |
| `reflection/beam-free` | the catalog's `free` tag | `403` until credits were added — then $0, as advertised |
| `minimax/minimax-m3.1-flash` | $0 price in the catalog | callable, but silently fails both capabilities we need |

And the inverse trap, which is worse: a model that **is** reachable and
**is** tagged `free` still may not do the job.

```powershell
# Re-verify anything before you plan against it
npx --yes vercel@latest ai-gateway models endpoints <model-id> --format json
```

## What we run today

| role | model | in/out per 1M | context | why |
|---|---|---|---|---|
| **parser** (JD, resume, formatter, intent) | `mistral/mistral-nemo` | $0.03 / $0.03 | 131K | cheapest model that emits *schema-exact* JSON reliably |
| parser fallbacks | `reflection/beam-free` → `amazon/nova-micro` → `openai/gpt-4o-mini` | $0 → $0.04 → $0.15 | 1M / 128K / 128K | all verified schema-exact |
| **chat** (agentic assistant, Pro) | `anthropic/claude-haiku-5.5` | $0.10 / $0.50 | 1M | frontier reasoning, 4 real endpoints, verified tools + schemas |
| chat fallbacks (Pro) | `amazon/nova-micro` → `zai/glm-5.3-flash` → `reflection/beam-free` → `nvidia/nemotron-3.5-lightning-free` | $0.04 → $0.06 → $0 → $0 | 1M each | ordered by **measured edit reliability**, not price (2026-11-01) |
| **chat** (agentic assistant, Free) | `reflection/beam-free` | $0 / $0 | 1M | $0-only chain — a free user must cost us nothing |
| chat fallbacks (Free) | `nvidia/nemotron-3.5-lightning-free` | $0 / $0 | 1M | the only other strictly-$0 model that can edit |

Constants live in `lib/ai/providers.ts`. That file's header carries a
standing re-verify rule — read it before trusting any comment in it.

### Why two models

Structured extraction and agentic tool use are different jobs, and one
model is rarely good at both on this Gateway:

- **Strict structured output** needs `response_format: json_schema` support.
  Very few cheap models honour the *schema* — several return syntactically
  valid JSON that doesn't match.
- **Agentic tool use** needs reliable tool calls and a large context, because
  every turn re-sends the whole resume. A small window makes the agent
  truncate and appear to "forget" the user's own data.

Verified behaviour, all on 2026-10-21 against live requests:

| model | strict JSON schema | forced tool call | verdict |
|---|---|---|---|
| `anthropic/claude-haiku-5.5` | ✅ schema-exact | ✅ clean args | chat primary |
| `mistral/mistral-nemo` | ✅ schema-exact | ⚠️ **narrated the call as prose, empty `tool_calls`, 2 of 3 runs** | **parser only** |
| `amazon/nova-micro` | ✅ | ✅ | best all-rounder |
| `reflection/beam-free` | ✅ | ✅ best bullet rewrite of the set | $0, first fallback |
| `zai/glm-5.3-flash` | ✅ | ✅ | 20 endpoints, best failover diversity |
| `nvidia/nemotron-3.5-lightning-free` | ⚠️ weak — returned `{"output":"ok"}` for a `{score,label}` schema | ✅ | $0, last resort |
| `inclusionai/ling-3.1-flash` | ❌ `400 Bad Request` | ⚠️ leaked reasoning into the arguments | **removed 2026-10-21** |
| `meta/llama-3.1-8b` | ❌ returned `{}` | ❌ `400 Bad Request` | **removed 2026-10-21** |
| `minimax/minimax-m3.1-flash` | ❌ empty string | ❌ ignored `tool_choice` | unusable |
| `inclusionai/ling-3.0-flash-fin` | ✅ | ✅ | ❌ **48.8s** — unusable latency |

## The real-agent-loop measurement (2026-11-01)

The table above verified models with a **forced** `tool_choice` against a
**simple** tool. That proves a model *can* emit a tool call. The chat
agent's actual job is different: it is never forced, it **chooses** whether
a message warrants a call, and it faces the large nested `editResume`
schema in a multi-step loop.

So the chat chain was re-measured properly — an unforced call, every
`CHAT_TOOLS` entry with its real `inputSchema`, the real 27KB system
prompt, 5 attempts per model. Ground truth for "a tool call happened" is
the SDK's `execute` callback, which only runs on a real tool call.
Arguments are then validated against the real Zod schema and scanned for
reasoning leaks — a model that puts its own thinking where the resume
text goes would have the merge write it onto the user's resume.

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

The first version of the probe passed `parameters` to `tool()` instead of
`inputSchema`. **AI SDK 6 renamed the field**, and leaving it as
`parameters` makes the SDK treat the tool as *schemaless* — the model
gets no schema to fill in. The route builds its tool set with
`inputSchema`; the probe did not.

That first probe produced confident, specific, **wrong** conclusions:

| model | first probe said | truth (with `inputSchema`) |
|---|---|---|
| `amazon/nova-micro` | "hard-errors 40% of the time" | **5/5 clean, fastest at 2.7s** |
| `nvidia/nemotron-3.5-lightning-free` | "never calls the tool (0/5)" | **3/5 — it edits** |

Both were artefacts of a schemaless tool, not properties of the models.
The tell was that the "invalid sequence as part of ToolUse" error is
exactly what a model produces when it has no schema to fill in.

This is the standing rule being demonstrated one level deeper: *a
capability claim is only as good as the payload it was verified with.*
The probe was wrong in precisely the way it was built to detect — it
measured a different configuration than production. The fix was to
**copy the route's tool construction verbatim** into the probe, and the
probe's file header now says so.

### What the measurement changed

- **Zero narrations and zero payload leaks, across every model and every
  attempt.** The feared "Done, I rewrote it" with nothing changed did not
  happen. What the weaker models do instead is *ask* — "the bullet already
  has a metric, what outcome do you want to lead with?" — which is honest,
  and is the agent's designed `needs-you` behaviour.
- **`amazon/nova-micro` moved to first.** It edits 5 of 5 and is the
  fastest caller at 2.7s. It used to sit second, behind a $0 model that
  edits 3 of 5.
- **`reflection/beam-free` moved down** to third — same edit rate as
  `nvidia/nemotron-3.5-lightning-free`, but it is the only $0 entry with
  a verified schema-exact structured-output record, which the
  first-session analysis depends on.
- **`zai/glm-5.3-flash` is slow** — 23s median against 5.6s for the
  primary. Reliable, but it feels dead.
- **`minimax/minimax-h3` is a VIDEO model.** The catalogue lists it at $0
  with a context window and it reads like an LLM id. Calling it returns
  *"Model 'minimax/minimax-h3' is a video model, not a language model."*
- **`stealth/glyph-cluster` 403s** — it requires purchased credits, so a
  "$0" model that a free account cannot call is not free.

### The free tier

Free users get a **$0-only** chain — `reflection/beam-free` →
`nvidia/nemotron-3.5-lightning-free` — because a free user must cost us
nothing. `reflection/beam` would edit more reliably but is **not**
strictly $0: only its `reflection` endpoint is free, and the gateway may
route to baseten / nebius / togetherai at $0.25–$0.40 in / $1.00–$1.20
out per 1M. At the free plan's ceiling (20 turns and 300K tokens a day)
that is roughly **$1.70–$4 per active free user per month**, which is not
free.

The honest trade: free users get a real agent that edits in **3 of 5**
attempts against the Pro chain's **5 of 5**, and asks a clarifying
question the rest of the time.

## Cost model

Assumes a chat turn re-sends the resume: ~8–10K input, 0.8–1K output, plus
JD parses and bullet enrichment. At the chat model's $0.10/$0.50:

| profile | tokens/mo | AI cost/mo |
|---|---|---|
| moderate (300 chat turns + 30 parses + 100 enriches) | ~3.0M | **~$0.45** |
| heavy (1000 turns + 60 parses + 300 enriches) | ~12.0M | **~$1.72** |

Both fit inside a $5 subscription. What does *not* fit is an uncapped user —
one runaway agent loop could exceed a full month of revenue alone. Hence the
Pro daily token cap (`PLANS.pro.chatTokensPerDay = 500_000`), which bounds
worst case at ~$2.10/mo regardless of behaviour.

**Pro is $5/mo, not $3.** At $3 the worst case is 70% of revenue — a knife
edge. At $5 it's 42%. Both are "coffee money"; only one has room for a power
user while we're still learning real usage.

## Gateway credits

There is **no** usable free-tier credit to rely on. Without a top-up, the
account is on Vercel's free tier and most paid models return
`403 Free tier users do not have access to this model` — including
`anthropic/claude-haiku-5.5` and `zai/glm-5.3-flash`.

The chat fallback chain contains $0 models precisely so that credits running
out degrades quality instead of taking the feature down.

Also worth configuring: `npx --yes vercel@latest ai-gateway budgets ls` was
**empty** as of 2026-10-21 — no metered spend ceiling exists. Add one as a
backstop behind the per-user cap.

## Models we ruled out

| model | why not |
|---|---|
| `anthropic/claude-sonnet-5` ($2/$10) | ~$34/mo for a heavy user. 10x over budget. |
| `anthropic/claude-haiku-5.5-batch` ($0.05/$0.25) | batch endpoints aren't real-time; wrong tool for interactive chat |
| `inclusionai/ling-3.1-flash` | repriced to $0.30/$0.90 and leaks reasoning into tool args |
| `inclusionai/ling-3.1-flash-1019` | $0/$0 in the catalogue and it DOES emit clean tool calls — but a 49s median turn. Too slow to sit in front of a user. |
| `minimax/minimax-h3` | the catalogue lists it at $0 with a 1M context and it reads like an LLM id — it is a **video model**. Calling it returns "Model 'minimax/minimax-h3' is a video model, not a language model." |
| `stealth/glyph-cluster` | $0 in the catalogue, 403s on this account: it requires purchased credits. A "$0" model a free account cannot call is not free. |
| `google/gemini-2.5-flash` | Vertex routing degradation caused 30–60s latency in Sep 2026 |
| `openai/gpt-4o-mini` as primary | unmovable `max_output_tokens` cap under strict json_schema; kept only as a deep parser fallback |
| anything `*_meta/mixedbread` etc. | no verified capability on this account |

## Changelog

### 2026-11-01 — The chat chain re-measured on the real agent loop
The "forced `tool_choice`" verification turned out to prove the wrong
capability. Re-ran the chat candidates with an **unforced** call against
the **real** `inputSchema` for every chat tool and the **real** system
prompt: no model narrates a fake success and none leaks reasoning into
the payload, but `amazon/nova-micro` edits 5 of 5 at 2.7s (it had been
second), `reflection/beam-free` edits 3 of 5 (it had been first),
`nvidia/nemotron-3.5-lightning-free` edits 3 of 5, `zai/glm-5.3-flash`
takes 23s, `minimax/minimax-h3` turned out to be a video model, and
`stealth/glyph-cluster` 403s without purchased credits. The chat
fallback chain was reordered from price order to reliability order, and
free users were put on a **$0-only** chain (`reflection/beam-free` →
`nvidia/nemotron-3.5-lightning-free`) so a free user costs us nothing.
`tests/unit/ai/chat-tool-call-probe.test.ts` was added so the next
decision can be made on measurements instead of catalogue tags — and so
the probe itself can be re-checked, which is how its own
`parameters`-instead-of-`inputSchema` bug was caught.

### 2026-10-21 — Live re-verification and chat model swap
Gateway credits added, then every candidate was called for real (basic,
strict json_schema, forced tool call). Findings: `ling-3.1-flash` had been
repriced from `$0/$0` to `$0.30/$0.90` and its comments were still claiming
free; `meta/llama-3.1-8b` and `minimax/minimax-m3.1-flash` could not do the
job they were listed for; `mistral/mistral-nemo`'s tool calling was flaky
(2 of 3 failures), demoting it to parser-only. `CHAT_MODEL` moved to
`anthropic/claude-haiku-5.5` — cheaper on both axes than what it replaced,
with better reasoning. Added the Pro daily token cap.

### 2026-10-01 — Chat agent v2
`CHAT_MODEL` set to `inclusionai/ling-3.1-flash`, then verified `$0/$0`,
`free`-tagged, 262K context. Correct at the time.

### 2026-09-18 — AI Gateway migration + parser moved to Mistral
Centralized model constants in `lib/ai/providers.ts`. Router moved to
`@ai-sdk/gateway@3`. Original primary was `claude-sonnet-4.5`, which hit
"Free tier users do not have access"; Gemini Flash hit 30–60s latency;
`zai/glm-5.3-flash` 403'd. Settled on `mistral/mistral-nemo` after
`openai/gpt-4o-mini` produced empty responses under the output cap.

### 2026-09-18 — `db:push` removed
`db:generate` + `db:migrate` is the workflow now.

### 2026-09-18 — Password reset flow ships
Email + Better Auth + Resend, with `NEXT_REDIRECT` caught and re-thrown so
the framework's sentinel error never reaches the user.

## Adding a model: the checklist

Do not add a model to any chain until you have:

1. `endpoints` output showing a healthy endpoint on **this** account.
2. A live call returning **200**, with the capability you need actually
   exercised — a strict schema for parsers, a forced `tool_choice` for chat.
3. Output you actually inspected. A `200` with empty content is a failure.
4. A note here with the date and the provider, because it will rot.

And a pin in `tests/unit/ai/providers.test.ts` so the next person gets the
same protection.

### The `tool_choice` trap (added 2026-11-01)

Step 2 is not strong enough for the **chat** chain, and it is the reason
one model got in that should not have.

A **forced** tool call (`tool_choice: { type: 'function', ... }`) proves
the model *can* emit a tool call. It does **not** prove the model
*chooses* to call one — which is the whole job for the chat agent. The
agent is never forced: it decides whether this message warrants an
`editResume` call, and the tool schema is large and nested.

A model can pass a forced-tool-call probe with the best rewrite of the
set and still, in the real agent loop, answer an edit request with prose
and never call the tool. When it does that, the user reads a confident
"Done. I rewrote your bullet to …" and **the resume does not change**.

So for the chat chain the capability to verify is:

> An **unforced** tool call, in the multi-step agent loop, against the
> **real** tool schema and the **real** system prompt — with the SDK's
> `execute` callback as the ground truth for "a tool call happened"
> (the SDK only invokes it when a real tool call arrives).

`tests/unit/ai/chat-tool-call-probe.test.ts` does exactly this. It is
skipped by default so CI stays deterministic; run it deliberately:

```bash
RUN_AI_PROBE=1 npx vitest run tests/unit/ai/chat-tool-call-probe.test.ts
```

It asserts that no candidate narrates an edit instead of calling the
tool, and it prints a per-model call rate. A model that narrates belongs
in the same category as `mistral/mistral-nemo`: a silent no-op is worse
than an error.
