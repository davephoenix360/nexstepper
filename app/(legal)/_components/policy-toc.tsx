/**
 * Sticky table of contents for the long policy pages. Renders as a
 * nav above the article on mobile; sticky on the right rail on
 * desktop. Each item is an anchor link to the matching `<h2 id="…">`
 * in the page body.
 *
 * Items are passed in as an ordered list — the page defines them, the
 * component renders them. Keeps the layout decision (sticky on lg+,
 * inline on smaller) here so the page bodies stay clean.
 */
export function PolicyToc({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav
      aria-label="Table of contents"
      className="mb-8 rounded-md border bg-muted/30 p-4 text-sm lg:sticky lg:top-4"
    >
      <p className="mb-2 font-semibold">On this page</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}