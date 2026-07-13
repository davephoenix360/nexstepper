/**
 * PDF render smoke test endpoint.
 *
 * POST /api/pdf/render
 *   Body: { html: string, options?: RenderOptions, resumeId?: string, templateId?: string }
 *   Response: application/pdf binary, OR a JSON error envelope
 *
 * Auth: required. The PDF render pipeline is expensive (managed-API bill)
 * and the HTML can encode user-specific resume data, so we don't expose
 * this to anonymous callers. Use the session cookie you get from the
 * dashboard login.
 *
 * Phase 2.3 will replace the `html`-in-body contract with a higher-level
 * `{ resumeId, templateId, data }` contract that walks through the
 * template registry to produce the HTML server-side. For the scaffold
 * we accept raw HTML so the provider/cache/telemetry pipeline can be
 * exercised end-to-end.
 *
 * Local dev curl:
 *   curl -X POST http://localhost:3000/api/pdf/render \
 *     -H "Cookie: nextep.session_token=<your-session-cookie>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"html":"<h1>Hello</h1>","options":{"format":"letter"}}' \
 *     --output out.pdf
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { renderPdf } from '@/lib/pdf-render';
import { getUser } from '@/lib/db/queries';
import { logPdfRender } from '@/lib/pdf-render/telemetry';

// Edge runtime can't run the Node Buffer-based cache + provider.
// Stay on the Node.js runtime explicitly.
export const runtime = 'nodejs';
// Force dynamic — no static caching, no prerender.
export const dynamic = 'force-dynamic';

const MAX_HTML_BYTES = 5_000_000; // mirrors the orchestrator's hard cap

const renderRequestSchema = z.object({
  html: z.string().min(1).max(MAX_HTML_BYTES),
  options: z
    .object({
      format: z.enum(['letter', 'a4']).optional(),
      landscape: z.boolean().optional(),
      printBackground: z.boolean().optional(),
      marginMm: z.number().int().min(0).max(50).optional()
    })
    .optional(),
  // Optional telemetry context. The render pipeline works without these,
  // but emitting a PostHog event without userId makes per-user analytics
  // impossible, so the route asks for them when present.
  resumeId: z.string().min(1).max(64).optional(),
  templateId: z.string().min(1).max(40).optional()
});

/** Discriminated JSON error envelope. Mirrors the renderer's failure shape
 *  so clients can switch on the same codes. */
type ErrorEnvelope =
  | { ok: false; code: 'UNAUTHENTICATED'; message: string }
  | { ok: false; code: 'INVALID_INPUT'; message: string; fieldErrors?: Record<string, string[]> }
  | { ok: false; code: 'RENDER_FAILED'; message: string; renderCode: string };

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  // ── Auth ─────────────────────────────────────────────────────────────
  const user = await getUser();
  if (!user) {
    return NextResponse.json<ErrorEnvelope>(
      { ok: false, code: 'UNAUTHENTICATED', message: 'Sign in to render PDFs.' },
      { status: 401 }
    );
  }

  // ── Validate body ───────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ErrorEnvelope>(
      { ok: false, code: 'INVALID_INPUT', message: 'Request body is not valid JSON.' },
      { status: 400 }
    );
  }

  const parsed = renderRequestSchema.safeParse(body);
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

  // ── Render ───────────────────────────────────────────────────────────
  const result = await renderPdf({
    html: parsed.data.html,
    options: parsed.data.options
  });

  // ── Telemetry (always — success or failure) ──────────────────────────
  // Fire-and-forget: the route must not block on PostHog. The
  // `logPdfRender` helper swallows its own errors, so the try/catch
  // here is just a guard for unexpected throws.
  try {
    logPdfRender({
      userId: user.id,
      resumeId: parsed.data.resumeId ?? 'smoke-test',
      templateId: parsed.data.templateId ?? 'unknown',
      resultStatus: result.ok ? 'success' : 'error',
      cacheHit: result.ok ? result.cacheHit : false,
      durationMs: Date.now() - startedAt,
      ...(result.ok ? { pdfBytes: result.bytes } : {}),
      ...(result.ok ? {} : { errorCode: result.code })
    });
  } catch (err) {
    console.warn('[api/pdf/render] telemetry failed:', err);
  }

  // ── Respond ──────────────────────────────────────────────────────────
  if (!result.ok) {
    return NextResponse.json<ErrorEnvelope>(
      {
        ok: false,
        code: 'RENDER_FAILED',
        message: result.message,
        renderCode: result.code
      },
      { status: result.code === 'TIMEOUT' ? 504 : 502 }
    );
  }

  return new NextResponse(new Uint8Array(result.pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(result.bytes),
      // Filename hint for the browser save dialog. Phase 2.3 will set this
      // from the resume name (e.g. `jane-doe-resume.pdf`).
      'Content-Disposition': 'inline; filename="render.pdf"',
      // Don't let any intermediary cache this — the response is per-user.
      'Cache-Control': 'private, no-store'
    }
  });
}
