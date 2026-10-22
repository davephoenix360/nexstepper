# AI SDK 6 → 7 — upgrade assessment

Status: **assessment only. Nothing upgraded.**

Date: 2026-10-22
Branch: `feat/chat-agent-v3-phase-a`
Context: `docs/plans/ats-scoring-v3-jev.md` — the Jev integration path
Source: [AI SDK 6.x → 7.0 migration guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0.md)

## The question

The Jev work needs a decision API. There are two ways in:

- **Path A** — the Vercel AI Gateway's TypeSafe-compatible API
  (`POST https://ai-gateway.vercel.sh/typesafe/v1/systemone`). **Verified
  working against this project's own `AI_GATEWAY_API_KEY`.** No dependency
  change.
- **Path B** — the AI SDK's documented `experimental_decide`, which needs
  **`ai` ≥ 7.0.128**. This project is on **6.0.224**.

The user asked to evaluate the upgrade so Path B becomes available. This
document is the assessment.

## Headline

**Path B does not give us Jev that Path A does not already give us — and
Path A gives us strictly more.**

| | Path A (gateway HTTP) | Path B (AI SDK 7) |
|---|---|---|
| needs `ai` ≥ 7.0.128 | no | **yes** |
| dependency change | none | `ai` 6 → 7, `@ai-sdk/gateway` 3 → 4 |
| question types | `noul`, `choice`, `score` | `boolean`, `choice`, `score` |
| probability field | `answer.noul` | `answer.probability` |
| choice confidence | **inline on the answer** | moved into `providerMetadata.typesafe.confidence` |
| score legend | **returned** | not returned |
| new key needed | no | no |
| new vendor | no | no |

Path A speaks Jev's native protocol and returns everything Path B does,
plus the score `legend` and the inline choice confidence. **The upgrade is
not the price of Jev — Path A is the price of Jev, and it is a `fetch`.**

## Our complete AI SDK surface

Three files. Nothing else in the repo imports `ai` or `@ai-sdk/*`, and no
CommonJS script imports it.

| file | APIs used |
|---|---|
| `app/api/chat/route.ts` | `streamText`, `stepCountIs`, `result.fullStream`, `result.usage`, the `system` option, `messages`, `tools` |
| `lib/ai/fallback.ts` | `generateObject`, `generateText`, the `LanguageModel` type, the `system` option |
| `lib/ai/providers.ts` | `gateway` from `@ai-sdk/gateway`, the `LanguageModel` type |

That is the whole surface. There is no `prepareStep`, no
`experimental_telemetry`, no `experimental_context`, no `CallSettings`,
no `needsApproval`, no MCP client, no Vue/React UI package, and no image,
speech or transcription calls.

## Every breaking change, against our code

| v7 change | touches us? | what it costs |
|---|---|---|
| **`stepCountIs` → `isStepCount`** | **yes** — `app/api/chat/route.ts:508` | a hard rename, 1 import + 1 call site |
| **`system` → `instructions`** | **yes** — 6 call sites (`fallback.ts` ×2, `first-session-analysis.ts`, `inline-issue/prompts.ts`, `extract-jd-intent.ts`, `format-jd-as-markdown.ts`, `parse-jd.ts`, `parse-resume.ts`) | soft: `system` is still accepted as a deprecated fallback and `instructions` wins if both are set. A rename is mechanical. |
| **`result.fullStream` → `result.stream`** | **yes** — the chat route | soft: `fullStream` is still a deprecated alias for `stream` |
| **`result.usage` now spans ALL steps, not just the final one** | **yes** — the chat route's token accounting | **a real behaviour change.** Our daily chat-token allowance (Pro = 500K tokens/day) currently counts the final step's usage; under v7 it would count every step. That is *more* accurate — it is what we are billed for — but it changes how many turns a user gets, so it needs a deliberate look rather than a silent migration. |
| **top-level `content` / `toolCalls` / `toolResults` / `files` / `sources` / `warnings` now span all steps** | no (we read only `fullStream` and `usage`) | — |
| **system messages in `prompt`/`messages` are rejected by default** | **no** | we only ever send `user`, `assistant` and `tool` roles — the system prompt goes through the top-level option. Verified by reading the message-building loop in `app/api/chat/route.ts`. |
| **`usage.cachedInputTokens` / `usage.reasoningTokens` removed** | no | not used |
| **OpenTelemetry moved to `@ai-sdk/otel`; `experimental_telemetry` → `telemetry`** | no | we do not use AI SDK telemetry — PostHog is wired separately |
| **`prepareStep` instructions/messages now carry forward** | no | not used |
| **`experimental_context` → per-tool `context` + `runtimeContext`/`toolsContext`** | no | our tools take no context |
| **`CallSettings` → `LanguageModelCallOptions`** | no | not used |
| **`needsApproval` → `toolApproval`** | no | not used |
| **ESM only (`require()` unsupported)** | no | no CommonJS script imports `ai`; Next.js handles ESM dependencies natively |
| **Node ≥ 22 required** | no | we are on Node 24.21 |
| **`@ai-sdk/gateway` v3 → v4** | yes | a matching major bump alongside `ai` |
| **`generateObject` / `generateText` / `streamText`** | yes | **still exist and are not deprecated** in v7 — the guide only renames their options |

