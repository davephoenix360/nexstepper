/**
 * The Turnstile configuration.
 *
 * The bot check is OFF unless BOTH the site key and the secret are
 * present. That is deliberate: a half-configured deployment gets no
 * bot check rather than a bot check that rejects everyone. But a silent
 * hole is worse than a loud one, so the misconfiguration is warned
 * about — and that is what these tests pin.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudflareTurnstileOptions } from 'better-auth/plugins';

import {
  __resetTurnstileWarnings,
  defaultTurnstileHostnames,
  getTurnstileConfig,
  parseTurnstileHostnames,
  turnstileAuthPlugins
} from '@/lib/turnstile';

const ENV_KEYS = [
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET',
  'TURNSTILE_HOSTNAMES',
  'NODE_ENV'
] as const;

const original: Record<string, string | undefined> = {};

/** `process.env.NODE_ENV` is typed read-only, so read through a cast. */
function readEnv(key: string): string | undefined {
  return (process.env as Record<string, string | undefined>)[key];
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    original[key] = readEnv(key);
    delete process.env[key];
  }
  __resetTurnstileWarnings();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else (process.env as Record<string, string | undefined>)[key] = original[key];
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('parseTurnstileHostnames', () => {
  it('splits on commas and trims', () => {
    expect(parseTurnstileHostnames('a.com, b.com ,c.com')).toEqual([
      'a.com',
      'b.com',
      'c.com'
    ]);
  });

  it('drops empty entries', () => {
    expect(parseTurnstileHostnames('a.com,,  ,b.com')).toEqual([
      'a.com',
      'b.com'
    ]);
  });

  it('treats undefined as empty', () => {
    expect(parseTurnstileHostnames(undefined)).toEqual([]);
    expect(parseTurnstileHostnames('')).toEqual([]);
  });
});

describe('defaultTurnstileHostnames', () => {
  it('uses the production hosts in production', () => {
    expect(defaultTurnstileHostnames('production')).toContain(
      'www.nexstepper.com'
    );
  });

  it('uses localhost in development', () => {
    expect(defaultTurnstileHostnames('development')).toEqual(['localhost']);
    expect(defaultTurnstileHostnames('test')).toEqual(['localhost']);
  });

  it('never puts localhost in a production allowlist', () => {
    const hosts = defaultTurnstileHostnames('production');
    expect(hosts).not.toContain('localhost');
    expect(hosts).not.toContain('127.0.0.1');
  });
});

describe('getTurnstileConfig', () => {
  it('is disabled when nothing is configured', () => {
    const config = getTurnstileConfig();
    expect(config.enabled).toBe(false);
    expect(config.siteKey).toBeNull();
    expect(config.secretKey).toBeNull();
  });

  it('is enabled when both the site key and the secret are set', () => {
    process.env.TURNSTILE_SITE_KEY = '0x4AAAAAAFw4ohsxlVQ359Nc';
    process.env.TURNSTILE_SECRET = '0x-secret';
    const config = getTurnstileConfig();
    expect(config.enabled).toBe(true);
    expect(config.siteKey).toBe('0x4AAAAAAFw4ohsxlVQ359Nc');
    expect(config.secretKey).toBe('0x-secret');
  });

  it('is disabled — and warns — when only the site key is set', () => {
    process.env.TURNSTILE_SITE_KEY = '0x4AAAAAAFw4ohsxlVQ359Nc';
    const config = getTurnstileConfig();
    expect(config.enabled).toBe(false);
    expect(console.warn).toHaveBeenCalled();
    expect(String((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain(
      'DISABLED'
    );
  });

  it('is disabled — and warns — when only the secret is set', () => {
    process.env.TURNSTILE_SECRET = '0x-secret';
    const config = getTurnstileConfig();
    expect(config.enabled).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it('never returns an empty hostname allowlist', () => {
    // An empty allowlist turns the hostname check OFF, which is the
    // check that stops a token minted on one of our own preview
    // deployments being replayed on production.
    const config = getTurnstileConfig();
    expect(config.allowedHostnames.length).toBeGreaterThan(0);
  });

  it('prefers the configured hostnames over the defaults', () => {
    process.env.TURNSTILE_HOSTNAMES = 'www.nexstepper.com, nexstepper.com';
    expect(getTurnstileConfig().allowedHostnames).toEqual([
      'www.nexstepper.com',
      'nexstepper.com'
    ]);
  });

  it('treats a blank hostname list as unset', () => {
    process.env.TURNSTILE_HOSTNAMES = '  ,  ';
    expect(getTurnstileConfig().allowedHostnames).toEqual(
      defaultTurnstileHostnames()
    );
  });
});

describe('turnstileAuthPlugins', () => {
  it('registers no plugin when Turnstile is disabled', () => {
    // A plugin with a missing secret throws MISSING_SECRET_KEY on the
    // request, which would 500 every sign-up.
    expect(turnstileAuthPlugins(getTurnstileConfig())).toEqual([]);
  });

  it('registers one plugin per protected surface when enabled', () => {
    process.env.TURNSTILE_SITE_KEY = '0x4AAAAAAFw4ohsxlVQ359Nc';
    process.env.TURNSTILE_SECRET = '0x-secret';
    const plugins = turnstileAuthPlugins(getTurnstileConfig());
    expect(plugins).toHaveLength(3);

    const options = plugins.map((p) => p.options as CloudflareTurnstileOptions);
    const endpoints = options.map((o) => o.endpoints?.[0]);
    expect(endpoints).toEqual([
      '/sign-up/email',
      '/sign-in/email',
      '/request-password-reset'
    ]);

    // Each surface declares its OWN action, so a token minted on one
    // cannot be replayed against another.
    const actions = options.map((o) => o.expectedAction);
    expect(actions).toEqual(['signup', 'login', 'password-reset']);
    expect(new Set(actions).size).toBe(3);

    // No two plugins guard the same endpoint, so exactly one check runs
    // per request.
    expect(new Set(endpoints).size).toBe(3);
  });

  it('passes the secret and the hostname allowlist to every plugin', () => {
    process.env.TURNSTILE_SITE_KEY = '0x4AAAAAAFw4ohsxlVQ359Nc';
    process.env.TURNSTILE_SECRET = '0x-secret';
    process.env.TURNSTILE_HOSTNAMES = 'www.nexstepper.com';
    const plugins = turnstileAuthPlugins(getTurnstileConfig());
    for (const plugin of plugins) {
      const o = plugin.options as CloudflareTurnstileOptions;
      expect(o.provider).toBe('cloudflare-turnstile');
      expect(o.secretKey).toBe('0x-secret');
      expect(o.allowedHostnames).toEqual(['www.nexstepper.com']);
    }
  });
});
