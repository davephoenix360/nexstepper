// PDF render smoke test — uses the browser session cookie to call
// /api/pdf/render and save the resulting PDF. Drives the test
// account at .mavis-agent.md.
//
// Run: node scripts/pdf-smoke.cjs
//
// Output: output/playwright/smoke-output.pdf

const { chromium } = require(
  // The Playwright CLI pulled in a copy of `playwright` to its npx
  // cache; reuse it instead of installing a duplicate. Falls back to
  // a real `require('playwright')` if a future `pnpm add playwright`
  // lands.
  require('node:fs').existsSync(require('node:path').join(
    process.env.LOCALAPPDATA ?? '',
    'npm-cache\\_npx\\31e32ef8478fbf80\\node_modules\\playwright'
  ))
    ? require('node:path').join(
        process.env.LOCALAPPDATA,
        'npm-cache\\_npx\\31e32ef8478fbf80\\node_modules\\playwright'
      )
    : 'playwright'
);
const fs = require('node:fs/promises');
const path = require('node:path');

const AGENT_FILE = path.resolve(__dirname, '..', '.mavis-agent.md');
const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.resolve(__dirname, '..', 'output', 'playwright');

async function main() {
  // Parse the agent file for credentials
  const agentText = await fs.readFile(AGENT_FILE, 'utf8');
  const email = agentText.match(/Email:\s*(\S+)/)[1];
  const password = agentText.match(/Password:\s*(\S+)/)[1];
  console.log(`[smoke] signing in as ${email}`);

  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Log in
    await page.goto(`${BASE_URL}/sign-in`);
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
    console.log('[smoke] logged in, on', page.url());

    // Call the PDF render endpoint with the authed cookie
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/pdf/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html:
            '<article>' +
            '<header>' +
            '<h1 class="text-3xl font-bold text-blue-600">Smoke test</h1>' +
            '<p class="text-zinc-600 mt-2">If you can read this with bold blue text and proper spacing, the Tailwind pipeline is working end-to-end.</p>' +
            '</header>' +
            '<section class="mt-6">' +
            '<h2 class="text-xl font-semibold border-b border-zinc-300 pb-1">What this verifies</h2>' +
            '<ul class="list-disc ml-6 mt-2 space-y-1">' +
            '<li>Compiled Tailwind CSS inlines into the HTML shell</li>' +
            '<li>Brand color tokens (text-blue-600) resolve correctly</li>' +
            '<li>Font family + sizes flow through the compiled CSS</li>' +
            '<li>Spacing utilities (mt-2, mt-6, ml-6, space-y-1) work</li>' +
            '<li>Page-break utilities are present</li>' +
            '</ul>' +
            '</section>' +
            '</article>',
          options: { format: 'letter', printBackground: true, marginMm: 15 },
          resumeId: 'smoke-test',
          templateId: 'classic'
        })
      });
      // Serialize the ArrayBuffer to a plain array so it survives
      // the page.evaluate boundary (the runtime strips ArrayBuffers).
      const buf = new Uint8Array(await r.arrayBuffer());
      return {
        status: r.status,
        contentType: r.headers.get('content-type'),
        bytes: buf.byteLength,
        body: Array.from(buf)
      };
    });

    console.log('[smoke] response', {
      status: result.status,
      contentType: result.contentType,
      bytes: result.bytes
    });

    if (result.status !== 200) {
      const text = Buffer.from(result.body).toString('utf8');
      console.error('[smoke] non-200 response:', text);
      process.exit(1);
    }

    const outPath = path.join(OUT_DIR, 'smoke-output.pdf');
    await fs.writeFile(outPath, Buffer.from(result.body));
    console.log(`[smoke] PDF saved to ${outPath} (${result.bytes} bytes)`);

    // Bonus: render the editor's actual Classic template to PDF via
    // Playwright's own page.pdf() (uses Chromium's print engine — the
    // same one our Browserless pipeline uses). This is what the
    // real PDF would look like, generated locally with zero network.
    console.log('[smoke] rendering real PDF via Playwright + Chromium...');
    await page.goto(
      'http://localhost:3000/dashboard/resumes/f2f3548c-c2f9-45be-9494-7fdea85bdc04',
      { waitUntil: 'networkidle' }
    );
    // Give the template a moment to settle.
    await page.waitForTimeout(500);
    const realPdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' }
    });
    const realOut = path.join(OUT_DIR, 'real-template.pdf');
    await fs.writeFile(realOut, realPdf);
    console.log(`[smoke] real PDF saved to ${realOut} (${realPdf.length} bytes)`);
  } finally {
    // Keep the browser open for the next script if needed.
    if (process.env.SMOKE_KEEP_BROWSER !== '1') {
      await context.close();
      await browser.close();
    }
  }
}

main().catch((err) => {
  console.error('[smoke] failed:', err);
  process.exit(1);
});
