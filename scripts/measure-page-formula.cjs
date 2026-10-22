/**
 * Derive the assistant's page-fit formula from MEASURED heights, and
 * validate it against REAL page counts.
 *
 * ## The formula
 *
 *     height ≈ fixed + roles × (perRole + bullets × perBullet)
 *     pages  ≈ ceil(height / usable)
 *
 * ## Two things this script gets right that the first version did not
 *
 * 1. **It measures at the PAPER CONTENT WIDTH.** The printed page lays
 *    out at `paper width - 2 x margin` (7.0in for standard, 7.5in for
 *    compact). Measuring the DOM at the 8.5in screen width wraps less
 *    text and reports a shorter resume than the one that prints.
 *
 * 2. **It waits for the root margin mirror.** `@page { margin:
 *    var(--resume-margin) }` only sees the per-resume value once
 *    `PrintSettingsVars` has written it onto `document.documentElement`.
 *    Until then the page box silently uses the 0.4in fallback.
 *
 * Both are handled by `openMeasurePage()` in scripts/lib/print-harness.cjs.
 *
 * ## Two models, because blocks do not split across pages
 *
 * The templates put `print:break-inside-avoid` on every work entry and
 * every bullet, so a work entry that does not fit in the remaining space
 * moves WHOLE to the next page. A pure height model therefore
 * under-predicts the page count near a boundary.
 *
 *   - "height" model: pages = ceil(height / usable)
 *   - "block" model:  greedy fill — each work entry is an unbreakable
 *                     block; if it does not fit, the page turns over
 *
 * Both are fitted and validated against the real PDF page counts, and the
 * script prints which one is actually right. It does not pick one and
 * hope.
 *
 * Usage:
 *   node scripts/measure-page-formula.cjs
 *   node scripts/measure-page-formula.cjs --templates=modern,jake
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
const TEMPLATES = (
  args.templates ?? 'classic,minimal,modern,executive,creative,jake'
).split(',');
const OUT_DIR = path.resolve(args.out ?? 'output/pagecounts');
const SWEEP = path.resolve(args.sweep ?? 'output/pc-minimal/results.json');
const MAX_ROLES = Number.parseInt(args.maxroles ?? '8', 10);
const BULLET_SETS = (args.bullets ?? '2,3,4')
  .split(',')
  .map((n) => Number.parseInt(n, 10));

/**
 * Least squares for  height = a + b·x + c·y  via normal equations.
 * Tiny hand-rolled 3×3 solve — no dependency, and the matrix is 3×3.
 */
function leastSquares(rows, xs, ys) {
  const n = 3;
  const A = Array.from({ length: n }, () => Array(n).fill(0));
  const b = Array(n).fill(0);
  for (let i = 0; i < rows.length; i++) {
    const r = [1, xs[i], ys[i]];
    for (let p = 0; p < n; p++) {
      b[p] += r[p] * rows[i];
      for (let q = 0; q < n; q++) A[p][q] += r[p] * r[q];
    }
  }
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++)
      if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

/**
 * Greedy pagination with unbreakable work entries.
 *
 * `fixed` is the non-experience content (header, skills, education) and
 * each work entry is a block of `perRole + bullets * perBullet` inches.
 * A block that does not fit in what is left of the page turns the page.
 */
