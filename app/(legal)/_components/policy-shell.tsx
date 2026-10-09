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

      <div className="mt-12 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
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

          {/*
            Measure is set in rem, not `ch`.

            `70ch` was a mistake: Manrope's "0" glyph is narrow, so 70ch
            resolved to roughly 370px — a cramped ribbon with ~480px of
            dead space to its right. 46rem (~736px) is the measure you
            actually want at this type size, and it keeps the column
            from feeling like a line of text floating in a void.

            Heading styles come from the `prose` class, which requires
            @tailwindcss/typography to be installed and registered in
            globals.css — see the note there.
          */}
          <article className="prose prose-neutral max-w-[46rem]! dark:prose-invert">
            {children}
          </article>
        </div>
      </div>
    </div>
  );
}