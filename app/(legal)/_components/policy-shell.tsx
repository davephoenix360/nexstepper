import type { ReactNode } from 'react';

import { PolicyToc } from './policy-toc';

/**
 * Layout shell for the legal pages (added 2026-10-08).
 *
 * Replaces the old "one unbroken `prose` column" layout, which read as
 * an unstyled wall — the h1 sat below the notice and the TOC, the
 * measure ran the full container width, and nothing had visual
 * hierarchy.
 *
 * What this borrows from the layout good SaaS legal pages actually use:
 *
 *  - **A real sidebar.** The TOC is a sticky left rail on `lg+` and a
 *    summary card above the content on mobile. The old version
 *    declared `lg:sticky` but sat *inside* the prose column, so it
 *    never had room to stick and never did.
 *  - **A constrained measure.** Body copy is capped near `70ch`, the
 *    width at which prose stops being tiring to read. The old
 *    `max-w-none` let lines run the full container width.
 *  - **A real page header.** Title, one-line summary and a "last
 *    updated" pill, so the page announces itself before the wall.
 *
 * `intro` renders optional summary cards between the header and the
 * body — the "at a glance" block that lets a reader find their answer
 * without scrolling a full policy.
 */
export function PolicyShell({
  title,
  summary,
  lastUpdated,
  toc,
  intro,
  children
}: {
  title: string;
  /** One sentence under the title. */
  summary: string;
  lastUpdated: string;
  toc: { id: string; label: string }[];
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-14 lg:py-20">
      <header className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {title}
          </h1>
          <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            Updated {lastUpdated}
          </span>
        </div>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground text-pretty">
          {summary}
        </p>
      </header>

      {intro && <section className="mt-10">{intro}</section>}

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-16">
        {/* Sidebar rail — hidden on mobile, where the TOC renders inline
            above the article instead (see the block after `intro`). */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <PolicyToc items={toc} variant="sidebar" />
          </div>
        </aside>

        <div className="min-w-0">
          {/* Mobile / small-screen table of contents. */}
          <div className="lg:hidden">
            <PolicyToc items={toc} variant="inline" />
          </div>

          <article className="prose prose-neutral max-w-[70ch] dark:prose-invert">
            {children}
          </article>
        </div>
      </div>
    </div>
  );
}