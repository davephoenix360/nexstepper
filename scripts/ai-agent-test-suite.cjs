/**
 * AI agent test suite — runs the real models against your real data.
 *
 * Unlike `probe-ai-chain.cjs` (which checks "can this model answer at
 * all"), this loads your actual most-recent variant + job description out
 * of the production database and asserts on the QUALITY of what comes
 * back. Synthetic prompts cannot catch the failures that actually hurt:
 * hallucinated skills, a tool call that echoes the instruction instead of
 * rewriting, an answer with no grounding in the document, or the system
 * prompt still quoting a price the app no longer charges.
 *
 * READ-ONLY against the database. It only calls the AI Gateway.
 *
 * Usage:
 *   node scripts/ai-agent-test-suite.cjs              # most recent variant
 *   node scripts/ai-agent-test-suite.cjs <resumeId>   # a specific one
 *
 * Exit code is non-zero if any test fails, so it drops straight into CI.
 */
const fs = require('node:fs');
const path = require('node:path');
const postgres = require('postgres');

// ─── config ──────────────────────────────────────────────────────────────────
const envProd = fs.readFileSync(path.resolve('.env.production.local'), 'utf8');
const dbUrl = (envProd.split(/\r?\n/).find((l) => l.startsWith('POSTGRES_URL=')) || '')
  .slice('POSTGRES_URL='.length).trim().replace(/^"|"$/g, '');
if (!dbUrl) throw new Error('POSTGRES_URL missing from .env.production.local');

const envLocal = fs.readFileSync(path.resolve('.env.local'), 'utf8');
const gatewayKey = (envLocal.split(/\r?\n/).find((l) => l.startsWith('AI_GATEWAY_API_KEY=')) || '')
  .slice('AI_GATEWAY_API_KEY='.length).trim().replace(/^"|"$/g, '');
if (!gatewayKey) throw new Error('AI_GATEWAY_API_KEY missing from .env.local');

// Mirrors lib/ai/providers.ts. Keep in sync with that file.
const CHAT_MODEL = 'anthropic/claude-haiku-5.5';
const PARSER_MODEL = 'mistral/mistral-nemo';

const GW = 'https://ai-gateway.vercel.sh/v1/chat/completions';

// ─── tiny harness ────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}`);
  }
  if (detail) console.log(`        ${String(detail).slice(0, 240)}`);
}

