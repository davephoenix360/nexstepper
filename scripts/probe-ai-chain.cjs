/**
 * Live-probe the AI model chain in lib/ai/providers.ts.
 *
 * Answers "is the AI actually callable right now, and which model
 * answers?" without needing a browser or a signed-in session. Model
 * availability on Vercel AI Gateway rots — this file's own header says
 * to re-verify by calling rather than trusting a catalog tag — so this
 * exists to make re-verification a single command.
 *
 * Two probes per chat model, because the failure modes differ:
 *   basic — a plain reply (catches 403 credit exhaustion)
 *   tool  — a FORCED tool_choice (catches models that narrate a tool
 *           call as prose instead of emitting one; this is exactly how
 *           ling-3.1-flash corrupted resume content)
 *
 * The key is read from .env.local and never printed.
 *
 * Usage: node scripts/probe-ai-chain.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const env = fs.readFileSync(path.resolve('.env.local'), 'utf8');
const key = (env.split(/\r?\n/).find((l) => l.startsWith('AI_GATEWAY_API_KEY=')) || '')
  .slice('AI_GATEWAY_API_KEY='.length).trim().replace(/^"|"$/g, '');

if (!key) throw new Error('AI_GATEWAY_API_KEY missing from .env.local');

const URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'rewrite_bullet',
      description: 'Rewrite a resume bullet more strongly.',
      parameters: {
        type: 'object',
        properties: { bulletId: { type: 'string' }, text: { type: 'string' } },
        required: ['bulletId', 'text'],
      },
    },
  },
];

async function call(model, { forceTool = false } = {}) {
  const body = {
    model,
    messages: [
      { role: 'system', content: 'You are a resume assistant. Call the tool; do not narrate.' },
      { role: 'user', content: 'Make bullet b1 stronger.' },
    ],
    max_tokens: 600,
  };
  if (forceTool) {
    body.tools = TOOLS;
    body.tool_choice = { type: 'function', function: { name: 'rewrite_bullet' } };
  }

  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  const j = await res.json();
  if (!res.ok) {
    return { ok: false, status: res.status, err: j?.error?.message ?? JSON.stringify(j).slice(0, 160) };
  }

  const msg = j.choices?.[0]?.message;
  const calls = msg?.tool_calls ?? [];
  return {
    ok: true,
    toolCall: calls.length > 0,
    // Reasoning leaking into arguments is the failure that writes junk
    // onto a user's resume, so surface the raw argument text.
    argText: calls[0]?.function?.arguments ?? '',
    content: (msg?.content ?? '').slice(0, 90),
  };
}

const CHAT = [
  'anthropic/claude-haiku-5.5',
  'reflection/beam-free',
  'amazon/nova-micro',
  'zai/glm-5.3-flash',
  'nvidia/nemotron-3.5-lightning-free',
];
const PARSE = ['mistral/mistral-nemo'];

(async () => {
  console.log('CHAT CHAIN\n');
  for (const m of CHAT) {
    const basic = await call(m);
    const tool = basic.ok ? await call(m, { forceTool: true }) : { ok: false };
    const mark = basic.ok ? (tool.ok && tool.toolCall ? 'OK  ' : basic.ok ? 'WARN' : 'FAIL') : 'FAIL';
    console.log(`${mark}  ${m}`);
    if (!basic.ok) {
      console.log(`        ${basic.status} ${basic.err}`);
      continue;
    }
    if (!tool.ok) console.log(`        tool probe: ${tool.err ?? 'failed'}`);
    else if (!tool.toolCall) console.log(`        tool probe: NO tool_calls — ${tool.content}`);
    else {
      // A real call, not narration. Flag it loudly if it looks like prose.
      const leaked = /^(the |i |sure|okay|let)/i.test(tool.argText.replace(/^\{\s*/, ''));
      console.log(`        tool ok${leaked ? '  ⚠ possible reasoning leak' : ''}  args=${tool.argText.slice(0, 70)}`);
    }
  }

  console.log('\nPARSER CHAIN\n');
  for (const m of PARSE) {
    const r = await call(m);
    console.log(r.ok ? `OK    ${m}  → ${r.content}` : `FAIL  ${m}  ${r.status} ${r.err}`);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});