function blockPages(fixed, perRole, perBullet, roles, bullets, usable) {
  let pages = 1;
  let used = fixed;
  for (let i = 0; i < roles; i++) {
    const h = perRole + bullets * perBullet;
    if (used + h <= usable) {
      used += h;
    } else {
      pages += 1;
      used = h;
    }
  }
  return pages;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = resolvePlaywright();

  // Real page counts from the sweep of actual PDFs.
  const sweep = fs.existsSync(SWEEP)
    ? JSON.parse(fs.readFileSync(SWEEP, 'utf8'))
    : { results: [] };
  const pageCountByKey = new Map(
    sweep.results.map((r) => [
      `${r.template}|${r.setting}|${r.roles}|${r.bullets}`,
      r.pages
    ])
  );

  const out = [];

  for (const template of TEMPLATES) {
    // A fresh browser per template — one long-lived browser leaked to 69
    // Chrome processes and OOM'd the dev server.
    const browser = await chromium.launch();

    for (const setting of Object.keys(SETTINGS)) {
      const usable = usableHeightIn(settingMarginIn(setting));
      const vw = contentWidthPx(settingMarginIn(setting));
      const page = await browser.newPage({ viewport: { width: vw, height: 1056 } });

      const pts = [];
      for (let roles = 0; roles <= MAX_ROLES; roles++) {
        for (const bullets of BULLET_SETS) {
          const url =
            `${BASE}/dev/design-lab/measure?template=${template}` +
            `&roles=${roles}&bullets=${bullets}&base=minimal` +
            `&${settingsQuery(setting)}`;

          await openMeasurePage(page, url);
          const height = await printableHeightIn(page);

          const key = `${template}|${setting}|${roles}|${bullets}`;
          const realPages = pageCountByKey.get(key);
          pts.push({ roles, bullets, height, pages: realPages ?? null });
        }
      }
      await page.close();

      const withPages = pts.filter((p) => typeof p.pages === 'number');
      const fit = leastSquares(
        withPages.map((p) => p.height),
        withPages.map((p) => p.roles),
        withPages.map((p) => p.roles * p.bullets)
      );
      if (!fit) {
        console.error(`could not fit ${template}/${setting}`);
        continue;
      }
      const fixed = Math.round(fit[0] * 100) / 100;
      const perRole = Math.round(fit[1] * 100) / 100;
      const perBullet = Math.round(fit[2] * 100) / 100;

      const misses = { height: [], block: [] };
      let heightCorrect = 0;
      let blockCorrect = 0;

      for (const p of withPages) {
        const h = fixed + p.roles * perRole + p.roles * p.bullets * perBullet;
        const heightPred = Math.ceil(h / usable);
        if (heightPred === p.pages) heightCorrect++;
        else
          misses.height.push({
            roles: p.roles,
            bullets: p.bullets,
            real: p.pages,
            predicted: heightPred,
            measured: p.height
          });

        const blockPred = blockPages(
          fixed,
          perRole,
          perBullet,
          p.roles,
          p.bullets,
          usable
        );
        if (blockPred === p.pages) blockCorrect++;
        else
          misses.block.push({
            roles: p.roles,
            bullets: p.bullets,
            real: p.pages,
            predicted: blockPred,
            measured: p.height
          });
      }

      out.push({
        template,
        setting,
        fixed,
        perRole,
        perBullet,
        usable,
        contentWidthIn: Math.round((vw / 96) * 100) / 100,
        accuracy: {
          height: `${heightCorrect}/${withPages.length}`,
          block: `${blockCorrect}/${withPages.length}`
        },
        misses,
        points: pts
      });

      console.log(
        `${template.padEnd(10)} ${setting.padEnd(9)} fixed=${fixed}in ` +
          `perRole=${perRole}in perBullet=${perBullet}in usable=${usable}in ` +
          `→ height ${heightCorrect}/${withPages.length}  ` +
          `block ${blockCorrect}/${withPages.length}`
      );
      if (misses.height.length) {
        console.log(
          `    height misses: ${JSON.stringify(misses.height.slice(0, 5))}`
        );
      }
      if (misses.block.length) {
        console.log(
          `    block  misses: ${JSON.stringify(misses.block.slice(0, 5))}`
        );
      }

      // Write incrementally — a stall must not cost the whole run.
      fs.writeFileSync(
        path.join(OUT_DIR, 'formulas.json'),
        JSON.stringify(out, null, 2)
      );
    }

    await browser.close();
  }

  const sum = (model) =>
    out.reduce(
      (a, o) => a + Number(o.accuracy[model].split('/')[0]),
      0
    );
  const total = out.reduce((a, o) => a + Number(o.accuracy.height.split('/')[1]), 0);
  console.log(`\nOVERALL height model: ${sum('height')}/${total}`);
  console.log(`OVERALL block  model: ${sum('block')}/${total}`);
  console.log('wrote output/pagecounts/formulas.json');
})().catch((e) => {
  console.error(String(e).slice(0, 800));
  process.exitCode = 1;
});
