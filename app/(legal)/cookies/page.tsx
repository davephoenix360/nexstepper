import type { Metadata } from 'next';
import { Cookie, BarChart3, Ban, Settings2 } from 'lucide-react';

import { PolicyNotice } from '../_components/policy-notice';
import { PolicyShell } from '../_components/policy-shell';
import { PolicySummary } from '../_components/policy-summary';

export const metadata: Metadata = {
  title: 'Cookie Policy — Nexstepper',
  description:
    'Every cookie Nexstepper sets, why we set it, how long it lasts, and how to control it.',
  robots: { index: true, follow: true }
};

const LAST_UPDATED = '2026-10-08';

const toc = [
  { id: 'what-are-cookies', label: '1. What are cookies' },
  { id: 'cookies-we-use', label: '2. Cookies we use' },
  { id: 'third-party', label: '3. Third-party cookies' },
  { id: 'how-to-control', label: '4. How to control cookies' },
  { id: 'changes', label: '5. Changes' },
  { id: 'contact', label: '6. Contact' }
];

const summaryItems = [
  {
    icon: Cookie,
    question: 'How many cookies?',
    answer:
      'One first-party cookie: the session cookie that keeps you signed in. It is exempt from consent because the site cannot work without it.',
    href: 'cookies-we-use'
  },
  {
    icon: BarChart3,
    question: 'What is analytics?',
    answer:
      'PostHog, so we can see which features are used. Off until you allow it, and anonymous by default.',
    href: 'third-party'
  },
  {
    icon: Ban,
    question: 'Any advertising cookies?',
    answer:
      'None. We do not run ads, ad pixels, or cross-site tracking of any kind.',
    href: 'cookies-we-use'
  },
  {
    icon: Settings2,
    question: 'How do I change my mind?',
    answer:
      'Clear the choice in your browser storage and the banner returns. Rejecting costs you nothing.',
    href: 'how-to-control'
  }
];

export default function CookiesPage() {
  return (
    <PolicyShell
      title="Cookie Policy"
      summary="One cookie keeps you signed in. One analytics tool runs only if you say yes. That is the whole list."
      lastUpdated={LAST_UPDATED}
      toc={toc}
      intro={<PolicySummary items={summaryItems} />}
    >
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
        There are exactly two cookies, both set by Better Auth, and
        neither is optional — without them you cannot stay signed in.
        Under ePrivacy Article 5(3) they are exempt from consent,
        because the service cannot be delivered without them. Analytics
        is handled separately, in §3, and stays off until you allow it.
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
              <td className="py-2 pr-4 font-mono text-xs">nexstepper.session_token</td>
              <td className="py-2 pr-4">Authentication — keeps you signed in.</td>
              <td className="py-2 pr-4">Nexstepper (Better Auth)</td>
              <td className="py-2">Session (cleared on logout)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono text-xs">nexstepper.session_data</td>
              <td className="py-2 pr-4">
                Short-lived cache of your session so page loads don&apos;t
                re-query the database.
              </td>
              <td className="py-2 pr-4">Nexstepper (Better Auth)</td>
              <td className="py-2">5 minutes</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        On HTTPS deployments these may carry a <code>__Secure-</code>{" "}
        prefix. That is a browser security convention, not a different
        cookie.
      </p>

      <h3>Analytics (only with your consent)</h3>
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
        PostHog cookies identify returning visitors so we can see, e.g.,
        whether people who try the AI chat once come back. PostHog data
        is sent to PostHog&apos;s hosted service (US or EU region
        depending on our project setting) and is governed by PostHog&apos;s
        privacy policy.
      </p>
      <p>
        <strong>PostHog is not initialised at all until you consent.</strong>{' '}
        That is enforced in code, not just in the banner: the analytics
        SDK loads only after your decision is recorded, so declining
        means nothing is sent. If you decline and reload, the request
        never happens.
      </p>

      <h3>Where your choice is stored</h3>
      <p>
        Your answer is kept in your browser&apos;s local storage under the
        key <code>nexstepper.consent</code>. We deliberately do not use a
        cookie to store consent, because doing so would mean setting a
        non-essential cookie before you had agreed to any. Clearing that
        browser storage entry simply brings the banner back.
      </p>

      <h2 id="third-party">3. Third-party cookies</h2>
      <p>
        Stripe sets its own cookies when you reach a checkout page.
        Those are used for fraud detection and payment processing, not
        advertising, and Stripe&apos;s full list is in their{' '}
        <a href="https://stripe.com/cookies">cookie notice</a>. They are
        set by Stripe when you choose to pay us — not by this site, and
        not before then.
      </p>
      <p>
        We do not run any third-party advertising cookies, retargeting
        pixels, or social media embeds that set tracking cookies. If we
        add any in the future, we&apos;ll update this page and ask for your
        consent in the cookie banner.
      </p>

      <h2 id="how-to-control">4. How to control cookies</h2>
      <p>
        Your choice is one click either way in the banner, and rejecting
        optional cookies costs you nothing in the product. You can also
        change it later: clear this site&apos;s browser storage (or use the
        &ldquo;Customise&rdquo; control when the banner is showing) and you
        will be asked again. Browser-level controls work as usual —
        blocking essential cookies will break sign-in, while blocking
        analytics changes nothing.
      </p>
      <ul>
        <li><strong>Chrome</strong> — Settings → Privacy and security → Cookies and other site data.</li>
        <li><strong>Safari</strong> — Preferences → Privacy → Manage Website Data.</li>
        <li><strong>Firefox</strong> — Preferences → Privacy &amp; Security → Cookies and Site Data.</li>
        <li><strong>Edge</strong> — Settings → Cookies and site permissions → Cookies and site data.</li>
      </ul>
      <p>
        The Global Privacy Control (GPC) signal is honoured: if your
        browser sends it — which you can enable in Firefox, or in
        Chrome/Edge extensions for California — we treat you as having
        declined analytics, and the banner will not keep asking.
      </p>

      <h2 id="changes">5. Changes</h2>
      <p>
        We update this page whenever we add or remove a cookie. Material
        changes (e.g. adding advertising cookies) are announced via
        email and require renewed consent in the cookie banner.
      </p>
      <ul>
        <li><strong>2026-10-08</strong> — Consent banner introduced and analytics gated behind it: PostHog is no longer initialised until you allow analytics. GPC is now honoured in code (it was previously described here but not implemented). Removed two cookies this page listed that the application never set (<code>nexstepper.csrf_token</code>, <code>nexstepper.share_token</code>). Domain references corrected to <code>nexstepper.com</code>.</li>
        <li><strong>2026-09-25</strong> — Rebrand: cookie prefix updated from <code>nextep.*</code> to <code>nexstepper.*</code>; site name updated. Existing sessions were invalidated at the rename boundary.</li>
        <li><strong>2026-09-24</strong> — initial version (generated from Termly open templates).</li>
      </ul>

      <h2 id="contact">6. Contact</h2>
      <p>
        Questions about cookies: <code>privacy@nexstepper.com</code>.
      </p>

      <PolicyNotice lastUpdated={LAST_UPDATED} />
    </PolicyShell>
  );
}