**Nothing in the list is dangerous.** The two hard breaks are a one-line
rename each, and the only behavioural change is the usage accounting —
which is a change we would want anyway.

## What v7 would give us that v6 does not

Honest list, in descending order of value to this product:

1. **`experimental_decide`** — the typed decision API. **We do not need
   it**, because Path A gives us Jev's native shape with no upgrade.
2. **All-steps `usage`** — more accurate cost accounting. We can get this
   today by summing the step usages ourselves.
3. **`instructions` over `system`** — cosmetic, and the v6 name still works.
4. **`finalStep`** for final-step-only semantics. We do not use it.
5. **Provider features that land in v7 first.** This is the real, ongoing
   argument for upgrading, and it is not about Jev. Vercel ships new
   provider capabilities against the current major. On v6 we may find
   ourselves waiting for a fix that already exists in v7.
6. **Not accumulating migration debt.** v6 is still published under the
   `ai-v6` dist-tag (6.0.314) and the gateway under `ai-v6` (3.0.220), so
   v6 is maintained — but v7 is the line everything else moves to.

## Cost of doing it

Small, and the tooling is good:

```bash
pnpm add ai@^7 @ai-sdk/gateway@^4
npx @ai-sdk/codemod v7
```

The codemod table covers `rename-step-count-is` and
`rename-full-stream-to-stream` mechanically. What it cannot do is the
`system` → `instructions` rename (six call sites, trivial) or the usage
accounting decision (a judgement call).

**Estimate: half a day including the full gate** (`pnpm typecheck`,
`pnpm vitest run`, `pnpm build`) and a careful look at the chat-token
allowance.

## The risks, stated

1. **The usage semantics change is a product change wearing a technical
   costume.** Under v7, a single turn that calls three tools consumes
   three model calls' worth of tokens in the daily allowance. That is
   correct — we are billed for all three — but it means the Pro allowance
   buys fewer turns than it does today. It needs a number, not a
   migration.
2. **A major-version upgrade on the path that runs every user's chat.**
   The blast radius is three files and the full test suite covers the
   chat route, so the risk is low — but it is not zero, and it is not
   urgent.
3. **Node 22 floor.** We are on 24. Vercel must not be pinned to Node 20
   or 18, or the build breaks. Worth checking before starting.

## Recommendation

**Do not upgrade for Jev. Path A is the better integration and it works
today.**

But be honest about what that means: this is **"not now"**, not "never".
The upgrade is cheap, the tooling is good, and the reason to do it
("v7 is where new provider features land") is real and independent of
Jev. The question is only sequencing.

Suggested order:

1. **Now** — build the Jev ATS work on **Path A**. It needs no upgrade,
   it speaks Jev's native protocol, and it gives us the score `legend` and
   the inline choice confidence that Path B throws away.
2. **Then, as its own small change** — upgrade to AI SDK 7 with the
   codemod, rename `system` → `instructions`, and **deliberately decide
   what the chat-token allowance should count**. Ship it as a separate
   commit from anything else so it can be reverted on its own.
3. **Never** — do not let the SDK question and the scoring question
   become one question. They were bundled here only to be separated with
   evidence.

### If we upgrade, the checklist

- [ ] `pnpm add ai@^7 @ai-sdk/gateway@^4`
- [ ] `npx @ai-sdk/codemod v7`
- [ ] rename `system` → `instructions` in the 6 call sites
- [ ] `stepCountIs` → `isStepCount` (`app/api/chat/route.ts`)
- [ ] `result.fullStream` → `result.stream`
- [ ] **decide the usage-accounting change** and update the Pro daily
      allowance if the number moves materially
- [ ] check Vercel's Node version is ≥ 22
- [ ] `pnpm typecheck` + `pnpm vitest run` + `pnpm build`
- [ ] smoke the chat route end to end (a tool call, a multi-step turn)
