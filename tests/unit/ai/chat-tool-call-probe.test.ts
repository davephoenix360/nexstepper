/**
 * PROBE — does a model CALL the chat tools with real arguments, or
 * narrate the edit / leak its reasoning into the payload?
 *
 * ## Why this exists
 *
 * `lib/ai/providers.ts` claims `reflection/beam-free` is a verified chat
 * fallback with "clean tool calls". The 2026-10-21 verification used a
 * **forced** `tool_choice` against a **simple** tool. The chat agent is
 * never forced: it decides whether a message warrants an `editResume`
 * call, against a large nested schema, in a multi-step loop.
 *
 * Two failure modes matter, and they are different:
 *
 * 1. **Narration** — the model replies "Done. I rewrote your bullet to
 *    …" and never calls the tool. The user believes the edit landed. It
 *    did not. (The failure `mistral/mistral-nemo` was removed from the
 *    chain for.)
 * 2. **Reasoning leak** — the model calls the tool, but puts its own
 *    thinking where the resume text goes. `inclusionai/ling-3.1-flash`
 *    did exactly this: `{"text": "The user is asking me to reply with"}`.
 *    This is worse than narration, because the tool runs and the merge
 *    writes the narration onto the user's resume.
 *
 * So the probe checks three things per attempt: did a tool call happen,
 * did the arguments parse against the REAL schema, and does the payload
 * read like resume content rather than speech to the user.
 *
 * ## It mirrors the route EXACTLY
 *
 * This matters more than it sounds. The route builds its tool set with
 * **`inputSchema`** — AI SDK 6 renamed `parameters` to `inputSchema`, and
 * leaving it as `parameters` makes the SDK treat the tool as **schemaless**
 * ("the model has no idea what shape to fill in"). An earlier version of
 * this probe used `parameters` and therefore measured a different
 * configuration than production. The tool set below is built the same way
 * `app/api/chat/route.ts` builds it: every `CHAT_TOOLS` entry, with
 * `inputSchema`, and the same `execute` shape.
 *
 * ## Running it
 *
 * Skipped by default — it makes network calls and must not make CI slow
 * or flaky. Run it deliberately:
 *
 *   RUN_AI_PROBE=1 npx vitest run tests/unit/ai/chat-tool-call-probe.test.ts
 *
 * Narrow the candidate list, or the attempt count, with:
 *
 *   RUN_AI_PROBE=1 RUN_AI_PROBE_MODELS=reflection/beam-free npx vitest run ...
 *   RUN_AI_PROBE=1 RUN_AI_PROBE_ATTEMPTS=8 npx vitest run ...
 */
import { describe, expect, it } from 'vitest';
import { generateText, stepCountIs, type ToolSet } from 'ai';
import { gateway } from '@ai-sdk/gateway';

import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { gallerySampleResumeData } from '@/lib/resume-schema/sample';
import { CHAT_TOOLS } from '@/lib/chat/tools';
import { editResumeArgsSchema } from '@/lib/chat/tools/types';
import { CHAT_MAX_OUTPUT_TOKENS, CHAT_MAX_STEPS } from '@/lib/ai/providers';

const ENABLED = process.env.RUN_AI_PROBE === '1';

/** How many edit attempts per model. Five is enough to see a rate. */
const EDIT_ATTEMPTS = Number(process.env.RUN_AI_PROBE_ATTEMPTS ?? 5);

const CANDIDATES = [
  'anthropic/claude-haiku-5.5', // the primary — the baseline that must pass
  'reflection/beam', // the same model, unpinned to the free endpoint
  'reflection/beam-free', // pinned to the single $0 endpoint
  'zai/glm-5.3-flash',
  'amazon/nova-micro',
  'nvidia/nemotron-3.5-lightning-free',
  'inclusionai/ling-3.1-flash-1019',
  'stealth/glyph-cluster',
  'minimax/minimax-h3' // NOT a language model — kept as a regression pin
];

const MODELS = process.env.RUN_AI_PROBE_MODELS
  ? CANDIDATES.filter((m) =>
      process.env.RUN_AI_PROBE_MODELS!.split(',').some((f) => m.includes(f.trim()))
    )
  : CANDIDATES;

const JD = `Senior Backend Engineer — Acme

About the role
We are looking for a senior backend engineer to own our TypeScript services.

Requirements
- 5+ years of professional TypeScript experience
- Strong Postgres knowledge, including query tuning
- Experience with AWS (EC2, RDS, S3)
- Comfortable with Node.js and REST API design

Nice to have
- Kubernetes in production`;

