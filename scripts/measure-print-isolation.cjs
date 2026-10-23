/**
 * TEMPORARY — verify the `.printable-root` print-isolation mechanism:
 *
 *   1. does it remove the surrounding layout's inset (the @page margin
 *      becomes the only margin)?
 *   2. does an absolutely-positioned `.printable` still PAGINATE across
 *      pages, or does it collapse to one page?
 *
 * This is the risk in applying `.printable-root` to the editor: the
 * mechanism positions `.printable` absolutely, and an absolutely
 * positioned box that overflows the page must still fragment.
 *
 * It reproduces the editor's real chain (a padded wrapper with vertical
 * rhythm around the printable) using the REAL rules from globals.css.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const OUT = path.resolve('output/print-inset');
fs.mkdirSync(OUT, { recursive: true });

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

/** The rules copied verbatim from app/globals.css @media print. */
const ISOLATION_CSS = `
  @page { size: letter; margin: 0.75in; }
  @media print {
    .printable-root * { visibility: hidden; }
    .printable-root .printable,
    .printable-root .printable * { visibility: visible; }
    .printable-root .printable {
      position: absolute; left: 0; top: 0; width: 100%;
    }
  }
`;

const CONTENT_HEIGHT_IN = 19; // ~2 pages of Letter

function pageHtml({ isolated }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; font-family: sans-serif; }
  ${ISOLATION_CSS}
  /* The editor's chain: <main class="p-4"> > <section class="p-8 space-y-6"> */
  .main { padding: 16px; }
  .section { padding: 32px; }
  .rhythm > * + * { margin-top: 24px; }
  .tall { height: ${CONTENT_HEIGHT_IN}in; background: #f4f4f5; }
  .marker { font-size: 9pt; color: #111; }
</style></head>
<body>
  <div class="main${isolated ? ' printable-root' : ''}">
    <div class="section${isolated ? ' printable-root' : ''} rhythm">
      <header class="marker">CHROME HEADER</header>
      <div class="printable${isolated ? '' : ' rhythm-child'}">
        <div class="tall">
          <p class="marker">RESUME CONTENT</p>
        </div>
      </div>
    </div>
  </div>
</body></html>`;
}

function inspectPdf(file) {
  const script = `
import sys, json
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
out = {"pages": len(r.pages), "geo": []}
for page in r.pages:
    pts = []
    def v(text, cm, tm, fd, fs):
        if not text or not text.strip(): return
        x = tm[4]*cm[0] + tm[5]*cm[2] + cm[4]
        y = tm[4]*cm[1] + tm[5]*cm[3] + cm[5]
        pts.append((x/72.0, y/72.0))
    page.extract_text(visitor_text=v)
    if not pts:
        out["geo"].append(None); continue
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    out["geo"].append({"left": round(min(xs),3), "right": round(max(xs),3),
                        "top": round(11 - max(ys),3)})
print(json.dumps(out))
`;
  return JSON.parse(
    execFileSync('python', ['-c', script, file], { encoding: 'utf8' }).trim()
  );
}

(async () => {
  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 816, height: 1056 }
  });

  for (const isolated of [false, true]) {
    const file = path.join(OUT, isolated ? 'mechanism-isolated.pdf' : 'mechanism-plain.pdf');
    const page = await context.newPage();
    await page.setContent(pageHtml({ isolated }), { waitUntil: 'load' });
    await page.pdf({
      path: file,
      preferCSSPageSize: true,
      printBackground: true,
      timeout: 60_000
    });
    await page.close();

    const out = inspectPdf(file);
    const first = out.geo.find(Boolean);
    console.log(
      `${isolated ? 'ISOLATED ' : 'PLAIN    '} pages=${out.pages}  ` +
        (first
          ? `text left=${first.left}in top=${first.top}in`
          : 'no text')
    );
    console.log(`           geometry: ${JSON.stringify(out.geo)}`);
  }

  await browser.close();
})().catch((e) => {
  console.error(String(e).slice(0, 800));
  process.exitCode = 1;
});
