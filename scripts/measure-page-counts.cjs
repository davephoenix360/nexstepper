/**
 * Page-count measurement driver.
 *
 * Prints the dev measurement route to PDF through Chromium — the SAME
 * pipeline as the browser's own "Save as PDF" — and counts the pages.
 *
 * ## Why this exists
 *
 * The chat assistant has to answer "will this fit on one page?" and it
 * cannot render the document. Everything it says about length today is
 * a guess from the user's prose, which is how users end up printing,
 * finding three pages, and coming back annoyed.
 *
 * This turns that guess into a measured number, so the guidelines baked
 * into the agent's prompt are measurements rather than folklore.
 *
 * ## Usage
 *
 *   node scripts/measure-page-counts.cjs                 # default matrix
 *   node scripts/measure-page-counts.cjs --url=http://localhost:3000
 *   node scripts/measure-page-counts.cjs --content=minimal --out=output/x
 *   node scripts/measure-page-counts.cjs --template=classic
 *
 * Flags:
 *   --url       dev server base URL (default http://localhost:3000)
 *   --content   full | minimal  (which non-work sections to include)
 *   --template  template id to measure (default modern)
 *   --out       output directory (default output/pagecounts)
 *
 * Requires:
 *   - the dev server running (`pnpm dev`)
 *   - `pypdf` (pip install pypdf) for counting pages
 *   - a Playwright install; this script resolves it from the npx cache
 *     first (so it does not touch the repo's package manager) and falls
 *     back to a normal `require('playwright')`.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);

const BASE = args.url ?? 'http://localhost:3000';
const OUT_DIR = path.resolve(args.out ?? 'output/pagecounts');
const TEMPLATES = (args.templates ?? args.template ?? 'modern').split(',');
const CONTENT_BASE = args.content ?? 'full';

// ─── locate playwright without touching package.json ────────────────────
/**
 * Resolve a Playwright install whose Chromium revision is ACTUALLY on
 * disk.
 *
 * The npx cache holds several Playwright versions, each pinned to a
 * different Chromium build. Picking the newest one blindly fails with
 * "Executable doesn't exist" when its browser was never downloaded, so
 * this cross-references each candidate's browsers.json against the
 * ms-playwright cache and takes the newest match.
 */
function resolvePlaywright() {
  try {
    return require('playwright');
  } catch {
    /* fall through to the npx cache */
  }

  const cacheRoots = [
    path.join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx'),
    path.join(process.env.HOME ?? '', '.npm', '_npx')
  ];
  const browserCache = path.join(
    process.env.LOCALAPPDATA ?? '',
    'ms-playwright'
  );

  const candidates = [];
  for (const root of cacheRoots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      const base = path.join(root, dir, 'node_modules');
      const pw = path.join(base, 'playwright');
      const core = path.join(base, 'playwright-core');
      if (!fs.existsSync(pw) || !fs.existsSync(core)) continue;

      const browsersJson = path.join(core, 'browsers.json');
      let revision = null;
      if (fs.existsSync(browsersJson)) {
        try {
          const spec = JSON.parse(fs.readFileSync(browsersJson, 'utf8'));
          const shell = spec.browsers?.find((b) => b.name === 'chromium-headless-shell');
          const chromium = spec.browsers?.find((b) => b.name === 'chromium');
          revision = shell?.revision ?? chromium?.revision ?? null;
        } catch {
          /* ignore malformed metadata */
        }
      }

      const haveBrowser =
        revision &&
        (fs.existsSync(path.join(browserCache, `chromium_headless_shell-${revision}`)) ||
          fs.existsSync(path.join(browserCache, `chromium-${revision}`)));

      candidates.push({
        p: pw,
        revision,
        haveBrowser,
        mtime: fs.statSync(pw).mtimeMs
      });
    }
  }

  const usable = candidates.filter((c) => c.haveBrowser);
  const pool = usable.length ? usable : candidates;
  if (!pool.length) {
    throw new Error(
      'Playwright not found. Install it (npm i -g @playwright/cli@latest) or run `npx playwright install chromium`.'
    );
  }
  pool.sort((a, b) => b.mtime - a.mtime);
  const chosen = pool[0];
  if (!chosen.haveBrowser) {
    console.warn(
      `[measure] No cached Chromium matched (want rev ${chosen.revision}). Run \`npx playwright install chromium\`.`
    );
  }
  return require(chosen.p);
}

// ─── page counting via pypdf ────────────────────────────────────────────
function countPages(pdfPath) {
  const script =
    'import sys\n' +
    'from pypdf import PdfReader\n' +
    'print(len(PdfReader(sys.argv[1]).pages))\n';
  const out = execFileSync('python', ['-c', script, pdfPath], { encoding: 'utf8' });
  return Number.parseInt(out.trim(), 10);
}

