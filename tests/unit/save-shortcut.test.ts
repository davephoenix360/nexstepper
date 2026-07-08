import { describe, expect, it } from 'vitest';

import {
  getSaveShortcutLabel,
  isMacPlatform,
  isSaveShortcut
} from '@/components/editable/save-shortcut';

/**
 * Lock-down tests for the Ctrl/Cmd+S key-matching predicate. The
 * hook itself (`useSaveShortcut`) needs a DOM to exercise and lives
 * behind manual smoke-testing — but every interesting decision lives
 * in `isSaveShortcut`, so we get full coverage from this file.
 *
 * Helper that builds a fake KeyboardEvent with just the fields the
 * predicate reads. Keeps the test cases focused on the matching
 * logic, not the boilerplate.
 */
function keyEvent(over: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: 's',
    code: 'KeyS',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    keyCode: 0,
    ...over
  } as KeyboardEvent;
}

describe('isSaveShortcut — happy paths', () => {
  it('matches Ctrl+S', () => {
    expect(isSaveShortcut(keyEvent({ ctrlKey: true, key: 's' }))).toBe(true);
  });

  it('matches Cmd+S (macOS)', () => {
    expect(isSaveShortcut(keyEvent({ metaKey: true, key: 's' }))).toBe(true);
  });

  it('matches Ctrl+S even when `key` is reported as uppercase (some IMEs)', () => {
    // Belt-and-suspenders: shift isn't held but some platforms report
    // capital-S for Ctrl+S. Accept both 's' and 'S'.
    expect(isSaveShortcut(keyEvent({ ctrlKey: true, key: 'S' }))).toBe(true);
  });

  it('matches via physical-key code (KeyS) for non-QWERTY layouts', () => {
    // On AZERTY/Dvorak/Cyrillic keyboards, the physical S key is in
    // a different position. `event.key` will report whatever letter
    // is on that key, not 's'. The `code` field (KeyS) is layout-
    // independent and always fires for the S position.
    expect(
      isSaveShortcut(
        keyEvent({ ctrlKey: true, key: 'o', code: 'KeyS' })
      )
    ).toBe(true);
  });

  it('matches Ctrl+S when both Ctrl and Cmd are held (some KVM setups)', () => {
    // Sanity: a user with a KVM switch or weird peripheral might
    // fire both. The predicate still treats it as "save".
    expect(
      isSaveShortcut(
        keyEvent({ ctrlKey: true, metaKey: true })
      )
    ).toBe(true);
  });
});

describe('isSaveShortcut — rejections', () => {
  it('rejects plain S (no modifier)', () => {
    expect(isSaveShortcut(keyEvent({ ctrlKey: false, metaKey: false }))).toBe(
      false
    );
  });

  it('rejects Shift+Ctrl+S (browser "Save As")', () => {
    expect(
      isSaveShortcut(
        keyEvent({ ctrlKey: true, shiftKey: true, key: 'S' })
      )
    ).toBe(false);
  });

  it('rejects Alt+Ctrl+S (window-manager shortcut)', () => {
    expect(
      isSaveShortcut(
        keyEvent({ ctrlKey: true, altKey: true })
      )
    ).toBe(false);
  });

  it('rejects Cmd+Shift+S', () => {
    expect(
      isSaveShortcut(
        keyEvent({ metaKey: true, shiftKey: true, key: 'S' })
      )
    ).toBe(false);
  });

  it('rejects Ctrl+A (other Ctrl shortcuts)', () => {
    expect(
      isSaveShortcut(
        keyEvent({ ctrlKey: true, key: 'a', code: 'KeyA' })
      )
    ).toBe(false);
  });

  it('rejects Ctrl+Enter', () => {
    expect(
      isSaveShortcut(
        keyEvent({ ctrlKey: true, key: 'Enter', code: 'Enter' })
      )
    ).toBe(false);
  });

  it('rejects a keystroke during IME composition (Asian input methods)', () => {
    // The browser fires keydown with isComposing=true while the user
    // is choosing an IME candidate. The `s` keystroke there is not a
    // save gesture.
    expect(
      isSaveShortcut(
        keyEvent({ ctrlKey: true, isComposing: true })
      )
    ).toBe(false);
  });

  it('rejects a keystroke flagged with the legacy keyCode=229 composition signal', () => {
    // Older Safari / Firefox sometimes still surface the legacy 229
    // keyCode without setting isComposing. Defensive: reject either.
    expect(
      isSaveShortcut(
        keyEvent({ ctrlKey: true, keyCode: 229 })
      )
    ).toBe(false);
  });

  it('rejects F12 or other non-printable keys even with Ctrl', () => {
    expect(
      isSaveShortcut(
        keyEvent({ ctrlKey: true, key: 'F12', code: 'F12' })
      )
    ).toBe(false);
  });

  it('rejects the spacebar even with Ctrl', () => {
    expect(
      isSaveShortcut(
        keyEvent({ ctrlKey: true, key: ' ', code: 'Space' })
      )
    ).toBe(false);
  });
});

