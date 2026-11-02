'use client';

/**
 * The Turnstile widget.
 *
 * ## Explicit rendering, on purpose
 *
 * The implicit `<div class="cf-turnstile">` auto-render cannot be reset,
 * and a Turnstile token is SINGLE USE — it is redeemed exactly once
 * when the server verifies it. So after every submission attempt the
 * widget has to be reset and a fresh token obtained, or the retry
 * fails with a token the server has already spent.
 *
 * That needs the widget's id, so we render explicitly: the script is
 * loaded with `render=explicit` and we call `window.turnstile.render()`
 * ourselves, keeping the returned id.
 *
 * ## The token never leaves the browser except as a request header
 *
 * The widget hands the token to `onToken`, the parent puts it on the
 * `x-captcha-response` header of the auth request, and Better Auth's
 * captcha plugin exchanges it for a verdict at Cloudflare's siteverify
 * endpoint. The browser never calls siteverify, and the token is never
 * put in a form field, a URL, or a log.
 */
import { useEffect, useRef } from 'react';

const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** The global callback name the script calls when it is ready. */
const ONLOAD_CALLBACK = '__nexstepperTurnstileOnload';

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      'error-callback': () => void;
      'expired-callback': () => void;
      'timeout-callback': () => void;
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    [ONLOAD_CALLBACK]?: () => void;
  }
}

let scriptPromise: Promise<void> | null = null;

/**
 * Load the Turnstile script once per page.
 *
 * Module-level so that a page with more than one widget (there are not
 * any today, but the forgot-password flow and the auth form could
 * diverge) loads the script once, and so a re-mount does not append a
 * second copy.
 */
function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    window[ONLOAD_CALLBACK] = () => resolve();
    const script = document.createElement('script');
    script.src = `${SCRIPT_SRC}&onload=${ONLOAD_CALLBACK}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export interface TurnstileWidgetProps {
  /** The public site key. */
  siteKey: string;
  /**
   * The action this widget declares. The server requires the same value
   * back from siteverify, so a token minted on one surface cannot be
   * replayed on another.
   */
  action: string;
  /**
   * Called with the token when the user solves the challenge, and with
   * `null` when it expires, errors, or is reset.
   */
  onToken: (token: string | null) => void;
  /**
   * Bump this to reset the widget and clear the token. The token is
   * single-use, so this must happen after every submission attempt.
   */
  resetSignal?: number;
}

export function TurnstileWidget({
  siteKey,
  action,
  onToken,
  resetSignal = 0
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Keep the latest callback without re-rendering the widget when the
  // parent re-creates its handler.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          callback: (token: string) => onTokenRef.current(token),
          'error-callback': () => onTokenRef.current(null),
          'expired-callback': () => onTokenRef.current(null),
          'timeout-callback': () => onTokenRef.current(null)
        });
      })
      .catch(() => {
        // The widget could not load. The parent treats "no token" as
        // "the user has not verified", so the request is refused before
        // it reaches the server rather than being accepted unverified.
        onTokenRef.current(null);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, action]);

  // Reset after a submission attempt. A Turnstile token is redeemed
  // exactly once, so the retry needs a fresh one. Signal 0 is the
  // initial mount, not a reset.
  useEffect(() => {
    if (resetSignal === 0) return;
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
    onTokenRef.current(null);
  }, [resetSignal]);

  return (
    <div
      ref={containerRef}
      data-testid="turnstile-widget"
      data-action={action}
      className="min-h-[65px]"
    />
  );
}
