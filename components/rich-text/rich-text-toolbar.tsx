'use client';

/**
 * The formatting toolbar — B, I, U, floating above the selection.
 *
 * ## Why it floats rather than living in a toolbar bar
 *
 * The selection IS the context. A toolbar bar at the top of the editor
 * would ask the user to select text, then move somewhere else, then
 * come back — and the selection is usually gone by then. Floating
 * above the selection keeps the context and the action together.
 *
 * ## Why it does not promise the score will move
 *
 * Formatting is presentation. The ATS score is computed over the plain
 * text and is unaffected by it, by construction. The toolbar says so
 * plainly, because "bold this" reads like "make this score better" and
 * we should not let that impression stand.
 *
 * ## Why the buttons call preventDefault on mousedown
 *
 * Clicking a button would normally collapse the DOM selection, which
 * would destroy the very range the mark is about to be applied to. The
 * `onMouseDown` preventDefault keeps the selection alive, so the mark
 * lands on what the user actually highlighted.
 */
import { useCallback, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Bold, Italic, Underline, Eraser } from 'lucide-react';

import { useFormatting } from './use-formatting';
import { useRichSelection } from './use-rich-selection';
import { toggleMark } from '@/lib/rich-text/spans';
import type { RichMark, RichTextMap } from '@/lib/resume-schema/rich-text';

/** Toolbar height, used to place it above the selection. */
const TOOLBAR_HEIGHT_PX = 36;
/** Gap between the selection and the toolbar. */
const TOOLBAR_GAP_PX = 8;

const MARKS: { mark: RichMark; label: string; Icon: typeof Bold }[] = [
  { mark: 'bold', label: 'Bold', Icon: Bold },
  { mark: 'italic', label: 'Italic', Icon: Italic },
  { mark: 'underline', label: 'Underline', Icon: Underline }
];

export function RichTextToolbar() {
  const { selection, rect } = useRichSelection();
  const form = useFormContext();
  const { setSpans } = useFormatting();
  const [applied, setApplied] = useState(false);

  const applyMark = useCallback(
    (mark: RichMark) => {
      if (!selection) return;
      const value = String(form.getValues(selection.path) ?? '');
      const spans =
        (form.getValues('formatting') as RichTextMap | undefined)?.[
          selection.path
        ] ?? [];
      setSpans(
        selection.path,
        toggleMark(value, spans, selection.start, selection.end, mark)
      );
      setApplied(true);
    },
    [form, selection, setSpans]
  );

  const clearMarks = useCallback(() => {
    if (!selection) return;
    setSpans(selection.path, []);
    setApplied(true);
  }, [selection, setSpans]);

  if (!selection) return null;

  // Keep the toolbar on screen: above the selection, and clamped to the
  // viewport so it never renders off the edge of a laptop screen. With
  // no box (an environment that cannot measure the selection) it falls
  // back to the bottom-right, which is where the trigger lives anyway.
  const width = 168;
  const viewportWidth =
    typeof window !== 'undefined' ? window.innerWidth : 1024;
  const left = rect
    ? Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - width - 8))
    : Math.max(8, viewportWidth - width - 24);
  const top = rect ? Math.max(8, rect.top - TOOLBAR_HEIGHT_PX - TOOLBAR_GAP_PX) : 120;

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      data-testid="rich-text-toolbar"
      className="no-print fixed z-[60] flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
      style={{ left, top }}
      // Keep the DOM selection alive: without this, the click that
      // applies the mark would collapse the selection first.
      onMouseDown={(e) => e.preventDefault()}
    >
      {MARKS.map(({ mark, label, Icon }) => (
        <button
          key={mark}
          type="button"
          aria-label={label}
          title={label}
          data-testid={`rich-text-${mark}`}
          onClick={() => applyMark(mark)}
          className="inline-flex size-7 items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-300/60"
        >
          <Icon className="size-3.5" />
        </button>
      ))}

      <span className="mx-0.5 h-5 w-px bg-gray-200" aria-hidden="true" />

      <button
        type="button"
        aria-label="Clear formatting"
        title="Clear formatting"
        data-testid="rich-text-clear"
        onClick={clearMarks}
        className="inline-flex size-7 items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-300/60"
      >
        <Eraser className="size-3.5" />
      </button>

      <span
        className="ml-1.5 hidden pr-1 text-[10px] leading-tight text-gray-400 lg:inline"
        data-testid="rich-text-hint"
      >
        Formatting doesn&rsquo;t change your ATS score
      </span>

      {/* `applied` is referenced so the toolbar re-renders after a mark
          is applied, even though the visual state comes from the form. */}
      <span hidden data-applied={applied ? '1' : undefined} />
    </div>
  );
}