const jobContext = {
  id: 'probe',
  title: 'Senior Backend Engineer',
  company: 'Acme',
  location: 'Remote',
  description: JD,
  requirements: ['5+ years TypeScript', 'Postgres', 'AWS', 'Node.js'],
  niceToHaves: ['Kubernetes'],
  benefits: [],
  keywords: ['typescript', 'postgres', 'aws', 'node.js', 'kubernetes'],
  seniority: 'senior',
  employmentType: 'Full-time',
  source: 'paste' as const
};

/** The realistic edit request. */
const EDIT_REQUEST =
  'My work bullets feel weak and generic. Tighten the first bullet under my current job so it says what I actually changed.';

/**
 * A change-claim in the assistant's prose. Paired with "no tool call",
 * this is a silent no-op — the failure that matters.
 */
const CHANGE_CLAIM =
  /\b(done|i (?:have )?(?:now |just )?(?:changed|rewrote|rewritten|updated|edited|tightened|replaced|added|removed)|now reads|here'?s the (?:new|updated)|updated the|new version)\b/i;

/**
 * Does this string read like RESUME CONTENT, or like the model talking
 * to the user? The second one would be written straight onto the
 * resume by the merge.
 */
function looksLikeNarration(s: string): boolean {
  return (
    /\bthe user\b/i.test(s) ||
    /\bplease (provide|share|clarify|confirm|paste)\b/i.test(s) ||
    /^(i|we)\s+(need|would|will|should|can|could|am|'m|don'?t|didn'?t|have)\b/i.test(s) ||
    /\bi (?:need|would|will|should) (?:to|the|your|a|an)\b/i.test(s) ||
    /\bcan you (?:provide|share|paste|tell)\b/i.test(s) ||
    /\bthe current (?:text|bullet|resume|version)\b/i.test(s)
  );
}

/** Every string in the payload that would be written onto the resume. */
function payloadStrings(args: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 6) return;
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach((n) => walk(n, depth + 1));
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        // `matchCompany` / `matchRole` / `institution` are selectors, not
        // content — they are matched against existing resume values.
        if (['matchCompany', 'matchRole', 'company', 'role', 'institution'].includes(k)) {
          continue;
        }
        walk(v, depth + 1);
      }
    }
  };
  walk(args, 0);
  return out;
}

type Attempt = {
  toolCalled: boolean;
  toolsCalled: string[];
  argsValid: boolean;
  argProblem?: string;
  leak: boolean;
  narration: boolean;
  text: string;
  ms: number;
  /** Tokens the SDK reports for the whole multi-step turn. */
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  error?: string;
};

