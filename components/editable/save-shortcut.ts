'use client';

/**
 * Ctrl/Cmd+S save shortcut for the editor.
 *
 * Wired up to a window-level keydown listener while the editor is
 * mounted. Suppresses the browser's default "Save Page As" via
 * `preventDefault()` and forwards the gesture to the editor's
 * existing save flow (RHF `handleSubmit` → onValid/onInvalid).
 *
 * Detection rules (locked down by tests/unit/save-shortcut.test.ts):
 *
 *  - Modifier is Ctrl OR Cmd (Mac). Both are required because we
 *    can't tell from JS which platform we're on, and users swap
 *    freely between Mac/Win.
 *  - Shift is rejected — Shift+Ctrl+S is "Save As" in Chrome/Firefox
 *    and we don't want to clobber that. Alt+Ctrl+S is a window-
 *    manager shortcut on many desktops, also rejected.
 *  - IME composition (Asian input methods, etc.) is skipped — the
 *    keydown event fires during composition with `isComposing=true`
 *    and the `s` key there is part of an IME candidate window, not
 *    a save gesture.
 *  - Matches `s` / `S` (the printable form) OR `code === 'KeyS'`
 *    (layout-independent — works on AZERTY, Dvorak, Cyrillic, etc.).
 *
 * The "edits only" concern from the user's best-practices list is
 * implicit here: this hook is mounted inside <EditableResume>, which
 * only renders when the user is editing a resume. There is no
 * read-only fallback surface inside the same component, so we don't
 * need to gate by `document.activeElement` being an input.
 */

import * as React from 'react';

/**
 * Pure key-event predicate. Testable without DOM.
 *
 * Returns true when the event should be treated as a "save" gesture
 * — i.e. we should `preventDefault()` and forward to the editor's
 * save handler.
 */
export function isSaveShortcut(event: KeyboardEvent): boolean {
  // Skip IME composition. `keyCode === 229` is the legacy signal for
  // "this key is part of composition"; modern browsers also set
  // `isComposing` on the KeyboardEvent.
  if (event.isComposing || event.keyCode === 229) return false;

  // Shift + Alt would change the meaning (Save As, window-manager
  // shortcut). Reject both.
  if (event.shiftKey || event.altKey) return false;

  // Ctrl on Windows/Linux, Cmd (metaKey) on macOS. We don't try to
  // distinguish platforms — both gestures should save.
  if (!event.ctrlKey && !event.metaKey) return false;

  // The key itself. `key` is the printable form ('s' or 'S' depending
  // on shift state, but we've already rejected shift). `code` is the
  // physical key — `KeyS` on standard QWERTY and most international
  // layouts. Accepting both makes the shortcut work on AZERTY,
  // Dvorak, Cyrillic, etc., where 's' on a QWERTY keyboard maps to
  // a different `key`.
  return (
    event.key === 's' ||
    event.key === 'S' ||
    event.code === 'KeyS'
  );
}

/**
 * Hook options.
 */
export interface UseSaveShortcutOptions {
  /**
   * Disable the listener. Used while a save is in flight so a
   * Ctrl+S mid-save doesn't kick off a second one.
   */
  disabled?: boolean;
}

/**
 * Listen for Ctrl/Cmd+S at the document level and forward to
 * `onSave`. Calls `preventDefault()` so the browser doesn't pop
 * the "Save Page As" dialog.
 *
 * The listener is attached to `document` (not `window`) because
 * some browsers don't fire keydown on window for keyboard input
 * focused inside shadow DOM or detached iframes. `document` is
 * the lowest common denominator.
 *
 * The cleanup function removes the listener on unmount or when
 * `onSave` / `disabled` changes.
 */
export function useSaveShortcut(
  onSave: (event: KeyboardEvent) => void,
  options: UseSaveShortcutOptions = {}
): void {
  const { disabled = false } = options;
  // Keep the latest callback in a ref so the listener we register
  // is stable across renders (avoids re-attaching every keystroke).
  const onSaveRef = React.useRef(onSave);
  React.useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  React.useEffect(() => {
    if (disabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!isSaveShortcut(event)) return;
      event.preventDefault();
      onSaveRef.current(event);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [disabled]);
}

/**
 * A signature the helper uses to decide Mac vs not-Mac. We accept
 * the full navigator.userAgent (and fall back to navigator.platform)
 * because `navigator.platform` is deprecated; some browsers don't
 * populate it. Tests can pass a fake string to cover both branches
 * without instantiating a real DOM.
 */
export interface PlatformProbe {
  userAgent?: string;
  platform?: string;
}

/**
 * Detects whether the user is on macOS (Mac, iPhone, iPad). Used by
 * the tooltip on the Save button to show "⌘S" vs "Ctrl + S". Not
 * perfect (UA sniffing never is) but good enough for a cosmetic
 * label; the actual key matching logic in `isSaveShortcut` accepts
 * both modifiers, so we don't gate behavior on this.
 */
export function isMacPlatform(probe: PlatformProbe = {}): boolean {
  if (typeof navigator !== 'undefined') {
    if (probe.userAgent === undefined && probe.platform === undefined) {
      const ua = navigator.userAgent ?? '';
      const pf = navigator.platform ?? '';
      return /Mac|iPhone|iPad|iPod/i.test(`${ua} ${pf}`);
    }
  }
  const haystack = `${probe.userAgent ?? ''} ${probe.platform ?? ''}`;
  return /Mac|iPhone|iPad|iPod/i.test(haystack);
}

/**
 * Returns a human-friendly label for the save shortcut, picked per
 * platform: "⌘S" on Mac, "Ctrl + S" everywhere else. Used in the
 * Save button's tooltip. Pure function so it's trivially testable.
 */
export function getSaveShortcutLabel(probe: PlatformProbe = {}): string {
  return isMacPlatform(probe) ? '⌘S' : 'Ctrl + S';
}