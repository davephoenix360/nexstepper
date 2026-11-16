#!/usr/bin/env node
/**
 * Build-time guard: the routes that need the ONNX runtime must ACTUALLY
 * have it in their traced output.
 *
 * ## Why this exists
 *
 * The ONNX embedding model broke production three times in a row, and
 * every failure was silent until it was too late:
 *
 *   1. `sharp` could not load its libvips library → the whole
 *      `@huggingface/transformers` module failed to load.
 *   2. `onnxruntime-node` was missing from the function entirely —
 *      the module could not be resolved.
 *   3. `libonnxruntime.so.1` was missing — the binding was there, the
 *      library it dlopens was not.
 *
 * In every case the BUILD was green and every unit test passed. The
 * failure was at `dlopen`, in production, on the user's screen.
 *
 * The upstream issue is real and open: `@vercel/nft` follows
 * `require`/`import` but not `dlopen`
 * (vercel/next.js#97973). So until it is fixed, the only defence is
 * to CHECK the trace instead of trusting the build.
 *
 * ## What it checks
 *
 * For each route in `ROUTES`, that route's `.nft.json` must list:
 *
 *   - the ONNX addon (`onnxruntime_binding.node`)
 *   - the library it dlopens (`libonnxruntime.so.1`)
 *
 * And then it goes one step further and **actually loads the addon**
 * from the traced path — because "the file is listed" and "the file
 * loads" are different claims, and the second one is the one that
 * matters. A binding whose `.so` is one directory away from where the
 * loader looks fails exactly like a missing file.
 *
 * ## Usage
 *
 *   pnpm build && node scripts/check-native-tracing.mjs
 *
 * Wired into CI after the build step.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

const require = createRequire(import.meta.url);

const ROOT = resolve(process.cwd());

/**
 * The routes that run the hybrid scorer, and therefore need the ONNX
 * runtime in their function bundle. Keep in step with
 * `next.config.ts`'s `outputFileTracingIncludes`.
 */
const ROUTES = [
  { pattern: '/api/chat', trace: 'server/app/api/chat/route.js.nft.json' },
  {
    pattern: '/dashboard/resumes/[id]',
    trace: 'server/app/(dashboard)/dashboard/resumes/[id]/page.js.nft.json'
  }
];

/** The files that must be in each route's trace. */
const REQUIRED = [
  'onnxruntime_binding.node',
  'libonnxruntime.so.1'
];

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function findTraceFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findTraceFiles(full, out);
    else if (entry.endsWith('.nft.json')) out.push(full);
  }
  return out;
}

const nextDir = join(ROOT, '.next');
if (!existsSync(nextDir)) {
  fail('No .next directory — run `pnpm build` first.');
}

console.log('');
console.log('Native tracing check');
console.log('─'.repeat(60));

let problems = 0;

for (const route of ROUTES) {
  const tracePath = join(nextDir, route.trace);
  if (!existsSync(tracePath)) {
    // The trace filename embeds the route group, which is easy to get
    // wrong by hand — fall back to a search so a rename does not turn
    // into a false alarm.
    const candidates = findTraceFiles(join(nextDir, 'server', 'app')).filter((f) =>
      f.replace(/\\/g, '/').endsWith(route.trace.split('/').slice(-3).join('/'))
    );
    if (candidates.length === 0) {
      fail(`No trace file found for ${route.pattern} (looked for ${route.trace}).`);
    }
    console.log(`  ${route.pattern}\n    trace: ${relative(ROOT, candidates[0])}`);
    problems += checkTrace(candidates[0], route);
    continue;
  }

  console.log(`  ${route.pattern}\n    trace: ${route.trace}`);
  problems += checkTrace(tracePath, route);
}

if (problems > 0) {
  fail(
    `${problems} route(s) would deploy WITHOUT the ONNX runtime. ` +
      'The build is green but the function would crash at dlopen.'
  );
}

console.log('');
console.log('  ✓ every route that runs the scorer carries the ONNX runtime');
console.log('');

/**
 * Verify one trace lists the required files, and that the addon
 * actually loads from the traced path.
 */
function checkTrace(tracePath, route) {
  const trace = JSON.parse(readFileSync(tracePath, 'utf-8'));
  const files = trace.files ?? [];

  let problems = 0;

  for (const required of REQUIRED) {
    const hit = files.find((f) => f.endsWith(required));
    if (!hit) {
      console.error(`    ✗ missing from the trace: ${required}`);
      problems += 1;
      continue;
    }
    console.log(`    ✓ ${required}`);
  }

  // The real test: can the addon actually be loaded from where the
  // trace says it is? This is the step that would have caught all three
  // production failures.
  //
  // Only on Linux: the trace names the LINUX binding (that is what
  // Vercel runs), and a Linux ELF addon cannot be `require`d on
  // Windows. CI runs on ubuntu, so the gate fires where it matters.
  const binding = files.find((f) => f.endsWith('onnxruntime_binding.node'));
  if (binding) {
    // Trace paths are relative to the TRACE FILE's own directory.
    const absolute = resolve(dirname(tracePath), binding);
    if (!existsSync(absolute)) {
      console.error(`    ✗ the traced binding is not on disk: ${binding}`);
      problems += 1;
    } else if (process.platform !== 'linux') {
      console.log(
        `    · the addon load test is Linux-only (this is ${process.platform}) — CI runs it`
      );
    } else {
      try {
        require(absolute);
        console.log('    ✓ the addon loads (dlopen resolved its library)');
      } catch (err) {
        console.error(
          `    ✗ the addon does not load: ${err instanceof Error ? err.message : String(err)}`
        );
        problems += 1;
      }
    }
  }

  return problems;
}
