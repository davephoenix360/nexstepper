/**
 * Shoot the AI agent brand lab.
 *
 * Captures each section of /dev/design-lab/agent-brand at desktop
 * width, plus a short sequence of frames of the animated mark so the
 * motion can be reviewed as stills (and so the previews committed to
 * the repo show the animation, not just a still of it).
 *
 * Needs the dev server running: `pnpm dev`.
 *
 * Usage: node scripts/shoot-agent-brand.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.resolve('output/agent-brand');
const BASE = process.env.AGENT_BRAND_URL ?? 'http://localhost:3000';

function resolvePlaywright() {
  try {
    return require('playwright');
  } catch {
    /* npx cache */
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
        const spec = JSON.parse(
          fs.readFileSync(path.join(core, 'browsers.json'), 'utf8')
        );
        revision =
          spec.browsers?.find((b) => b.name === 'chromium-headless-shell')
            ?.revision ??
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
  return require(pool[0].p);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = resolvePlaywright();

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2
  });

  await page.goto(`${BASE}/dev/design-lab/agent-brand`, {
    waitUntil: 'networkidle'
  });

  // The cookie banner sits over the bottom of the page.
  const essential = page.getByTestId('consent-essential-only');
  if (await essential.count()) {
    await essential.first().click();
    await page.waitForTimeout(300);
  }

  // Freeze the hero's auto-cycle on a state worth photographing.
  const pause = page.getByRole('button', { name: 'pause' }).first();
  if (await pause.count()) {
    await pause.click();
    await page.waitForTimeout(200);
  }

  const sections = page.locator('section');
  const count = await sections.count();
  const names = [
    '01-the-mark',
    '02-survival',
    '03-states',
    '04-placements',
    '05-in-motion',
    '06-filmstrip',
    '07-motion-spec'
  ];

  for (let i = 0; i < count; i++) {
    const name = names[i] ?? `section-${i}`;
    const file = path.join(OUT, `${name}.png`);
    await sections.nth(i).scrollIntoViewIfNeeded();
    await page.waitForTimeout(450);
    await sections.nth(i).screenshot({ path: file });
    console.log(`shot ${name} -> ${path.relative(process.cwd(), file)}`);
  }

  // The header, with the title and the first impression.
  const header = page.locator('header').first();
  if (await header.count()) {
    const file = path.join(OUT, '00-header.png');
    await header.screenshot({ path: file });
    console.log(`shot 00-header -> ${path.relative(process.cwd(), file)}`);
  }

  // A sequence of the animated mark, so the motion is reviewable as
  // stills. Click the "working" state in the gallery, then sample it.
  const working = page.getByRole('button', { name: /^Working/ }).first();
  if (await working.count()) {
    await working.click();
    const gallery = page.locator('section').nth(2);
    await gallery.scrollIntoViewIfNeeded();
    for (let f = 0; f < 4; f++) {
      const file = path.join(OUT, `anim-working-${f}.png`);
      await gallery.screenshot({ path: file });
      console.log(`shot anim-working-${f} -> ${path.relative(process.cwd(), file)}`);
      await page.waitForTimeout(430);
    }
  }

  await browser.close();
  console.log(`\nDone. ${OUT}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
