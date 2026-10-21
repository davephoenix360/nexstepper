/**
 * Page-break measurement harness (dev-only, not shipped).
 *
 * Answers the question `renderToStaticMarkup` cannot: WHERE do the
 * pages actually break when a real Chrome print renderer lays the
 * resume out? That needs a layout engine, so we drive headless
 * Chrome over the DevTools Protocol.
 *
 * No new dependencies: Node 24 ships a global `WebSocket`, which is
 * all CDP needs. (The repo has no `playwright` / `playwright-core`,
 * and adding one for a dev script isn't worth the dependency.)
 *
 * Method
 * ------
 * 1. Launch Chrome with --remote-debugging-port.
 * 2. Connect to the browser target's page via CDP.
 * 3. Navigate to /dev/design-lab, isolate `tpl-<id>`.
 * 4. emulateMedia('print') so the real @media print rules apply.
 * 5. For each entry-level block, compute its offset within the
 *    resume's paginated box and ask: does it straddle a page
 *    boundary? A block with `break-inside: avoid` must not, so the
 *    engine pushes it whole to the next page — and the space it
 *    vacated below the boundary is the "too much white space" the
 *    user reported.
 *
 * We simulate the engine's page-fill rather than trusting our own
 * arithmetic for the final number: walk entries in document order,
 * track the current page bottom, and accumulate dead space whenever
 * an entry that starts above a boundary gets pushed past it.
 *
 * Run: node scripts/measure-page-breaks.mjs
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME =
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000/dev/design-lab';
const OUT = join(process.cwd(), 'output', 'page-breaks');
const PORT = 9333;

const PAGE_H = 11 * 96; // US Letter, 96 CSS px per inch
const PAGE_W = Math.round(8.5 * 96);

/**
 * Re-adds the PRE-FIX layout on demand: `break-inside: avoid` on the
 * per-entry OUTER wrapper. Scoped to a root class so we can toggle
 * post-fix vs pre-fix on the same DOM without touching source.
 */
const LEGACY_CSS = `
.repro-legacy-break [data-testid^="work-entry-"],
.repro-legacy-break [data-testid^="edu-entry-"],
.repro-legacy-break [data-testid^="proj-entry-"] {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
`;

/**
 * Per-template entry-wrapper selectors.
 *
 * minimal / executive / creative emit data-testids on their per-entry
 * wrappers. Modern, Classic, and Jake don't — they use bare divs or a
 * `group/work-entry` class — so we select those structurally instead.
 * The goal is the *unit a page break is allowed to fall between*,
 * which after the fix is the individual bullet `<li>`, not the entry.
 */
const ENTRY_SELECTORS = {
  modern: 'li.print\\:break-inside-avoid',
  jake: 'li.print\\:break-inside-avoid',
  classic:
    '#tpl-classic article section#section-experience > div',
  minimal: '[data-testid^="work-entry-"]',
  executive: '[data-testid^="work-entry-"]',
  creative: '[data-testid^="work-entry-"]'
};

/** Selector that selects units regardless of which template. */
const ALL_SELECTOR = [
  'li.print\\:break-inside-avoid',
  '[data-testid^="work-entry-"]',
  '[data-testid^="edu-entry-"]',
  '[data-testid^="proj-entry-"]',
  '.group\\/work-entry',
  // classic-readonly's per-entry wrappers carry no distinguishing
  // class or testid beyond spacing utilities (`mb-4 last:mb-0`), so
  // we reach them structurally: direct children of the Experience
  // <section> that are divs containing a flex title row. The
  // section's first child is the <h2> heading, so `> div` skips it.
  '#tpl-classic article section#section-experience > div'
].join(', ');

const TEMPLATES = ['modern', 'classic', 'minimal', 'executive', 'creative', 'jake'];

// ── minimal CDP client ──────────────────────────────────────────────────────

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  static async attach(port) {
    // Chrome exposes a /json/list HTTP endpoint once it's listening.
    let targets;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        targets = await res.json();
        if (targets.length) break;
      } catch {
        /* not up yet */
      }
      await sleep(250);
    }
    const page = targets?.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target found');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new CDP(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 30000);
    });
  }

  async eval(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (exceptionDetails) {
      throw new Error(
        exceptionDetails.exception?.description ?? 'eval threw'
      );
    }
    return result.value;
  }
}

// ── measurement ─────────────────────────────────────────────────────────────

