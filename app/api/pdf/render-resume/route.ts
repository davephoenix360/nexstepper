/**
 * PDF render route — high-level entry point.
 *
 * POST /api/pdf/render-resume
 *   Body: { resumeId: string, templateId?: string, options?: RenderOptions }
 *   Response: application/pdf binary, OR a JSON error envelope
 *
 * Higher-level than /api/pdf/render (which accepts raw HTML).
 * This one takes a resumeId, fetches the saved revision from the
 * DB, picks the template from the registry, renders to HTML,
 * sends to the provider. The single end-to-end pipeline for
 * "Download PDF" from the editor / preview route.
 *
 * ─── CURRENT STATUS: BLOCKED ─────────────────────────────────────────
 *
 * Next.js 16's App Router bundler blocks the `react-dom/server`
 * import in route handlers — it reserves that module for its own
 * RSC pipeline. We can't use `renderToStaticMarkup` (the natural
 * way to render a React tree to HTML) from inside an app route.
 *
 * The proper fix is a separate worker process that handles the
 * React rendering outside the Next.js bundle. The route becomes
 * a thin proxy. Tracked as a Phase 2.4+ item — see the commit
 * message on the route's first commit for the full writeup.
 *
 * In the meantime, the route returns 501 Not Implemented with a
 * clear message. The editor's "Download PDF" flow uses the
 * browser's print-to-PDF path (open the preview page, hit
 * Ctrl+P) which works today and produces the same Tailwind-styled
 * output via the browser's print engine.
 *
 * ────────────────────────────────────────────────────────────────────
 *
 * Auth: required (Better Auth session).
 *   Resumes are user-specific PII. Same auth contract as
 *   /api/pdf/render.
 *
 * Cache: same content-hash cache as /api/pdf/render. The cache
 * key is the rendered HTML, so the same resume + template
 * combination is a hit on subsequent calls — useful for the
 * "view → tweak → re-download" flow where the user renders
 * the same data twice in a row.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

// NOTE: The high-level entry point (`lib/pdf-render/render-resume.ts`)
// is intentionally NOT imported here. Next.js 16's App Router
// blocks the `react-dom/server` import in route handlers, and
// even a static import (without a runtime call) trips the
// bundler. Re-enable this import when the Phase 2.4 worker
// process is in place — the route becomes a thin proxy.
//
// The route validates auth + input + ownership below, then
// returns 501 with a clear message. The browser's print-to-PDF
// path on the preview page is the working download flow.

import { getUser } from '@/lib/db/queries';

// Node runtime — the renderer is a Node module (uses Buffer,
// fs/promises, etc.).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_HTML_BYTES = 5_000_000;

const requestSchema = z.object({
  resumeId: z.string().min(1).max(64),
  templateId: z.string().min(1).max(40).optional(),
  options: z
    .object({
      format: z.enum(['letter', 'a4']).optional(),
      landscape: z.boolean().optional(),
      printBackground: z.boolean().optional(),
      marginMm: z.number().int().min(0).max(50).optional()
    })
    .optional()
});

type ErrorEnvelope =
  | { ok: false; code: 'UNAUTHENTICATED'; message: string }
  | { ok: false; code: 'INVALID_INPUT'; message: string; fieldErrors?: Record<string, string[]> }
  | { ok: false; code: 'NOT_FOUND'; message: string }
  | { ok: false; code: 'RENDER_FAILED'; message: string; renderCode: string };

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ─────────────────────────────────────────────────────────────
  const user = await getUser();
  if (!user) {
    return NextResponse.json<ErrorEnvelope>(
      { ok: false, code: 'UNAUTHENTICATED', message: 'Sign in to render PDFs.' },
      { status: 401 }
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ErrorEnvelope>(
      { ok: false, code: 'INVALID_INPUT', message: 'Request body is not valid JSON.' },
      { status: 400 }
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ErrorEnvelope>(
      {
        ok: false,
        code: 'INVALID_INPUT',
        message: 'Request body failed validation.',
        fieldErrors: parsed.error.flatten().fieldErrors
      },
      { status: 400 }
    );
  }

  // ── BLOCKED: React server rendering not available in this route ───
  // Next.js 16's App Router blocks the `react-dom/server` import
  // (see file header). The proper Phase 2.4 fix is a separate
  // worker process; until then, the route is a documented stub
  // that returns 501 with a clear message. The editor's
  // "Download PDF" flow uses the browser's print-to-PDF path
  // on the preview page, which works today.
  return NextResponse.json<ErrorEnvelope>(
    {
      ok: false,
      code: 'RENDER_FAILED',
      message:
        'High-level render route is not yet wired. Use the browser print-to-PDF flow on the preview page, or the lower-level /api/pdf/render route with raw HTML. The full React-component-to-PDF path is blocked by Next.js 16 bundler restrictions on react-dom/server and is a Phase 2.4+ item.',
      renderCode: 'NOT_IMPLEMENTED'
    },
    { status: 501 }
  );
}
