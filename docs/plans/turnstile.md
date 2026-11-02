# Cloudflare Turnstile on the auth surfaces — Plan

> Plan template: [`AGENTS.md` § Planning discipline](../../AGENTS.md#planning-discipline).
> Branch: `feat/turnstile-bot-check`. Commit footer: `Plan: docs/plans/turnstile.md`.
> Site key: `0x4AAAAAAFw4ohsxlVQ359Nc` (widget already created).

## Objective

Stop bots creating accounts, without adding a step that gets in a real
user's way.

## Why the auth form is the surface

Every account is a wallet. A bot that signs up can then make the calls
this product charges for — the JD parser, the resume parser, the Jev
requirement evaluation, and the chat on Pro. The free tier's chat chain
is $0 (see `lib/ai/providers.ts`), but the parse and analysis calls are
not, and an unbounded number of accounts is an unbounded bill.

Sign-in is protected for the same reason a login form usually is:
credential stuffing. Password reset is protected because it is an email
cannon — a bot can post any address and make the app send a reset mail,
which burns Resend quota and damages the sending reputation of the
domain that every OTHER transactional email depends on.

## Scope (in)

- Turnstile on **sign-up**, **sign-in** and **forgot password**.
- The widget rendered explicitly, so it can be **reset** — a Turnstile
  token is redeemed exactly once, so a retry needs a fresh one.
- Server-side siteverify with `success === true`, the expected
  `action`, and an approved hostname.
- Env-var driven, and **off** when not configured.

## Non-goals

- **Protecting the AI surfaces** (resume import, JD parse, chat). They
  are behind auth and cost a fraction of a cent per call; the auth form
  is where the multiplication happens. They are a reasonable follow-up
  if abuse shows up.
- **Server-generated PDFs, Workers, custom WAF rules.** Out of scope.
- **reCAPTCHA score thresholds.** Turnstile returns `success: true/false`;
  there is no score.

## Architecture

### Better Auth already knows how to do this

Better Auth 1.6.23 ships a captcha plugin with a **native
Cloudflare Turnstile provider** (`provider: 'cloudflare-turnstile'`),
including the siteverify call, the timeout, and the failure handling.
So there is no siteverify code to write and no `fetch` to get wrong.

The plugin reads the token from the **`x-captcha-response` request
header** and protects `/sign-up/email`, `/sign-in/email` and
`/request-password-reset` by default.

### One plugin instance per surface, so each can have its OWN action

The plugin's `expectedAction` is plugin-wide, but Better Auth runs
**every** plugin's `onRequest` hook in order, and each hook decides for
itself whether it applies by matching the request path against its own
`endpoints`. So three instances with disjoint endpoint lists means
exactly one check per request — and each one carries its own action:

| surface | endpoint | `data-action` |
|---|---|---|
| Sign up | `/sign-up/email` | `signup` |
| Sign in | `/sign-in/email` | `login` |
| Forgot password | `/request-password-reset` | `password-reset` |

A token minted on the sign-up widget therefore cannot be replayed at
the sign-in endpoint: the siteverify response carries the action the
widget declared, and the plugin rejects a mismatch.

### Why the site key is a SERVER env var, not `NEXT_PUBLIC_`

`NEXT_PUBLIC_*` values are **baked into the client bundle at build
time**. On Vercel a preview deployment is built with the Preview env
scope, so a `NEXT_PUBLIC_` site key set only in Production is absent
from a preview build — while the preview's runtime could still have the
secret. That combination is the dangerous one: the server demands a
token the client cannot produce, and **nobody can sign up on the
preview**.

So the site key is read from the server at **request time** and passed
down as a prop. The widget and the gate are then decided by the SAME
read, in the SAME request, on the SAME environment. The site key is a
public value, so nothing is lost by holding it server-side — only the
convenience of `NEXT_PUBLIC_`.

### Failing OPEN, loudly

The check is enabled only when **both** the site key and the secret are
present. A half-configured deployment therefore has NO bot check rather
than a bot check that rejects everyone. That is the right direction for
a missing env var, but it is a silent hole, so the misconfiguration is
logged loudly on boot.

### The token never reaches siteverify from the browser

The browser's job is to hand the token to the app. The app's job is to
put it on the `x-captcha-response` header. The server's job is to
exchange it for a verdict at Cloudflare. The browser never calls
siteverify; the token is never in a form field on the auth forms, never
in a URL, never in a log.

(The forgot-password form is the exception, and for a structural
reason: it submits through a Server Action as a normal browser form
post, which cannot carry custom headers. So the token rides in a hidden
field and the action forwards it as the header.)

## Files

### New

- `lib/turnstile.ts` — the config (server-only) and the plugin factory.
- `lib/turnstile-actions.ts` — the action constants, client-safe, so
  the widget and the server config read the same values.
- `components/auth/turnstile-widget.tsx` — the widget.
- `tests/unit/turnstile.test.ts` — config + plugin wiring.
- `tests/interaction/turnstile-widget.test.tsx` — token capture, reset,
  expiry.

### Changed

- `lib/auth.ts` — register the plugins.
- `app/(auth)/login.tsx` — render the widget, send the header, reset
  after each attempt, refuse to submit unverified.
- `app/(auth)/sign-in/page.tsx`, `sign-up/page.tsx` — pass the site key.
- `app/(auth)/forgot-password/page.tsx` — split into a server page and
  a client form; the form renders the widget.
- `app/(auth)/forgot-password/forgot-password-form.tsx` — new client form.
- `app/(auth)/forgot-password/actions.ts` — forward the token header.
- `.env.example`, `docs/setup/production.md` — the env vars.

## Risks

**1. A preview deployment cannot sign up.** The widget only renders on
registered domains, and `nexstepper-*.vercel.app` is not one.
*Mitigation:* the env vars go in **Production only**; a preview with no
secret has no gate and no widget.

**2. Half-configured → no protection, silently.** *Mitigation:* a
loud warning on boot, and the check is enabled only when both vars are
present.

**3. The hostname allowlist is empty.** An empty list turns the
hostname check off — which is the check that stops a token minted on
one of our own deployments being replayed on another.
*Mitigation:* the allowlist is never empty; it falls back to the
environment's defaults.

**4. The token is single-use and a retry reuses it.** The second attempt
would fail with a token the server already spent.
*Mitigation:* the widget is rendered explicitly so its id is known, and
it is reset after every attempt.

## Acceptance criteria

1. With no env vars set, sign-up, sign-in and password reset behave
   exactly as they do today, and the boot log says nothing.
2. With only one var set, the boot log warns that protection is off.
3. With both set, each surface renders a widget declaring its own
   action, and the request carries `x-captcha-response`.
4. The server rejects a request without the token (400) and with a
   token whose action does not match the surface (403).
5. A failed attempt resets the widget so the next try works.
6. `pnpm typecheck` clean, `pnpm test` green.

## Test plan

- `tests/unit/turnstile.test.ts` — hostname parsing, the
  both-or-neither rule, the defaults, and the plugin wiring (one
  plugin per surface, disjoint endpoints, distinct actions).
- `tests/interaction/turnstile-widget.test.tsx` — the token is captured,
  expiry and error clear it, the reset signal resets the widget, and
  unmount removes it.
- Manual, on a deployment with the env vars set: sign up (passes),
  replay the same token (rejected).

## Rollback plan

Remove the env vars. The check turns off and the auth forms behave
exactly as they do today. To remove the code as well, revert the
commit — nothing else depends on it.

## Open questions

1. **Should the AI surfaces be protected too?** Resume import and JD
   parse cost a fraction of a cent per call and sit behind auth, so
   the multiplication risk is at the sign-up door. If abuse shows up,
   they are the next candidates.
2. **Should sign-in stay?** Managed-mode Turnstile is invisible to most
   humans, so the friction is near zero — but it is a step. If users
   complain, dropping `/sign-in/email` from the plugin's `endpoints` is
   a one-line change.
