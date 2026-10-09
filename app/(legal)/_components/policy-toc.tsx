/**
 * Table of contents for the long policy pages (rewritten 2026-10-08).
 *
 * Two presentations of the same data:
 *
 *  - `sidebar` — a sticky left rail on `lg+`. Section numbers in muted
 *    small caps, anchor links that underline on hover. Reads like the
 *    TOC on Stripe / Vercel / Linear rather than a boxed list.
 *  - `inline` — a compact card above the article on smaller screens,
 *    where a sticky rail would eat the whole viewport.
 *
 * The previous version rendered one boxed list with `lg:sticky` but no
 * sticky container around it, so on desktop it just sat in the flow —
 * the `variant` split fixes that by only asking for `sticky` in the
 * case where the parent provides a sticky rail.
 */
export function PolicyToc({
  items,
  variant = 'sidebar'
}: {
  items: { id: string; label: string }[];
  variant?: 'sidebar' | 'inline';
}) {
  // Split "3. Open-source + hosted" into number + title so the rail can
  // style the number differently from the label.
  const parsed = items.map((item) => {
    const match = item.label.match(/^(\d+)\.\s*(.*)$/);
    return match
      ? { id: item.id, number: match[1], label: match[2] }
      : { id: item.id, number: null, label: item.label };
  });

  if (variant === 'inline') {
    return (
      <nav
        aria-label="Table of contents"
        data-testid="policy-toc-inline"
        className="mb-8 rounded-xl border bg-muted/20 p-5"
      >
        <p className="mb-3 text-sm font-semibold">On this page</p>
        <ol className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {parsed.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.number && (
                  <span className="mr-2 tabular-nums text-muted-foreground/70">
                    {item.number}.
                  </span>
                )}
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    );
  }

  return (
    <nav aria-label="Table of contents" data-testid="policy-toc-sidebar">
      <p className="mb-4 text-sm font-semibold">On this page</p>
      <ul className="space-y-2.5 border-l text-sm">
        {parsed.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="-ml-px block border-l-2 border-transparent pl-4 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              {item.number && (
                <span className="mr-2 tabular-nums text-muted-foreground/60">
                  {item.number}.
                </span>
              )}
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}