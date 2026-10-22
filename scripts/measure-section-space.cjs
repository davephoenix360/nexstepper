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
 * ## The measurement width matters
 *
 * The DOM has to be measured at the PAPER CONTENT WIDTH (paper width
 * minus the page margin), because that is the width the text wraps at
 * when it prints. Measuring at the 8.5in screen width wraps less text
 * and reports a shorter resume than the one that prints — which makes
 * every per-section figure wrong.
 *
 * The `@page` margin also only applies once the root mirror has run, so
 * the harness waits for it; see scripts/lib/print-harness.cjs.
 *
 * Usage:
 *   node scripts/measure-section-space.cjs [--templates=classic,modern] [--out=output/x]
 */
const fs = require('node:fs');
const path = require('node:path');

const {
  SETTINGS,
  contentWidthPx,
  settingMarginIn,
  usableHeightIn,
  openMeasurePage,
  printableHeightIn,
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

    async function totalInches(setting, hidden) {
      const url =
        `${BASE}/dev/design-lab/measure?template=${template}` +
        `&roles=3&bullets=3&base=full` +
        `&${settingsQuery(setting)}` +
        (hidden ? `&hidden=${hidden}` : '');

      // The viewport has to be the paper content width for this setting's
      // margin — that is the width the text wraps at when it prints.
      const vw = contentWidthPx(settingMarginIn(setting));
      const page = await browser.newPage({ viewport: { width: vw, height: 1056 } });
      try {
        await openMeasurePage(page, url);
        return await printableHeightIn(page);
      } finally {
        await page.close();
      }
    }

    for (const setting of Object.keys(SETTINGS)) {
      if (!wanted.has(setting)) continue;

      const usable = usableHeightIn(settingMarginIn(setting));
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