// ─── the matrix ─────────────────────────────────────────────────────────
const SETTINGS = {
  standard: { margin: 'standard', lineHeight: 'standard', fontSize: 'standard', sectionSpacing: 'standard' },
  marginOnly: { margin: 'compact', lineHeight: 'standard', fontSize: 'standard', sectionSpacing: 'standard' },
  lineOnly: { margin: 'standard', lineHeight: 'compact', fontSize: 'standard', sectionSpacing: 'standard' },
  spacingOnly: { margin: 'standard', lineHeight: 'standard', fontSize: 'standard', sectionSpacing: 'compact' },
  compact: { margin: 'compact', lineHeight: 'compact', fontSize: 'standard', sectionSpacing: 'compact' },
  tightest: { margin: 'compact', lineHeight: 'compact', fontSize: 'small', sectionSpacing: 'compact' }
};

const ROWS = [];
const MAX_ROLES = Number.parseInt(args.maxroles ?? '8', 10);
const BULLET_SETS = (args.bullets ?? '2,3,4')
  .split(',')
  .map((n) => Number.parseInt(n, 10))
  .filter((n) => Number.isFinite(n));
for (const roles of Array.from({ length: MAX_ROLES + 1 }, (_, i) => i)) {
  for (const bullets of BULLET_SETS) {
    ROWS.push({ roles, bullets });
  }
}

(async () => {
  const { chromium } = resolvePlaywright();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const results = [];
  const combos = [];
  const wanted = args.settings
    ? new Set(args.settings.split(',').map((s) => s.trim()))
    : null;
  for (const setting of Object.keys(SETTINGS)) {
    if (wanted && !wanted.has(setting)) continue;
    for (const template of TEMPLATES) {
      for (const row of ROWS) combos.push({ setting, template, ...row });
    }
  }

  let i = 0;
  for (const combo of combos) {
    i++;
    const s = SETTINGS[combo.setting];
    const url =
      `${BASE}/dev/design-lab/measure?template=${combo.template}` +
      `&roles=${combo.roles}&bullets=${combo.bullets}&base=${CONTENT_BASE}` +
      `&margin=${s.margin}&lineHeight=${s.lineHeight}` +
      `&fontSize=${s.fontSize}&sectionSpacing=${s.sectionSpacing}`;

    // `networkidle` is unusable against the Next dev server: the HMR
    // websocket keeps a connection open, so the network never actually
    // goes idle and the wait can hang indefinitely (observed on the
    // classic template, which stalled on the 5th combination). Wait for
    // the DOM, then wait for the element we actually care about.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.printable', { timeout: 20_000 });
    // Let fonts settle so line-breaking matches what a user would get.
    await page.evaluate(() => document.fonts.ready);

    const file = path.join(
      OUT_DIR,
      `${combo.template}-${combo.setting}-r${combo.roles}-b${combo.bullets}.pdf`
    );
    await page.pdf({
      path: file,
      preferCSSPageSize: true,
      printBackground: true,
      timeout: 45_000
    });

    const pages = countPages(file);
    results.push({ ...combo, pages, file });
    process.stdout.write(
      `[${String(i).padStart(3)}/${combos.length}] ${combo.setting.padEnd(9)} ` +
        `roles=${combo.roles} bullets=${combo.bullets} → ${pages} page(s)\n`
    );
  }

  await browser.close();

  // ─── summary tables ───────────────────────────────────────────────────
  const bySetting = {};
  for (const r of results) {
    bySetting[r.setting] ??= {};
    bySetting[r.setting][`${r.roles}x${r.bullets}`] = r.pages;
  }

  const keys = ROWS.map((r) => `${r.roles}x${r.bullets}`);
  const lines = [];
  lines.push('');
  lines.push(`PAGES BY CONTENT VOLUME — template: ${TEMPLATE}`);
  lines.push('(roles x bullets-per-role → pages)');
  lines.push('');
  lines.push(
    ['content'.padEnd(12), ...Object.keys(SETTINGS).map((k) => k.padEnd(10))].join(' ')
  );
  lines.push('-'.repeat(12 + Object.keys(SETTINGS).length * 10));
  for (const key of keys) {
    lines.push(
      [key.padEnd(12), ...Object.keys(SETTINGS).map((k) => String(bySetting[k]?.[key] ?? '-').padEnd(10))].join(' ')
    );
  }

  const summary = lines.join('\n');
  console.log(summary);
  fs.writeFileSync(path.join(OUT_DIR, 'summary.txt'), summary);

  fs.writeFileSync(
    path.join(OUT_DIR, 'results.json'),
    JSON.stringify({ template: TEMPLATE, results }, null, 2)
  );
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
