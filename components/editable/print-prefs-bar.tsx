"use client";

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useSectionPrint, type SectionPrintMode } from './use-section-print';

/**
 * Per-section print-hide toolbar — a tiny header fragment that
 * each section wrapper renders next to its title. Combines:
 *   - A visible "Hidden from print" badge when the section is
 *     hidden (always-on, so the user sees the state at a glance).
 *   - An "eye" toggle button (always on `.no-print` so the PDF
 *     omits the button itself).
 *
 * Renders the toggle UI only in editor mode (`mode.editable`).
 * In preview mode the slug is rendered without the toggle — the
 * user can only change `print.hiddenSections` from the editor.
 */
export interface PrintPrefsBarProps {
  sectionSlug: string;
  /** Where the bar is rendering — drives the hook's editor vs.
   *  preview-mode branch. The section wrapper forwards its
   *  `FieldMode` (which already encodes `editable` + `data`). */
  mode: SectionPrintMode;
  /** Optional className for the wrapper (template-specific positioning). */
  className?: string;
}

export function PrintPrefsBar({ sectionSlug, mode, className }: PrintPrefsBarProps) {
  const { hidden, toggle } = useSectionPrint(sectionSlug, mode);

  return (
    <div
      data-testid={`print-prefs-bar-${sectionSlug}`}
      data-hidden={hidden}
      className={cn(
        // Inline-flex by default — templates wrap us next to
        // the section title. `flex-wrap` so it wraps cleanly
        // on narrow screens.
        'inline-flex flex-wrap items-center gap-1',
        className
      )}
    >
      {hidden && (
        <span
          data-testid={`section-hidden-badge-${sectionSlug}`}
          className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200"
          aria-label={`${sectionSlug} hidden from print`}
          role="note"
        >
          <EyeOff className="h-3 w-3" aria-hidden />
          Hidden from print
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={!hidden}
        onClick={toggle}
        title={
          hidden
            ? `Include "${sectionSlug}" in the PDF`
            : `Hide "${sectionSlug}" from the PDF`
        }
        aria-label={
          hidden
            ? `Include ${sectionSlug} in PDF`
            : `Hide ${sectionSlug} from PDF`
        }
        data-testid={`section-print-toggle-${sectionSlug}`}
        data-slug={sectionSlug}
        // `.no-print` hides the button in the PDF + browser
        // print preview so the editor controls never leak
        // into the export. The button is **always visible** in
        // the editor — an earlier `opacity-0 group-hover` reveal
        // required the parent to carry a `group` class, which
        // none of the section wrappers have, so the toggle was
        // effectively invisible. Hover still deepens the
        // background for affordance.
        className={cn(
          'no-print inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors',
          hidden
            ? 'bg-amber-200 text-amber-900 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-100'
            : 'bg-muted text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
      >
        {hidden ? (
          <EyeOff className="h-3 w-3" aria-hidden />
        ) : (
          <Eye className="h-3 w-3" aria-hidden />
        )}
        <span className="sr-only">{hidden ? 'Hidden from print' : 'Visible in print'}</span>
      </button>
    </div>
  );
}