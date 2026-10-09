/**
 * The "not lawyer-reviewed" disclosure for the legal pages
 * (restyled 2026-10-08).
 *
 * The honest content is unchanged and deliberately kept — telling a
 * user "this wasn't reviewed by a lawyer" is the right thing to do,
 * and the $300–500 note is genuinely actionable for the site owner.
 *
 * What changed is presentation. It used to render as a six-line amber
 * alert *above* the document title, which made every legal page look
 * like a warning screen and read as generated boilerplate. It now sits
 * at the foot of the document as a quiet "About this document" card,
 * where the reader has already got what they came for.
 *
 * Pass `variant="alert"` for the old treatment if a page ever needs it.
 */
export function PolicyNotice({
  lastUpdated,
  variant = 'note'
}: {
  lastUpdated: string;
  variant?: 'note' | 'alert';
}) {
  if (variant === 'alert') {
    return (
      <aside className="mb-8 rounded-md border border-amber-500/40 bg-amber-50/50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200">
        <p className="font-semibold">Read this first</p>
        <p className="mt-1">
          This document was last updated <strong>{lastUpdated}</strong> and was
          generated from open legal templates (Termly CC0 base), adapted to
          Nexstepper&apos;s actual data practices. It has <strong>not</strong>{' '}
          been reviewed by a lawyer.
        </p>
      </aside>
    );
  }

  return (
    <aside
      data-testid="policy-notice"
      className="mt-16 rounded-xl border border-dashed bg-muted/20 p-5 text-sm not-prose"
    >
      <p className="font-semibold text-foreground">About this document</p>
      <p className="mt-1.5 text-muted-foreground">
        Last updated <strong className="text-foreground">{lastUpdated}</strong>.
        The text below was written from open legal templates (Termly CC0
        base) and adapted to Nexstepper&apos;s actual data practices — it has{' '}
        <strong className="text-foreground">not</strong> been reviewed by a
        lawyer, and is not legal advice. If you intend to rely on it
        commercially, a SaaS policy package from a tech-transactions
        attorney typically costs $300–500.
      </p>
    </aside>
  );
}