/**
 * Measure how much vertical space each section occupies, by DIFFERENCE.
 *
 * ## Why delta rather than band
 *
 * A first pass measured each section's band as "distance from its
 * heading to the next heading's top". That is close, but it is off for
 * the LAST section (0.51in measured vs 0.72in actually saved for
 * `interests`) because trailing margins and the container's
 * `scrollHeight` do not line up the way the arithmetic assumes.
 *
 * The delta method has no such edge cases: measure the total with
 * everything visible, measure it again with one section hidden, and the
 * difference IS the space that section occupies. It is also exactly the
 * number the assistant needs — "hiding Projects saves you 2.74 inches".
 *
 * Chromium runs with `emulateMedia({ media: 'print' })`, so the real
 * `@media print` rules apply, including `print:hidden` collapsing the
 * excluded section to zero height. That is the render the user's PDF
 * gets.
 *
 * Usage:
 *   node scripts/measure-section-space.cjs [--templates=classic,modern] [--out=output/x]
 */
const fs = require('node:fs');
const path = require('node:path');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);

const BASE = args.url ?? 'http://localhost:3000';
const OUT_DIR = path.resolve(args.out ?? 'output/section-space');
const TEMPLATES = (
  args.templates ?? 'classic,minimal,modern,executive,creative,jake'
).split(',');

/** Section slugs from SECTION_TABLE in lib/inline-issue/map-path-to-section.ts */
const SECTIONS = [
  'experience',
  'skills',
  'projects',
  'education',
  'awards',
  'certificates',
  'publications',
  'volunteer',
  'languages',
  'interests',
  'references'
];

const SETTINGS = {
  standard: { margin: 'standard', lineHeight: 'standard', fontSize: 'standard', sectionSpacing: 'standard' },
  compact: { margin: 'compact', lineHeight: 'compact', fontSize: 'standard', sectionSpacing: 'compact' },
  tightest: { margin: 'compact', lineHeight: 'compact', fontSize: 'small', sectionSpacing: 'compact' }
};

function resolvePlaywright() {
  try {
    return require('playwright');
  } catch {
    /* fall through to the npx cache */
  }
  const roots = [
    path.join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx'),
    path.join(process.env.HOME ?? '', '.npm', '_npx')
  ];
  const browserCache = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const candidates = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      const base = path.join(root, dir, 'node_modules');
      const core = path.join(base, 'playwright-core');
      const pw = path.join(base, 'playwright');
      if (!fs.existsSync(pw) || !fs.existsSync(core)) continue;
      let revision = null;
      try {
        const spec = JSON.parse(fs.readFileSync(path.join(core, 'browsers.json'), 'utf8'));
        revision =
          spec.browsers?.find((b) => b.name === 'chromium-headless-shell')?.revision ??
          spec.browsers?.find((b) => b.name === 'chromium')?.revision ??
          null;
      } catch {
        /* ignore */
      }
      const have =
        revision &&
        (fs.existsSync(path.join(browserCache, `chromium_headless_shell-${revision}`)) ||
          fs.existsSync(path.join(browserCache, `chromium-${revision}`)));
      candidates.push({ p: pw, have, mtime: fs.statSync(pw).mtimeMs });
    }
  }
  const usable = candidates.filter((c) => c.have);
  const pool = usable.length ? usable : candidates;
  pool.sort((a, b) => b.mtime - a.mtime);
  if (!pool.length) throw new Error('Playwright not found.');
  return require(pool[0].p);
}

(async () => {
  const { chromium } = resolvePlaywright();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const all = [];
  const wanted = args.settings
    ? new Set(args.settings.split(',').map((s) => s.trim()))
    : new Set(Object.keys(SETTINGS));

  /**
   * Write after EVERY template+setting, not once at the end.
   *
   * The first run of this script stalled on the last template and lost
   * every measurement, because the JSON was only written on completion.
   * An incremental write means a stall costs one combination, not the
   * whole sweep.
   */
  const persist = () => {
    fs.writeFileSync(
      path.join(OUT_DIR, 'section-space.json'),
      JSON.stringify(all, null, 2)
    );
  };

  for (const template of TEMPLATES) {
    // A fresh browser per template. One long-lived browser leaked
    // processes across ~200 navigations and eventually starved the
    // machine.
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });

    async function totalInches(setting, hidden) {
      const s = SETTINGS[setting];
      const url =
        `${BASE}/dev/design-lab/measure?template=${template}` +
        `&roles=3&bullets=3&base=full` +
        `&margin=${s.margin}&lineHeight=${s.lineHeight}` +
        `&fontSize=${s.fontSize}&sectionSpacing=${s.sectionSpacing}` +
        (hidden ? `&hidden=${hidden}` : '');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForSelector('.printable', { timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.emulateMedia({ media: 'print' });
      return page.evaluate(() => {
        const p = document.querySelector('.printable');
        return Math.round((p.scrollHeight / 96) * 100) / 100;
      });
    }

    for (const setting of Object.keys(SETTINGS)) {
      if (!wanted.has(setting)) continue;

      const usable =
        11 - (SETTINGS[setting].margin === 'compact' ? 0.5 : 0.75) * 2;
      const full = await totalInches(setting, '');
      const sections = {};

      for (const slug of SECTIONS) {
        const t = await totalInches(setting, slug);
        const saving = Math.round((full - t) * 100) / 100;
        // A saving of ~0 means this template has no such section (or it
        // renders nothing) — do not record a fake number.
        if (saving > 0.01) sections[slug] = saving;
      }

      all.push({
        template,
        setting,
        usableInches: Math.round(usable * 100) / 100,
        totalInches: full,
        pages: Math.round((full / usable) * 100) / 100,
        sectionInches: sections
      });
      persist();

      console.log(
        `${template.padEnd(10)} ${setting.padEnd(9)} usable=${usable.toFixed(2)}in ` +
          `total=${full.toFixed(2)}in -> ${(full / usable).toFixed(2)} pages`
      );
      for (const [slug, inches] of Object.entries(sections)) {
        console.log(`    ${slug.padEnd(14)} ${inches.toFixed(2)}in`);
      }
    }

    await browser.close();
  }

  persist();
  console.log(`\nwrote ${path.join(OUT_DIR, 'section-space.json')}`);
})().catch((e) => {
  console.error(String(e).slice(0, 500));
  process.exitCode = 1;
});