describe('isSaveShortcut — modifier combinations', () => {
  it('rejects when no modifier is held (the keystroke is just typing an s)', () => {
    expect(
      isSaveShortcut(keyEvent({ key: 's', code: 'KeyS' }))
    ).toBe(false);
  });

  it('rejects when only Shift is held', () => {
    // Shift+S is just an uppercase S — not a save gesture.
    expect(
      isSaveShortcut(
        keyEvent({ shiftKey: true, key: 'S' })
      )
    ).toBe(false);
  });

  it('rejects when only Alt is held', () => {
    expect(
      isSaveShortcut(
        keyEvent({ altKey: true })
      )
    ).toBe(false);
  });
});

/**
 * Platform detection drives the cosmetic label in the Save button's
 * tooltip — "⌘S" on Mac, "Ctrl + S" elsewhere. The actual key
 * matching in `isSaveShortcut` accepts either modifier, so the
 * worst-case bug here is "the label is slightly wrong" — never
 * "save is broken". Still: we want the right glyph per platform.
 */
describe('isMacPlatform', () => {
  it('detects macOS from a typical Chrome userAgent', () => {
    expect(
      isMacPlatform({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      })
    ).toBe(true);
  });

  it('detects macOS from a Safari userAgent on a Mac', () => {
    expect(
      isMacPlatform({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      })
    ).toBe(true);
  });

  it('detects iPhone / iPad (mobile Safari) as Mac-like', () => {
    // iPad/iPhone use Cmd+S on external keyboards, so we show the
    // same glyph as desktop macOS in the tooltip.
    expect(
      isMacPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })
    ).toBe(true);
    expect(
      isMacPlatform({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' })
    ).toBe(true);
  });

  it('treats Windows as not-Mac', () => {
    expect(
      isMacPlatform({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      })
    ).toBe(false);
  });

  it('treats Linux as not-Mac', () => {
    expect(
      isMacPlatform({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
      })
    ).toBe(false);
  });

  it('falls back to navigator.platform when userAgent is empty', () => {
    // The probe is matched against the *concatenation* of both
    // fields, so a Mac platform string alone is enough to flip the
    // result to true.
    expect(isMacPlatform({ userAgent: '', platform: 'MacIntel' })).toBe(true);
  });

  it('returns false when both fields are empty', () => {
    expect(isMacPlatform({ userAgent: '', platform: '' })).toBe(false);
  });
});

describe('getSaveShortcutLabel', () => {
  it('returns "⌘S" on macOS', () => {
    expect(
      getSaveShortcutLabel({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      })
    ).toBe('⌘S');
  });

  it('returns "Ctrl + S" on Windows', () => {
    expect(
      getSaveShortcutLabel({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      })
    ).toBe('Ctrl + S');
  });

  it('returns "Ctrl + S" on Linux', () => {
    expect(
      getSaveShortcutLabel({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)'
      })
    ).toBe('Ctrl + S');
  });

  it('returns "Ctrl + S" as a safe default for an empty probe', () => {
    // Server-rendered initial state on EditableResume uses this
    // default so the first client paint is identical to the SSR
    // output (no hydration mismatch). Mac users get the upgrade
    // to "⌘S" in a useEffect after mount.
    expect(getSaveShortcutLabel({ userAgent: '', platform: '' })).toBe(
      'Ctrl + S'
    );
  });
});