async function attemptEdit(model: string, system: string): Promise<Attempt> {
  const calls: { name: string; args: unknown }[] = [];
  const t0 = Date.now();
  try {
    // Built exactly like app/api/chat/route.ts builds it: every entry in
    // CHAT_TOOLS, with `inputSchema` (NOT `parameters` — AI SDK 6 renamed
    // it, and `parameters` makes the tool schemaless).
    const tools = Object.fromEntries(
      Object.entries(CHAT_TOOLS).map(([toolName, t]) => [
        toolName,
        {
          description: t.description,
          inputSchema: t.parameters,
          execute: async (args: unknown) => {
            calls.push({ name: toolName, args });
            if (toolName === 'editResume') {
              return {
                ok: true,
                result:
                  'Applied 1 bullet change under Loom Systems (Senior Product Engineer). The first bullet now leads with the result.'
              };
            }
            return { ok: true, result: 'ok' };
          }
        }
      ])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as unknown as ToolSet;

    const r = await generateText({
      model: gateway(model),
      system,
      messages: [{ role: 'user', content: EDIT_REQUEST }],
      tools,
      stopWhen: stepCountIs(CHAT_MAX_STEPS),
      maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
      temperature: 0.3
    });
    const text = r.text ?? '';
    const editCall = calls.find((c) => c.name === 'editResume');

    let argsValid = false;
    let argProblem: string | undefined;
    if (editCall) {
      const parsed = editResumeArgsSchema.safeParse(editCall.args);
      argsValid = parsed.success;
      if (!parsed.success) argProblem = parsed.error.message.slice(0, 140);
    }

    const leak = Boolean(editCall) && payloadStrings(editCall!.args).some(looksLikeNarration);

    return {
      toolCalled: calls.length > 0,
      toolsCalled: calls.map((c) => c.name),
      argsValid,
      argProblem,
      leak,
      narration: !calls.length && CHANGE_CLAIM.test(text),
      text: text.slice(0, 260),
      ms: Date.now() - t0,
      inputTokens: r.usage?.inputTokens,
      outputTokens: r.usage?.outputTokens,
      reasoningTokens: r.usage?.reasoningTokens,
      cachedInputTokens: r.usage?.cachedInputTokens
    };
  } catch (e) {
    return {
      toolCalled: false,
      toolsCalled: [],
      argsValid: false,
      leak: false,
      narration: false,
      text: '',
      ms: Date.now() - t0,
      error: (e as Error).message.slice(0, 200)
    };
  }
}

describe.skipIf(!ENABLED)('chat tool-call probe (network)', () => {
  it(
    'no candidate narrates an edit, or leaks reasoning into the payload',
    async () => {
      const system = buildSystemPrompt(
        gallerySampleResumeData,
        jobContext as never,
        null,
        { isMaster: false, variantCount: 0 }
      );
      console.log(`\n### system prompt: ${system.length} chars`);
      console.log(`### attempts per model: ${EDIT_ATTEMPTS}`);
      console.log(`### candidates: ${MODELS.join(', ')}\n`);

      const summary: {
        model: string;
        passed: number;
        attempts: number;
        narrations: number;
        leaks: number;
        badArgs: number;
        errors: number;
        medianMs: number;
      }[] = [];

      for (const model of MODELS) {
        const attempts: Attempt[] = [];
        for (let i = 0; i < EDIT_ATTEMPTS; i++) {
          const a = await attemptEdit(model, system);
          attempts.push(a);
          console.log(
            `  ${model} #${i + 1}: ${
              a.error
                ? `ERROR ${a.error}`
                : `tools=[${a.toolsCalled.join(',')}] argsValid=${a.argsValid} leak=${a.leak} narrate=${a.narration} ${a.ms}ms`
            }`
          );
          if (!a.error) {
            console.log(
              `      tokens: in=${a.inputTokens ?? '?'} (cached ${a.cachedInputTokens ?? 0}) out=${a.outputTokens ?? '?'} (reasoning ${a.reasoningTokens ?? 0}) total=${(a.inputTokens ?? 0) + (a.outputTokens ?? 0)}`
            );
          }
          if (a.argProblem) console.log(`      argProblem: ${a.argProblem}`);
          if (a.leak) console.log(`      LEAKED PAYLOAD: ${JSON.stringify(a.text)}`);
          if (!a.toolCalled && !a.error) {
            console.log(`      NO TOOL CALL, text: ${JSON.stringify(a.text)}`);
          }
        }

        const ok = attempts.filter((a) => !a.error);
        const passed = ok.filter(
          (a) => a.toolsCalled.includes('editResume') && a.argsValid && !a.leak
        ).length;
        const narrations = ok.filter((a) => a.narration).length;
        const leaks = ok.filter((a) => a.leak).length;
        const badArgs = ok.filter(
          (a) => a.toolsCalled.includes('editResume') && !a.argsValid
        ).length;
        const errors = attempts.filter((a) => a.error).length;
        const times = ok.map((a) => a.ms).sort((x, y) => x - y);
        const medianMs = times.length ? times[Math.floor(times.length / 2)] : 0;

        summary.push({
          model,
          passed,
          attempts: ok.length,
          narrations,
          leaks,
          badArgs,
          errors,
          medianMs
        });

        console.log(
          `  → ${model}: edited ${passed}/${ok.length}, narrate ${narrations}, leak ${leaks}, badArgs ${badArgs}, errors ${errors}, median ${medianMs}ms\n`
        );
      }

      console.log('\n### SUMMARY');
      for (const s of summary) {
        const verdict =
          s.errors === s.attempts && s.attempts > 0
            ? 'UNREACHABLE'
            : s.narrations > 0 || s.leaks > 0
              ? 'UNSAFE — silent no-op or payload leak'
              : s.badArgs > 0
                ? 'UNSAFE — malformed arguments'
                : s.passed === s.attempts && s.attempts > 0
                  ? 'ok'
                  : 'INCONCLUSIVE';
        console.log(
          `  ${s.model.padEnd(40)} edited ${s.passed}/${s.attempts}  narrate ${s.narrations}  leak ${s.leaks}  badArgs ${s.badArgs}  err ${s.errors}  ${s.medianMs}ms  ${verdict}`
        );
      }

      const unsafe = summary.filter((s) => s.narrations > 0 || s.leaks > 0 || s.badArgs > 0);
      expect(
        unsafe.map(
          (s) => `${s.model} (narrate ${s.narrations}, leak ${s.leaks}, badArgs ${s.badArgs})`
        )
      ).toEqual([]);
    },
    1_800_000
  );
});
