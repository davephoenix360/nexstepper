import type { LucideIcon } from 'lucide-react';

/**
 * "At a glance" summary cards for the legal pages (added 2026-10-08).
 *
 * The single biggest thing that makes a policy page feel professional
 * instead of generated: a reader who wants to know "do you sell my
 * data?" should get the answer in three seconds, not by scrolling
 * eleven hundred words to section 6.
 *
 * Each card pairs a short question (the reader's actual question) with
 * a plain-language answer and a deep link to the section that has the
 * detail. Rendered as a grid above the article; stacks to one column
 * on mobile.
 */
export type PolicySummaryItem = {
  icon: LucideIcon;
  question: string;
  answer: string;
  /** Anchor id of the section with the full detail. */
  href: string;
};

export function PolicySummary({ items }: { items: PolicySummaryItem[] }) {
  return (
    <div data-testid="policy-summary">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        At a glance
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <a
              key={item.href}
              href={`#${item.href}`}
              className="group flex flex-col gap-2 rounded-xl border bg-card p-5 transition-colors hover:border-foreground/25 hover:bg-muted/30"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="font-medium">{item.question}</span>
              <span className="text-sm text-muted-foreground">
                {item.answer}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}