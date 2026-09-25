/**
 * The "not lawyer-reviewed" notice displayed at the top of every legal
 * page. Honest disclosure: Nextep's policy text is generated from
 * open templates adapted to our actual data practices. Before relying
 * on these documents commercially — or before opening to EU/UK
 * traffic — the user must commission a one-time legal review
 * (~$300-500 from a tech-transactions attorney).
 */
export function PolicyNotice({ lastUpdated }: { lastUpdated: string }) {
  return (
    <aside className="mb-8 rounded-md border border-amber-500/40 bg-amber-50/50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200">
      <p className="font-semibold">Read this first</p>
      <p className="mt-1">
        This document was last updated <strong>{lastUpdated}</strong> and was
        generated from open legal templates (Termly CC0 base), adapted to
        Nextep&apos;s actual data practices. It has <strong>not</strong>{' '}
        been reviewed by a lawyer. Before relying on this document
        commercially — or before launching to EU/UK traffic — commission a
        one-time legal review. Expect $300–500 for a SaaS policy package
        from a tech-transactions attorney (e.g. Promise.Legal, Terms.Law,
        or a local firm). Until that review happens, treat the text below
        as a strong starting point, not legal advice.
      </p>
    </aside>
  );
}