// pdf-render.cjs — render a hardcoded HTML doc to PDF using the
// compiled print.css + Chromium's print engine. Demonstrates that
// the CSS pipeline (app/print.css → lib/pdf-render/print.css) is
// working without needing a Browserless token.
//
// This is what a real PDF would look like (the Browserless path
// uses the same Chromium engine).
//
// Run: node scripts/pdf-render.cjs
// Out: output/playwright/real-css-demo.pdf

const { chromium } = require(
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

const PRINT_CSS = path.resolve(__dirname, '..', 'lib', 'pdf-render', 'print.css');
const OUT_PATH = path.resolve(__dirname, '..', 'output', 'playwright', 'real-css-demo.pdf');

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>__CSS__</style>
</head>
<body>
  <main class="mx-auto max-w-3xl bg-white p-8 shadow-lg">
    <header class="border-b border-zinc-200 pb-6">
      <h1 class="text-3xl font-bold text-zinc-900">Alex Morgan</h1>
      <p class="text-base text-zinc-600 mt-1">Senior Software Engineer</p>
      <p class="text-sm text-zinc-500 mt-2">
        alex@example.com · (555) 123-4567 · San Francisco, CA
      </p>
    </header>

    <section class="mt-6">
      <h2 class="text-sm font-bold uppercase tracking-wider text-indigo-600 border-b border-zinc-200 pb-1">
        Summary
      </h2>
      <p class="text-sm text-zinc-700 mt-3 leading-relaxed">
        Eight years building data-intensive web applications. Most recently
        led a team of five engineers migrating a legacy analytics platform
        from MySQL to ClickHouse, cutting query latency by 40x.
      </p>
    </section>

    <section class="mt-6">
      <h2 class="text-sm font-bold uppercase tracking-wider text-indigo-600 border-b border-zinc-200 pb-1">
        Experience
      </h2>
      <article class="mt-3">
        <div class="flex items-baseline justify-between">
          <h3 class="text-base font-semibold text-zinc-900">Senior Software Engineer</h3>
          <span class="text-xs text-zinc-500">2022 — Present</span>
        </div>
        <p class="text-sm italic text-zinc-600">Acme Analytics</p>
        <ul class="list-disc ml-5 mt-2 space-y-1 text-sm text-zinc-700">
          <li>Led migration of 12 TB analytics warehouse to ClickHouse</li>
          <li>Reduced dashboard p99 latency from 4.2s to 95ms</li>
          <li>Hired and onboarded four engineers across two timezones</li>
        </ul>
      </article>
    </section>

    <section class="mt-6">
      <h2 class="text-sm font-bold uppercase tracking-wider text-indigo-600 border-b border-zinc-200 pb-1">
        Skills
      </h2>
      <div class="flex flex-wrap gap-2 mt-3">
        <span class="px-2 py-1 bg-zinc-100 text-zinc-700 text-xs rounded">TypeScript</span>
        <span class="px-2 py-1 bg-zinc-100 text-zinc-700 text-xs rounded">PostgreSQL</span>
        <span class="px-2 py-1 bg-zinc-100 text-zinc-700 text-xs rounded">ClickHouse</span>
        <span class="px-2 py-1 bg-zinc-100 text-zinc-700 text-xs rounded">Next.js</span>
        <span class="px-2 py-1 bg-zinc-100 text-zinc-700 text-xs rounded">AWS</span>
      </div>
    </section>
  </main>
</body>
</html>`;

async function main() {
  const css = await fs.readFile(PRINT_CSS, 'utf8');
  const html = HTML.replace('__CSS__', css);
  console.log(`[demo] CSS: ${(css.length / 1024).toFixed(1)} KB`);
  console.log(`[demo] HTML: ${(html.length / 1024).toFixed(1)} KB`);

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  // Capture a PNG of the rendered page so the user can see the
  // visual styling. (The PDF text-extract above shows words but
  // not the indigo accent, borders, spacing — the PNG does.)
  const pngPath = OUT_PATH.replace('.pdf', '.png');
  await page.screenshot({ path: pngPath, fullPage: true });
  console.log(`[demo] PNG saved to ${pngPath}`);

  const pdf = await page.pdf({
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' }
  });

  await fs.writeFile(OUT_PATH, pdf);
  console.log(`[demo] PDF saved to ${OUT_PATH} (${(pdf.length / 1024).toFixed(1)} KB)`);

  await browser.close();
}

main().catch((err) => {
  console.error('[demo] failed:', err);
  process.exit(1);
});
