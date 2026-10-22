/**
 * Shared helpers for the print-measurement harness.
 *
 * ## The two facts every measurement depends on
 *
 * 1. **The DOM must be measured at the PAPER CONTENT WIDTH.**
 *
 *    The printed page lays out at `paper width - 2 x page margin`:
 *
 *      standard margin (0.75") -> 8.5 - 1.5 = 7.0in  (672px)
 *      compact  margin (0.5")  -> 8.5 - 1.0 = 7.5in  (720px)
 *      generous margin (1")    -> 8.5 - 2.0 = 6.5in  (624px)
 *
 *    Measuring at 8.5in (the screen width) wraps less text per line and
 *    therefore reports a SHORTER resume than the one that prints. The
 *    first version of the formula script did exactly that, and every
 *    height it produced was wrong.
 *
 * 2. **The `@page` margin is only applied AFTER the root mirror runs.**
 *
 *    `@page { margin: var(--resume-margin, 0.4in) }` resolves custom
 *    properties against the ROOT element. The per-resume value is written
 *    to `document.documentElement` by `PrintSettingsVars` inside a
 *    `useEffect`, so until that effect has run the page box silently uses
 *    the 0.4in fallback.
 *
 *    Rendering a PDF before the effect fires therefore measures a resume
 *    printed with the WRONG margin — which is what the original 486-point
 *    sweep did, for every single point.
 *
 *    `waitForRootMargin()` exists to close that race.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PAPER_WIDTH_IN = 8.5;
const PAPER_HEIGHT_IN = 11;

/** Page margins, in inches, keyed by the `margin` preset. */
const MARGIN_IN = {
  compact: 0.5,
  standard: 0.75,
  generous: 1
};

/** Width of the printed content area, in inches. */
function contentWidthIn(marginIn) {
  return PAPER_WIDTH_IN - 2 * marginIn;
}

/** Height of the printed content area, in inches. */
function usableHeightIn(marginIn) {
  return PAPER_HEIGHT_IN - 2 * marginIn;
}

/** Width of the printed content area, in CSS pixels (96 per inch). */
function contentWidthPx(marginIn) {
  return Math.round(contentWidthIn(marginIn) * 96);
}

/**
 * Wait until the per-resume CSS variables have been mirrored onto the
 * root element, so `@page` picks up the real margin.
 *
 * Without this, every PDF measures the 0.4in fallback margin and the
 * "margin" preset appears to do nothing in print — the exact bug the
 * globals.css comment warns about.
 */
async function waitForRootMargin(page, timeout = 15_000) {
  try {
    await page.waitForFunction(
      () => {
        const v = document.documentElement.style.getPropertyValue('--resume-margin');
        return typeof v === 'string' && v.trim().length > 0;
      },
      undefined,
      { timeout }
    );
  } catch {
    const got = await page.evaluate(
      () => document.documentElement.style.getPropertyValue('--resume-margin') || '(none)'
    );
    console.warn(
      `  ! --resume-margin was never mirrored onto :root (got ${got}). ` +
        `The @page margin will fall back to 0.4in — measurement is invalid.`
    );
    return false;
  }
  return true;
}

/** Read back the margin actually in force, for the run log. */
async function readRootMargin(page) {
  return page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--resume-margin').trim()
  );
}

/**
 * Load a measurement URL and wait until it is genuinely ready to measure:
 * the resume is rendered, fonts are loaded, print CSS is active, and the
 * root variables are mirrored.
 */
async function openMeasurePage(page, url, { print = true } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForSelector('.printable', { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  await waitForRootMargin(page);
  if (print) await page.emulateMedia({ media: 'print' });
}

/** Height of the `.printable` element, in inches. */
async function printableHeightIn(page) {
  const px = await page.evaluate(() => {
    const p = document.querySelector('.printable');
    return p.scrollHeight;
  });
  return Math.round((px / 96) * 100) / 100;
}

/** Number of pages in a PDF. */
function countPages(file) {
  const script =
    'import sys\nfrom pypdf import PdfReader\nprint(len(PdfReader(sys.argv[1]).pages))\n';
  return Number.parseInt(
    execFileSync('python', ['-c', script, file], { encoding: 'utf8' }).trim(),
    10
  );
}

/**
 * Locate a Playwright install whose browser binaries are actually
 * present. Playwright resolves from the npx cache, and the version there
 * must match a revision in %LOCALAPPDATA%\ms-playwright.
 */
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
      const pw = path.join(base, 'playwright');
      const core = path.join(base, 'playwright-core');
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

/**
 * The three presets the assistant reasons about.
 *
 * `margin` decides the paper content WIDTH (how the DOM must be measured)
 * and the usable HEIGHT (how many inches fit on a page); the rest decide
 * how much text fits inside that width.
 */
const SETTINGS = {
  standard: {
    margin: 'standard',
    lineHeight: 'standard',
    fontSize: 'standard',
    sectionSpacing: 'standard',
    itemSpacing: 'standard'
  },
  compact: {
    margin: 'compact',
    lineHeight: 'compact',
    fontSize: 'standard',
    sectionSpacing: 'compact',
    itemSpacing: 'compact'
  },
  tightest: {
    margin: 'compact',
    lineHeight: 'compact',
    fontSize: 'small',
    sectionSpacing: 'compact',
    itemSpacing: 'compact'
  }
};

/** The query string for a settings preset. */
function settingsQuery(setting) {
  const s = SETTINGS[setting] ?? SETTINGS.standard;
  return (
    `margin=${s.margin}&lineHeight=${s.lineHeight}&fontSize=${s.fontSize}` +
    `&sectionSpacing=${s.sectionSpacing}&itemSpacing=${s.itemSpacing}`
  );
}

/** The margin, in inches, for a settings preset. */
function settingMarginIn(setting) {
  const s = SETTINGS[setting] ?? SETTINGS.standard;
  return MARGIN_IN[s.margin];
}

module.exports = {
  PAPER_WIDTH_IN,
  PAPER_HEIGHT_IN,
  MARGIN_IN,
  SETTINGS,
  contentWidthIn,
  contentWidthPx,
  usableHeightIn,
  waitForRootMargin,
  readRootMargin,
  openMeasurePage,
  printableHeightIn,
  countPages,
  resolvePlaywright,
  settingsQuery,
  settingMarginIn
};
