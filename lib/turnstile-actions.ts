/**
 * The `data-action` values each Turnstile surface declares.
 *
 * Client-safe on purpose: the widget renders the action, and the
 * server's siteverify check requires the SAME value back. They have to
 * come from one place, or a token minted on one surface could be
 * replayed on another — which is exactly what the action check exists
 * to prevent.
 *
 * This module is imported by BOTH the client form and the server's
 * captcha plugin configuration, so it must stay free of server-only
 * imports.
 */
export const TURNSTILE_ACTIONS = {
  signup: 'signup',
  login: 'login',
  passwordReset: 'password-reset'
} as const;

export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS];
