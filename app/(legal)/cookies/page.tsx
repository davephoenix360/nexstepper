import type { Metadata } from 'next';

import { PolicyNotice } from '../_components/policy-notice';
import { PolicyToc } from '../_components/policy-toc';

export const metadata: Metadata = {
  title: 'Cookie Policy — Nextep',
  description:
    'Every cookie Nextep sets, why we set it, how long it lasts, and how to control it.',
  robots: { index: true, follow: true }
};

const LAST_UPDATED = '2026-09-24';

const toc = [
  { id: 'what-are-cookies', label: '1. What are cookies' },
  { id: 'cookies-we-use', label: '2. Cookies we use' },
  { id: 'third-party', label: '3. Third-party cookies' },
  { id: 'how-to-control', label: '4. How to control cookies' },
  { id: 'changes', label: '5. Changes' },
  { id: 'contact', label: '6. Contact' }
];

export default function CookiesPage() {
  return (
    <article className="prose prose-neutral max-w-none dark:prose-invert">
      <PolicyNotice lastUpdated={LAST_UPDATED} />
      <PolicyToc items={toc} />

      <h1>Cookie Policy</h1>
      <p>
        <strong>Last updated:</strong> {LAST_UPDATED}.
      </p>

      <h2 id="what-are-cookies">1. What are cookies</h2>
      <p>
        Cookies are small text files that a website stores in your
        browser. They hold a small amount of information that lets the
        site recognize you across requests. We use cookies sparingly —
        only what we need to run the service and a single set of
        analytics cookies that you can opt out of.
      </p>

      <h2 id="cookies-we-use">2. Cookies we use</h2>
      <p>
        The table below lists every cookie Nextep sets. &ldquo;Essential&rdquo;
        cookies are required for the service to work and are always set.
        &ldquo;Analytics&rdquo; cookies are only set after you accept the cookie
        banner (EU/UK visitors) or by default in regions where consent is
        not required.
      </p>

      <h3>Essential</h3>
      <div className="not-prose overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left">
            <tr>
              <th className="py-2 pr-4">Cookie</th>
              <th className="py-2 pr-4">Purpose</th>
              <th className="py-2 pr-4">Provider</th>
              <th className="py-2">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="py-2 pr-4 font-mono text-xs">nextep.session_token</td>
              <td className="py-2 pr-4">Authentication — keeps you signed in.</td>
              <td className="py-2 pr-4">Nextep (Better Auth)</td>
              <td className="py-2">Session (cleared on logout)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono text-xs">nextep.csrf_token</td>
              <td className="py-2 pr-4">CSRF protection on Server Actions.</td>
              <td className="py-2 pr-4">Next.js</td>
              <td className="py-2">Session</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono text-xs">nextep.share_token</td>
              <td className="py-2 pr-4">Remembers a shared resume link the user visited.</td>
              <td className="py-2 pr-4">Nextep</td>
              <td className="py-2">7 days</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Analytics (opt-in for EU/UK)</h3>
      <div className="not-prose overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left">
            <tr>
              <th className="py-2 pr-4">Cookie</th>
              <th className="py-2 pr-4">Purpose</th>
              <th className="py-2 pr-4">Provider</th>
              <th className="py-2">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="py-2 pr-4 font-mono text-xs">ph_*</td>
              <td className="py-2 pr-4">PostHog session + identity tracking.</td>
              <td className="py-2 pr-4">PostHog</td>
              <td className="py-2">Up to 1 year (PostHog defaults)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        PostHog cookies identify returning users so we can see, e.g.,
        that 60% of free users who try the AI chat once come back.
        PostHog data is sent to PostHog&apos;s hosted service (US or EU
        region depending on our project setting) and is governed by
        PostHog&apos;s privacy policy. We disable PostHog on the marketing
        site for visitors who have not accepted analytics.
      </p>

      <h2 id="third-party">3. Third-party cookies</h2>
      <p>
        Stripe may set cookies when you load the checkout page. Those
        cookies are required for fraud detection and payment processing;
        they are not used for advertising. Stripe&apos;s full cookie list is
        in their <a href="https://stripe.com/cookies">cookie notice</a>.
      </p>
      <p>
        We do not run any third-party advertising cookies, retargeting
        pixels, or social media embeds that set tracking cookies. If we
        add any in the future, we&apos;ll update this page and ask for your
        consent in the cookie banner.
      </p>

      <h2 id="how-to-control">4. How to control cookies</h2>
      <p>
        You can block or delete cookies in your browser settings.
        Blocking essential cookies will break sign-in; blocking
        analytics cookies has no effect on the service. Specific paths:
      </p>
      <ul>
        <li><strong>Chrome</strong> — Settings → Privacy and security → Cookies and other site data.</li>
        <li><strong>Safari</strong> — Preferences → Privacy → Manage Website Data.</li>
        <li><strong>Firefox</strong> — Preferences → Privacy &amp; Security → Cookies and Site Data.</li>
        <li><strong>Edge</strong> — Settings → Cookies and site permissions → Cookies and site data.</li>
      </ul>
      <p>
        The Global Privacy Control (GPC) signal is honored: visitors
        from California (CCPA/CPRA) with GPC enabled are treated as
        having opted out of analytics cookies automatically.
      </p>

      <h2 id="changes">5. Changes</h2>
      <p>
        We update this page whenever we add or remove a cookie. Material
        changes (e.g. adding advertising cookies) are announced via
        email and require renewed consent in the cookie banner.
      </p>
      <ul>
        <li><strong>2026-09-24</strong> — initial version (generated from Termly open templates).</li>
      </ul>

      <h2 id="contact">6. Contact</h2>
      <p>
        Questions about cookies: <code>privacy@nextep.app</code>.
      </p>
    </article>
  );
}