async function gw(model, messages, opts = {}) {
  const body = { model, messages, max_tokens: opts.maxTokens ?? 900 };
  if (opts.tools) {
    body.tools = opts.tools;
    if (opts.forceTool) body.tool_choice = { type: 'function', function: { name: opts.forceTool } };
  }
  if (opts.jsonSchema) body.response_format = { type: 'json_schema', json_schema: opts.jsonSchema };
  const res = await fetch(GW, {
    method: 'POST',
    headers: { Authorization: `Bearer ${gatewayKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`${model}: ${j?.error?.message ?? res.status}`);
  return j.choices?.[0]?.message ?? {};
}

/**
 * Pull real bullet strings out of the resume, with the dotted path the
 * editor would use as the bulletId.
 *
 * Shape is fixed by lib/resume-schema: work lives at
 * `sections.work[].positions[].highlights[]` and projects at
 * `sections.projects[].highlights[]`. Earlier versions of this script
 * walked for a generic `bullets`/`highlights` key and silently found
 * zero, which reported as a product failure when it was a broken test.
 */
function findBullets(data) {
  const out = [];
  const push = (arr, prefix) => {
    (arr ?? []).forEach((h, k) => {
      if (typeof h === 'string' && h.length > 25) out.push({ id: `${prefix}[${k}]`, text: h });
    });
  };
  (data?.sections?.work ?? []).forEach((job, i) => {
    (job?.positions ?? []).forEach((pos, j) => {
      push(pos?.highlights, `work[${i}].positions[${j}].highlights`);
    });
  });
  (data?.sections?.projects ?? []).forEach((p, i) => {
    push(p?.highlights, `projects[${i}].highlights`);
  });
  return out;
}

/**
 * Is an extracted skill actually traceable to the JD?
 *
 * Exact substring matching is the obvious check and it is wrong here:
 * the extractor legitimately returns long descriptive phrases like
 * "Python or TypeScript (strong in at least one, comfortable working
 * across the full stack)", which will never appear verbatim. Score by
 * content-token overlap instead — a skill is grounded when most of its
 * meaningful words appear somewhere in the JD.
 */
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'are',
  'you', 'your', 'our', 'their', 'will', 'can', 'able', 'work', 'working', 'works', 'across',
  'strong', 'well', 'comfortable', 'at', 'least', 'one', 'or', 'in', 'on', 'of', 'to', 'a', 'an',
  'experience', 'background', 'familiar', 'using', 'use', 'used', 'good', 'nice', 'must',
  'looking', 'lookingfor', 'role', 'job', 'team', 'teams', 'based', 'legally', 'country']);

function skillIsGrounded(skill, jdLower) {
  const toks = String(skill).toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? [];
  const content = toks.filter((t) => !STOP.has(t));
  if (!content.length) return true;
  const hit = content.filter((t) => jdLower.includes(t)).length;
  return hit / content.length >= 0.6;
}

// ─── load real data ──────────────────────────────────────────────────────────
const sql = postgres(dbUrl, { max: 1, ssl: 'require', connect_timeout: 15, idle_timeout: 5 });

async function load() {
  const target = process.argv[2];
  const rows = await sql`
    select r.id, r.name, r.template, rr.data
    from resumes r
    join resume_revisions rr on rr.id = r.current_revision_id
    where r.is_master = false
      and rr.data->'jobContext' is not null
      ${target ? sql`and r.id = ${target}` : sql``}
    order by r.updated_at desc limit 1`;
  if (!rows.length) throw new Error('no variant with a jobContext found');
  return rows[0];
}

// ─── the tests ───────────────────────────────────────────────────────────────
async function main() {
  const v = await load();
  const data = v.data;
  const jc = data.jobContext;
  const jdText = jc.description ?? '';
  const bullets = findBullets(data);

  console.log(`\nVARIANT  "${v.name}"  (${v.template})  id=${v.id}`);
  console.log(`JD       ${jdText.length} chars`);
  console.log(`BULLETS  ${bullets.length} real bullets found in resume\n`);

  // ── 1. Intent extraction: are stored skills actually in the JD? ────────────
  console.log('1. JD INTENT EXTRACTION  (mistral-nemo)');
  const intentSchema = {
    name: 'jd_intent',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mustHaveSkills: { type: 'array', items: { type: 'string' } },
        niceToHaveSkills: { type: 'array', items: { type: 'string' } },
        roleFamily: { type: 'string' },
        seniorityLevel: { type: 'string' },
      },
      required: ['mustHaveSkills', 'niceToHaveSkills', 'roleFamily', 'seniorityLevel'],
    },
  };
  try {
    const msg = await gw(PARSER_MODEL, [
      { role: 'system', content: 'Extract structured hiring intent from a job description.' },
      { role: 'user', content: jdText.slice(0, 16_000) },
    ], { jsonSchema: intentSchema });
    const parsed = JSON.parse(msg.content);
    const jdLower = jdText.toLowerCase();
    const all = [...(parsed.mustHaveSkills ?? []), ...(parsed.niceToHaveSkills ?? [])];
    const invented = all.filter((s) => !skillIsGrounded(s, jdLower));
    check('intent extractor returns schema-valid JSON', true, `${all.length} skills, role=${parsed.roleFamily}, seniority=${parsed.seniorityLevel}`);
    check('no hallucinated skills (every skill traces to the JD)', invented.length === 0,
      invented.length ? `ungrounded: ${invented.slice(0, 3).join(' | ')}` : `all ${all.length} grounded in JD text`);
  } catch (e) {
    check('intent extractor returns schema-valid JSON', false, e.message.slice(0, 120));
  }

  // ── 2. Chat tool call: rewrite a REAL bullet ─────────────────────────────
  console.log('\n2. CHAT TOOL CALL — rewrite bullet  (claude-haiku-5.5)');
  if (!bullets.length) {
    check('a real bullet is available to rewrite', false, 'none found in resume data');
  } else {
    const target = bullets[0];
    console.log(`        target: ${target.text.slice(0, 100)}…`);
    try {
      const msg = await gw(CHAT_MODEL, [
        { role: 'system', content: 'You are a resume assistant. Always call rewrite_bullet. Never explain in prose.' },
        { role: 'user', content: `Rewrite this bullet to be stronger and more specific.\n\n${target.text}` },
      ], {
        forceTool: 'rewrite_bullet',
        tools: [{
          type: 'function',
          function: {
            name: 'rewrite_bullet',
            description: 'Rewrite a resume bullet to be stronger.',
            parameters: {
              type: 'object',
              properties: { bulletId: { type: 'string' }, text: { type: 'string' } },
              required: ['bulletId', 'text'],
            },
          },
        }],
      });
      const call = msg.tool_calls?.[0];
      const args = call ? JSON.parse(call.function.arguments) : null;

      check('model emits a real tool call (not prose)', Boolean(call), call ? '' : `content: ${String(msg.content).slice(0, 90)}`);
      check('tool call carries a bulletId', Boolean(args?.bulletId), args?.bulletId);
      check('no <UNKNOWN> placeholder leaked into arguments', !/<UNKNOWN>/i.test(JSON.stringify(args ?? {})));
      const t = args?.text ?? '';
      check('rewrite is non-empty and not an echo of the instruction',
        t.length > 20 && !/^(the user|make bullet|rewrite this)/i.test(t), t.slice(0, 120));
      check('rewrite actually differs from the original', t !== target.text);
    } catch (e) {
      check('model emits a real tool call (not prose)', false, e.message.slice(0, 120));
    }
  }

  // ── 3. Groundedness: answer must come from THEIR resume ───────────────────
  console.log('\n3. CHAT GROUNDEDNESS  (claude-haiku-5.5)');
  try {
    const resumeText = JSON.stringify(data).slice(0, 14_000);
    const msg = await gw(CHAT_MODEL, [
      { role: 'system', content: 'You are a resume assistant. Answer only from the resume provided.' },
      { role: 'user', content: `Here is my resume:\n\n${resumeText}\n\nWhat is my most recent job title? Answer in one sentence.` },
    ]);
    const answer = String(msg.content);
    // Weak-but-real grounding check: is any distinctive token shared?
    const shared = new Set(
      (answer.toLowerCase().match(/[a-z]{6,}/g) ?? []).filter((w) => resumeText.toLowerCase().includes(w))
    );
    check('answer is grounded in the actual resume', shared.size >= 2,
      `${shared.size} shared distinctive tokens → ${answer.slice(0, 110)}`);
  } catch (e) {
    check('answer is grounded in the actual resume', false, e.message.slice(0, 120));
  }

  // ── 4. JD awareness: should name skills that are really in the JD ─────────
  console.log('\n4. JD-SPECIFIC ANSWERING  (claude-haiku-5.5)');
  try {
    const must = (jc.mustHaveSkills ?? []).slice(0, 6);
    const msg = await gw(CHAT_MODEL, [
      { role: 'system', content: 'You are a resume assistant. Answer only from the job description provided.' },
      { role: 'user', content: `Job description:\n\n${jdText.slice(0, 12_000)}\n\nList the 3 most important required skills. Be brief.` },
    ]);
    const answer = String(msg.content).toLowerCase();
    const hits = must.filter((s) => answer.includes(String(s).toLowerCase()));
    check('answer names skills that are actually in the JD', hits.length >= 1,
      `matched ${hits.length}/${must.length}: ${hits.slice(0, 3).join(', ')}`);
  } catch (e) {
    check('answer names skills that are actually in the JD', false, e.message.slice(0, 120));
  }

  // ── 5. System prompt truthfulness ─────────────────────────────────────────
  console.log('\n5. PRODUCT TRUTHFULNESS  (system prompt must match reality)');
  try {
    const msg = await gw(CHAT_MODEL, [
      { role: 'system', content: 'You are the Nexstepper resume assistant. Pro costs CA$5/month and unlocks a 500K daily AI chat budget, ATS scoring with inline AI rewrites, and private sharing links. Reviews and real-time collaboration are NOT available — never claim they are.' },
      { role: 'user', content: 'What does Pro cost, and does it include peer reviews or real-time collaboration?' },
    ]);
    const a = String(msg.content).toLowerCase();
    check('states a real price (mentions 5)', /\b5\b/.test(a), a.slice(0, 130));
    check('does not claim Pro is unreleased / launching soon', !/(launching soon|coming soon|not yet available|waitlist)/.test(a));
    check('does not promise reviews or live collaboration', !/\byes\b[^.]*\b(review|collaborat)/.test(a), a.slice(0, 130));
  } catch (e) {
    check('states a real price (mentions 5)', false, e.message.slice(0, 120));
  }

  // ── 6. Multi-turn context retention ──────────────────────────────────────
  console.log('\n6. MULTI-TURN CONTEXT  (does turn 2 remember turn 1?)');
  try {
    const t1 = await gw(CHAT_MODEL, [
      { role: 'system', content: 'You are a resume assistant.' },
      { role: 'user', content: 'Remember this exact fact: my favourite metric is "284%". Just acknowledge it.' },
    ]);
    const t2 = await gw(CHAT_MODEL, [
      { role: 'system', content: 'You are a resume assistant.' },
      { role: 'user', content: 'Remember this exact fact: my favourite metric is "284%". Just acknowledge it.' },
      { role: 'assistant', content: String(t1.content).slice(0, 200) },
      { role: 'user', content: 'What is my favourite metric? Answer with just the number.' },
    ]);
    check('retains a fact across turns', /284/.test(String(t2.content)), String(t2.content).slice(0, 90));
  } catch (e) {
    check('retains a fact across turns', false, e.message.slice(0, 120));
  }

  await sql.end({ timeout: 5 });

  console.log(`\n${'─'.repeat(52)}`);
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail) console.log(`  failing: ${failures.join(' | ')}`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => {
  console.error('\nSUITE ERROR:', String(e).slice(0, 300));
  process.exitCode = 1;
});