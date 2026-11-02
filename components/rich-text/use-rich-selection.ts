'use client';

/**
 * Turning a mouse selection into a character range in a resume field.
 *
 * ## How a selection maps to offsets
 *
 * Every text leaf in the rendered resume carries `data-rich-path` on its
 * element. The text inside that element is EXACTLY the field's value —
 * `RichText` adds no characters of its own, it only wraps runs of the
 * value in `<strong>` / `<em>` / `<u>`. So the offset of a selection
 * point inside the element is the number of characters in the element's
 * text nodes before it.
 *
 * That exactness is the reason `RichText` renders a fragment rather
 * than a wrapper element: a wrapper would not change the text, but it
 * would change the DOM of every unmarked field in every resume.
 *
 * ## Clearing rules
 *
 * - A selection that starts and ends in DIFFERENT fields is not
 *   supported in v1 — the toolbar hides.
 * - A collapsed selection (a plain click) hides the toolbar — that is
 *   the editor's click-to-edit gesture, not a selection.
 */
import { useCallback, useEffect, useState } from 'react';

export type RichSelection = {
  /** The dotted path of the field the selection is in. */
  path: string;
  /** Character offset of the selection start within the field value. */
  start: number;
  /** Character offset of the selection end within the field value. */
  end: number;
  /** The selected text. */
  text: string;
};

export type RichSelectionState = {
  selection: RichSelection | null;
  /** The selection's bounding box, for positioning the toolbar. */
  rect: DOMRect | null;
};

/** The nearest ancestor (or self) carrying `data-rich-path`. */
function findField(node: Node | null): HTMLElement | null {
  if (!node) return null;
  const element =
    node instanceof HTMLElement ? node : (node.parentElement ?? null);
  return element?.closest('[data-rich-path]') ?? null;
}

/**
 * The character offset of a point inside a container.
 *
 * Walks the container's text nodes in document order and sums their
 * lengths. The sum of every text node's length is the field's value
 * length, because the renderer never adds characters.
 */
function offsetWithin(container: Element, node: Node, offset: number): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (current === node) return total + offset;
    // The anchor was an element rather than a text node — the offset is
    // the start of the first text node inside it.
    if (node.contains(current)) return total;
    total += current.textContent?.length ?? 0;
  }
  return total;
}

export function useRichSelection(): RichSelectionState {
  const [selection, setSelection] = useState<RichSelection | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  /**
   * @param allowClear When false, a collapsed selection is ignored
   * rather than clearing the toolbar. That matters because applying a
   * mark re-renders the field, which collapses the DOM selection and
   * fires `selectionchange` — the toolbar must survive its own action.
   * A real dismissal is a mouseup elsewhere, which always allows
   * clearing.
   */
  const update = useCallback((allowClear: boolean) => {
    const dom = window.getSelection();
    const clear = () => {
      if (!allowClear) return;
      setSelection(null);
      setRect(null);
    };

    if (!dom || dom.rangeCount === 0 || dom.isCollapsed) {
      clear();
      return;
    }

    const range = dom.getRangeAt(0);
    const startField = findField(range.startContainer);
    const endField = findField(range.endContainer);

    // A selection that crosses fields is not supported in v1.
    if (!startField || startField !== endField) {
      clear();
      return;
    }

    const path = startField.getAttribute('data-rich-path');
    if (!path) {
      clear();
      return;
    }

    const start = offsetWithin(startField, range.startContainer, range.startOffset);
    const end = offsetWithin(startField, range.endContainer, range.endOffset);
    if (end <= start) {
      clear();
      return;
    }

    setSelection({
      path,
      start,
      end,
      text: startField.textContent?.slice(start, end) ?? ''
    });

    // The selection's box, for positioning the toolbar. Not every
    // environment implements `Range.getBoundingClientRect` (jsdom does
    // not), and a missing box must not take the toolbar down with it —
    // the selection itself is the thing that matters.
    let box: DOMRect | null = null;
    try {
      box = range.getBoundingClientRect?.() ?? null;
    } catch {
      box = null;
    }
    if (!box) {
      try {
        box = startField.getBoundingClientRect?.() ?? null;
      } catch {
        box = null;
      }
    }
    setRect(box);
  }, []);

  useEffect(() => {
    let frame = 0;
    const schedule = (allowClear: boolean) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => update(allowClear));
    };

    // A mouseup is always a user gesture: it can dismiss the toolbar.
    const onMouseUp = () => schedule(true);
    // A selectionchange can only ADD or refresh a selection — it must
    // not clear one, because our own re-render fires it.
    const onSelectionChange = () => schedule(false);

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [update]);

  return { selection, rect };
}