async function measure(cdp, template, legacy, reps) {
  return cdp.eval(`(async () => {
    const TEMPLATE = ${JSON.stringify(template)};
    const PAGE_H = ${PAGE_H};
    const SELECTOR = ${JSON.stringify(ALL_SELECTOR)};
    const LEGACY = ${JSON.stringify(legacy)};
    const REPS = ${reps};

    // Legacy-vs-post-fix toggle, injected once.
    if (!document.getElementById('repro-legacy-style')) {
      const s = document.createElement('style');
      s.id = 'repro-legacy-style';
      s.textContent = ${JSON.stringify(LEGACY_CSS)};
      document.head.appendChild(s);
    }
    document.documentElement.classList.toggle('repro-legacy-break', LEGACY);

    const root = document.getElementById('tpl-' + TEMPLATE);
    if (!root) return { error: 'section #tpl-' + TEMPLATE + ' not found' };

    const article = root.querySelector('article') ?? root;

    // Densify: the design-lab sample has ONE work entry, so a page
    // boundary almost never lands mid-entry and the measurement is
    // vacuous. Clone the entry list until the resume spans several
    // pages, which forces at least one boundary to fall inside an
    // entry — the exact condition the user's report describes.
    const first = article.querySelector(SELECTOR);
    const holder = first ? first.parentElement : null;
    if (holder && !holder.dataset.reproDensified) {
      holder.dataset.reproDensified = '1';
      const originals = [...holder.querySelectorAll(SELECTOR)];
      for (let i = 1; i < REPS; i++) {
        for (const o of originals) {
          const c = o.cloneNode(true);
          c.removeAttribute('data-testid');
          c.classList.add('repro-clone');
          holder.appendChild(c);
        }
      }
    }

    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const artRect = article.getBoundingClientRect();
    const top = artRect.top + window.scrollY;
    const totalHeight = Math.round(article.getBoundingClientRect().height);

    const entries = [...article.querySelectorAll(SELECTOR + ', .repro-clone')]
      .map(el => {
        const r = el.getBoundingClientRect();
        const absTop = r.top + window.scrollY - top;
        const absBottom = r.bottom + window.scrollY - top;
        return {
          absTop: Math.round(absTop),
          absBottom: Math.round(absBottom),
          height: Math.round(r.height)
        };
      })
      .sort((a, b) => a.absTop - b.absTop);

    /*
     * Simulate the print engine's page fill.
     *
     * The engine walks content top to bottom, placing as much as fits
     * in the current page, then starting a new page. A block marked
     * break-inside:avoid is atomic: if it does not fit in what's left
     * of the current page, it moves WHOLE to the next page and the
     * remaining slice of the current page is dead space. Blocks not
     * marked may split, so they fill the page completely and produce
     * no dead space.
     *
     * \`used\` = how far down the CURRENT page we've filled.
     */
    let used = 0;
    let dead = 0;
    let page = 0;
    for (const e of entries) {
      const h = e.height;
      if (h === 0) continue;
      if (used + h <= PAGE_H) {
        used += h;
        continue;
      }
      if (LEGACY) {
        // Atomic: skip the remainder of this page, start fresh.
        dead += PAGE_H - used;
        used = h;
      } else {
        // Splittable: fill the rest of this page, carry over.
        used = (used + h) % PAGE_H;
      }
      page++;
    }

    return {
      totalHeight,
      pageCount: Math.ceil(totalHeight / PAGE_H),
      deadSpacePx: dead,
      deadSpaceInches: Math.round((dead / 96) * 10) / 10,
      entryCount: entries.length
    };
  })()`);
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT, { recursive: true });

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + join(process.cwd(), 'output', '.chrome-pagebreaks'),
    `--window-size=${PAGE_W},${PAGE_H}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let cdp;
  try {
    cdp = await CDP.attach(PORT);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: PAGE_W,
      height: PAGE_H,
      deviceScaleFactor: 1,
      mobile: false
    });
    // The real @media print rules are what the user actually hits.
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });

    const results = [];
    for (const template of TEMPLATES) {
      await cdp.send('Page.navigate', { url: `${BASE}#tpl-${template}` });
      await sleep(2500);

      // Debug probe: what units does this template actually expose?
      const probe = await cdp.eval(`(() => {
        const root = document.getElementById('tpl-' + ${JSON.stringify(template)});
        if (!root) return { error: 'no root' };
        const article = root.querySelector('article') ?? root;
        const sec = article.querySelector('section#section-experience');
        return {
          selector: ${JSON.stringify(ENTRY_SELECTORS[template])},
          matched: article.querySelectorAll(${JSON.stringify(ENTRY_SELECTORS[template])}).length,
          allMatched: article.querySelectorAll(${JSON.stringify(ALL_SELECTOR)}).length,
          // Structure of the Experience section, so we can see exactly
          // which element is the per-entry wrapper when a selector
          // comes up empty.
          experienceTree: sec
            ? [...sec.children].map(function (c) {
                return {
                  tag: c.tagName.toLowerCase(),
                  cls: (c.className || '').slice(0, 60),
                  childCount: c.children.length,
                  firstChildTag: c.children[0] ? c.children[0].tagName.toLowerCase() : null,
                  firstChildCls: c.children[0] ? (c.children[0].className || '').slice(0, 60) : null
                };
              })
            : null
        };
      })()`);
      console.error(`  probe ${template}:`, JSON.stringify(probe));

      for (const legacy of [false, true]) {
        const m = await measure(cdp, template, legacy, 6);
        results.push({ template, layout: legacy ? 'pre-fix' : 'post-fix', ...m });
      }
      console.error(`  measured ${template}`);
    }

    const rows = results.filter((r) => !r.error);
    const lines = [
      'template   layout     units  pages  dead-space-px  dead-space-in',
      '---------  ---------  -----  -----  -------------  -------------'
    ];
    for (const r of rows) {
      lines.push(
        `${r.template.padEnd(10)}  ${r.layout.padEnd(10)}  ` +
          `${String(r.entryCount).padStart(5)}  ${String(r.pageCount).padStart(5)}  ` +
          `${String(r.deadSpacePx).padStart(13)}  ${String(r.deadSpaceInches).padStart(13)}`
      );
    }
    const errors = results.filter((r) => r.error);
    for (const r of errors) lines.push(`${r.template}: ERROR ${r.error}`);

    const summary = lines.join('\n');
    console.log(summary);
    writeFileSync(
      join(OUT, 'summary.txt'),
      summary + '\n\n' + JSON.stringify(results, null, 2)
    );
    console.log(`\nwrote ${join(OUT, 'summary.txt')}`);
  } finally {
    try { await cdp?.send('Browser.close'); } catch { /* already gone */ }
    chrome.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});