/**
 * Measure how many pages a resume takes at a given content volume and
 * print settings, by printing it through the real template + real print
 * CSS and counting the PDF pages.
 *
 * ## The three things this has to get right
 *
 * 1. **Incrementally.** The first version wrote its JSON only at the end,
 *    so a stall on the last template lost every measurement. Now the
 *    results file is written after each combination, and a separate
 *    summariser reads the PDFs off disk — so a broken summary step
 *    never costs a re-run.
 *
 * 2. **Maximum, not first.** "How many roles fit on one page" means the
 *    LARGEST role count that still fits. The smallest is always 0 and
 *    says nothing.
 *
 * 3. **Wait for the root margin mirror.** `@page { margin: var(--resume-margin) }`
 *    only sees the value once `PrintSettingsVars` has written it onto the
 *    root element in a `useEffect`. Rendering before that silently uses
 *    the 0.4in fallback — which is what the original sweep did for every
 *    one of its 486 points, making the margin preset look inert.
 *    `openMeasurePage()` in scripts/lib/print-harness.cjs waits for it.
 *
 * Usage:
 *   node scripts/measure-page-counts.cjs
 *   node scripts/measure-page-counts.cjs --templates=classic,modern --settings=standard
 *   node scripts/measure-page-counts.cjs --content=minimal --bullets=3 --maxroles=8
 *   node scripts/measure-page-counts.cjs --fresh     # ignore existing results
 */
const fs = require('node:fs');
const path = require('node:path');

const {
  SETTINGS,
  contentWidthPx,
  settingMarginIn,
  openMeasurePage,
  countPages,
  resolvePlaywright,
  settingsQuery
} = require('./lib/print-harness.cjs');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);

const BASE = args.url ?? 'http://localhost:3000';
const OUT_DIR = path.resolve(args.out ?? 'output/pc-minimal');
const TEMPLATES = (args.templates ?? 'classic,minimal,modern,executive,creative,jake').split(',');
const CONTENT_BASE = args.content ?? 'full';
const MAX_ROLES = Number.parseInt(args.maxroles ?? '8', 10);
const BULLET_SETS = (args.bullets ?? '2,3,4').split(',').map((n) => Number.parseInt(n, 10));
const FRESH = args.fresh === 'true';

(async () => {
  const { chromium } = resolvePlaywright();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const resultsPath = path.join(OUT_DIR, 'results.json');
  const results = [];

  // Resume support: keep the measurements already on disk so a re-run
  // only pays for what is missing.
  if (!FRESH && fs.existsSync(resultsPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      if (prev.contentBase === CONTENT_BASE) {
        results.push(...prev.results);
        console.log(`resuming: ${results.length} existing measurements`);
      }
    } catch {
      /* start fresh */
    }
  }
  const done = new Set(results.map((r) => `${r.template}|${r.setting}|${r.roles}|${r.bullets}`));

  const combos = [];
  for (const template of TEMPLATES) {
    for (const setting of Object.keys(SETTINGS)) {
      for (let roles = 0; roles <= MAX_ROLES; roles++) {
        for (const bullets of BULLET_SETS) {
          combos.push({ template, setting, roles, bullets });
        }
      }
    }
  }

  let i = 0;
  let browser = null;
  let page = null;
  let currentViewport = 0;
  let currentTemplate = null;

  for (const combo of combos) {
    i++;
    const key = `${combo.template}|${combo.setting}|${combo.roles}|${combo.bullets}`;
    if (done.has(key)) continue;

    const url =
      `${BASE}/dev/design-lab/measure?template=${combo.template}` +
      `&roles=${combo.roles}&bullets=${combo.bullets}&base=${CONTENT_BASE}` +
      `&${settingsQuery(combo.setting)}`;

    // The viewport width does not affect the PDF (Chromium re-lays out at
    // the paper width), but it DOES affect the on-screen layout — so it is
    // set to the paper content width to keep the two in agreement.
    const vw = contentWidthPx(settingMarginIn(combo.setting));

    // A fresh browser per template: one long-lived browser leaked to 69
    // Chrome processes and eventually starved the dev server.
    if (!browser || currentTemplate !== combo.template) {
      if (browser) await browser.close();
      browser = await chromium.launch();
      page = await browser.newPage({ viewport: { width: vw, height: 1056 } });
      currentViewport = vw;
      currentTemplate = combo.template;
    }
    if (vw !== currentViewport) {
      await page.setViewportSize({ width: vw, height: 1056 });
      currentViewport = vw;
    }

    await openMeasurePage(page, url, { print: false });

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

    // Write incrementally — a stall must not cost the whole sweep.
    fs.writeFileSync(
      resultsPath,
      JSON.stringify({ contentBase: CONTENT_BASE, results }, null, 2)
    );

    process.stdout.write(
      `[${String(i).padStart(3)}/${combos.length}] ${combo.template.padEnd(9)} ` +
        `${combo.setting.padEnd(9)} roles=${combo.roles} bullets=${combo.bullets} ` +
        `→ ${pages} page(s)\n`
    );
  }

  if (browser) await browser.close();

  // ─── summary: MAXIMUM roles that still fit on one page ───────────────
  const settings = Object.keys(SETTINGS);
  const bulletsShown = BULLET_SETS[0];
  console.log('');
  console.log(
    `MAX ROLES THAT STILL FIT ON ONE PAGE (base: ${CONTENT_BASE}, ${bulletsShown} bullets/role)`
  );
  console.log(
    'template'.padEnd(12) + settings.map((s) => s.padEnd(12)).join('')
  );
  for (const template of TEMPLATES) {
    const cells = settings.map((setting) => {
      const rows = results
        .filter(
          (r) =>
            r.template === template &&
            r.setting === setting &&
            r.bullets === bulletsShown
        )
        .sort((a, b) => a.roles - b.roles);
      const fits = rows.filter((r) => r.pages === 1);
      const max = fits.length ? Math.max(...fits.map((r) => r.roles)) : null;
      return (max === null ? 'never' : `${max} roles`).padEnd(12);
    });
    console.log(template.padEnd(12) + cells.join(''));
  }
})().catch((e) => {
  console.error(String(e).slice(0, 800));
  process.exitCode = 1;
});
