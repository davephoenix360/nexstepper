import type { Metadata } from 'next';

import { PolicyNotice } from '../_components/policy-notice';
import { PolicyToc } from '../_components/policy-toc';

export const metadata: Metadata = {
  title: 'Privacy Policy — Nextep',
  description:
    'How Nextep collects, uses, retains, and shares your personal information, and the rights you have under GDPR, CCPA, and PIPEDA.',
  robots: { index: true, follow: true }
};

const LAST_UPDATED = '2026-09-24';

const toc = [
  { id: 'summary', label: 'Summary' },
  { id: 'information-we-collect', label: '1. Information we collect' },
  { id: 'how-we-use', label: '2. How we use information' },
  { id: 'legal-basis', label: '3. Legal basis for processing (GDPR)' },
  { id: 'subprocessors', label: '4. Subprocessors' },
  { id: 'cookies', label: '5. Cookies and tracking' },
  { id: 'retention', label: '6. Data retention' },
  { id: 'your-rights', label: '7. Your rights' },
  { id: 'international', label: '8. International transfers' },
  { id: 'children', label: '9. Children&apos;s privacy' },
  { id: 'security', label: '10. Security' },
  { id: 'open-source', label: '11. Open-source + self-hosting' },
  { id: 'changes', label: '12. Changes to this policy' },
  { id: 'contact', label: '13. Contact' }
];

export default function PrivacyPage() {
  return (
    <article className="prose prose-neutral max-w-none dark:prose-invert">
      <PolicyNotice lastUpdated={LAST_UPDATED} />
      <PolicyToc items={toc} />

      <h1>Privacy Policy</h1>
      <p>
        <strong>Last updated:</strong> {LAST_UPDATED}.
      </p>

      <h2 id="summary">Summary</h2>
      <p>
        Nextep (&ldquo;Nextep&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is an AI-assisted resume
        builder. We collect only the information we need to run the
        service, retain it only as long as we have a reason to, and give
        you tools to export or delete it on demand. We do not sell your
        personal information. We do not use your resume content to train
        third-party AI models. Subprocessors are listed in §4.
      </p>

      <h2 id="information-we-collect">1. Information we collect</h2>
      <p>We collect three categories of information:</p>
      <ul>
        <li>
          <strong>Account information you provide</strong> — email address,
          display name, and a hashed password. If you sign in with a
          third-party provider (e.g. Google) in the future, we receive the
          email and basic profile fields that provider exposes.
        </li>
        <li>
          <strong>Resume content you create</strong> — the master resume,
          its revisions, tailored variants, applications (job postings
          you&apos;ve attached), and AI-generated suggestions you accept or
          reject. This content is yours; we hold it to render the editor
          and to power features like ATS scoring.
        </li>
        <li>
          <strong>Usage information collected automatically</strong> — IP
          address, browser type, pages visited, and timestamps. We use
          this for security (rate limiting, abuse detection) and product
          analytics (which features get used). Analytics data is sent to
          PostHog; see §4.
        </li>
      </ul>

      <h2 id="how-we-use">2. How we use information</h2>
      <p>We use the information above to:</p>
      <ul>
        <li>Operate the service (render your editor, score your resume, generate AI suggestions).</li>
        <li>Process your subscription if you upgrade to Pro (handled by Stripe; we never see your card number).</li>
        <li>Detect abuse, protect against security incidents, and enforce our Terms.</li>
        <li>Send transactional email (password reset, billing receipts) — never marketing email without your explicit opt-in.</li>
        <li>Improve the product: aggregated, de-identified usage patterns. We do not use your resume content for AI training.</li>
      </ul>

      <h2 id="legal-basis">3. Legal basis for processing (GDPR)</h2>
      <p>
        Under the EU GDPR we process your personal data on the following
        bases:
      </p>
      <ul>
        <li>
          <strong>Contract (Art. 6(1)(b))</strong> — providing the service
          you signed up for, processing your subscription, storing your
          resume content.
        </li>
        <li>
          <strong>Legitimate interest (Art. 6(1)(f))</strong> — security,
          fraud prevention, basic product analytics. You can object at any
          time (see §7).
        </li>
        <li>
          <strong>Consent (Art. 6(1)(a))</strong> — only for optional
          features that aren&apos;t part of the core service (e.g. marketing
          email). You withdraw consent at any time.
        </li>
      </ul>

      <h2 id="subprocessors">4. Subprocessors</h2>
      <p>
        We share your information with the following subprocessors to run
        the service. Each is bound by a Data Processing Agreement.
      </p>
      <ul>
        <li><strong>Neon</strong> — managed Postgres database (US or EU region).</li>
        <li><strong>Vercel</strong> — hosting + edge network.</li>
        <li><strong>Stripe</strong> — payment processing. Receives your email and billing details; never receives your resume content.</li>
        <li><strong>Resend</strong> — transactional email (password reset, receipts).</li>
        <li><strong>PostHog</strong> — product analytics. Receives usage events keyed by an opaque user ID. We scrub user properties on account deletion (§7).</li>
        <li><strong>Sentry</strong> — error monitoring. Errors are automatically scrubbed of PII by Sentry&apos;s default data-scrubbing rules.</li>
        <li>
          <strong>Vercel AI Gateway</strong> — routes AI requests to model providers (see below).
          Receives your resume content + your prompt; the gateway returns the model&apos;s
          response. See §8 for retention behaviour.
          <br />
          <strong>Actual model providers</strong> (configured in{' '}
          <code>lib/ai/providers.ts</code>):
          <ul>
            <li><strong>Mistral</strong> (<code>mistral/mistral-nemo</code>) — primary. Free-tier.</li>
            <li><strong>Meta</strong> (<code>meta/llama-3.1-8b</code>) — first fallback.</li>
            <li><strong>Amazon</strong> (<code>amazon/nova-micro</code>) — second fallback.</li>
            <li><strong>OpenAI</strong> (<code>openai/gpt-4o-mini</code>) — third fallback.</li>
          </ul>
          The fallback chain kicks in only when the previous model fails or
          times out. Your prompt is sent to at most one provider per
          request. We may swap the primary or fallbacks without notice
          (e.g. if a provider&apos;s free tier changes); the current
          configuration is always visible at the GitHub link in §11.
        </li>
      </ul>
      <p>
        <strong>Configured but not currently active.</strong> We have
        client SDKs wired for <strong>Inngest</strong> (background
        jobs) and <strong>Liveblocks</strong> (real-time collaboration,
        planned for Phase 5). Neither processes user data today. When
        either ships, we will update this list before the change takes
        effect.
      </p>
      <p>
        We will give you 30 days&apos; notice via email before adding a new
        subprocessor that handles personal data. Continued use of the
        service after notice is your consent; you may export or delete
        your data before the change takes effect.
      </p>

      <h2 id="cookies">5. Cookies and tracking</h2>
      <p>
        We use the minimum cookies necessary. See our{' '}
        <a href="/cookies">Cookie Policy</a> for the full list, including
        retention times and how to disable non-essential cookies.
      </p>

      <h2 id="retention">6. Data retention</h2>
      <p>
        We retain your account data for as long as your account is active.
        Specific retention windows:
      </p>
      <ul>
        <li>
          <strong>Account profile, resumes, chat history</strong> — until
          you delete your account or 24 months after your last login,
          whichever comes first.
        </li>
        <li>
          <strong>Billing records</strong> — 7 years (tax / financial
          audit requirement). Contains your name, email, invoice amount,
          and last 4 digits of card. Card numbers never touch our
          servers.
        </li>
        <li>
          <strong>Stripe webhook event log</strong> — append-only; pruned
          after 30 days. Used for idempotency; retained on a legal
          obligation basis.
        </li>
        <li>
          <strong>Backups</strong> — Neon PIT backups retained 7 days (or
          per your plan tier). Backups are scrubbed of personal data on
          the same 30-day rolling cycle as live data.
        </li>
      </ul>

      <h2 id="your-rights">7. Your rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li><strong>Access</strong> — see what we hold. Go to <code>/dashboard/security</code> and click <em>Download my data</em>; the file is generated and downloaded instantly as JSON.</li>
        <li><strong>Portability</strong> — receive your data in a structured, machine-readable format. Same export as above.</li>
        <li><strong>Deletion</strong> — request erasure of your data. Same <code>/dashboard/security</code> page, <em>Delete Account</em> button. We erase across our database, our payment processor, and our analytics. Most deletions complete in under 60 seconds; some third-party processors may take up to 30 days.</li>
        <li><strong>Correction</strong> — edit your profile information from <code>/dashboard/general</code>.</li>
        <li><strong>Object / restrict</strong> — email <code>privacy@nextep.app</code>. We&apos;ll respond within 30 days.</li>
        <li><strong>Withdraw consent</strong> — for any optional processing (e.g. marketing email), unsubscribe link in the email itself or contact us.</li>
      </ul>
      <p>
        <strong>California residents (CCPA/CPRA):</strong> you also have
        the right to (a) know what categories of personal information we
        collect (see §1), (b) opt out of sale or sharing (we don&apos;t sell
        or share), (c) limit use of sensitive personal information (we
        don&apos;t collect any under CPRA&apos;s definition), and (d) non-
        discrimination for exercising these rights.
      </p>
      <p>
        <strong>Canadian residents (PIPEDA):</strong> the same access,
        correction, and deletion rights apply. To file a complaint with
        the Office of the Privacy Commissioner of Canada, visit{' '}
        <a href="https://www.priv.gc.ca/">
          priv.gc.ca
        </a>
        .
      </p>
      <p>
        <strong>EU/UK residents (GDPR):</strong> you may lodge a complaint
        with your supervisory authority. The list of EU DPAs is at{' '}
        <a href="https://edpb.europa.eu/about-edpb/about-edpb/members_en">
          edpb.europa.eu
        </a>
        ; the UK ICO is at{' '}
        <a href="https://ico.org.uk/">ico.org.uk</a>.
      </p>

      <h2 id="international">8. International transfers</h2>
      <p>
        Nextep is operated from the United States. If you use the service
        from outside the US, your information will be transferred to and
        processed in the US. We rely on the European Commission&apos;s
        Standard Contractual Clauses (2021/914) and the UK International
        Data Transfer Addendum for transfers from the EU/UK to the US.
        AI Gateway model providers may process your prompts in their own
        regions; the Vercel AI Gateway routes per their published policy.
      </p>

      <h2 id="children">9. Children&apos;s privacy</h2>
      <p>
        Nextep is not directed at children under 16. We do not knowingly
        collect personal information from children. If you believe a
        child has signed up, email <code>privacy@nextep.app</code> and we
        will delete the account.
      </p>

      <h2 id="security">10. Security</h2>
      <p>
        We protect your data with industry-standard measures: TLS in
        transit, AES-256 at rest (via Neon&apos;s encryption), bcrypt-hashed
        passwords (via Better Auth), strict role-based access controls on
        internal systems, and continuous monitoring via Sentry. No system
        is perfectly secure; if you discover a vulnerability, please email{' '}
        <code>security@nextep.app</code> (PGP key on request).
      </p>

      <h2 id="open-source">11. Open-source + self-hosting</h2>
      <p>
        The Nextep source code is released under the
        <a href="https://opensource.org/licenses/MIT" rel="noreferrer">MIT license</a>.
        This Privacy Policy covers only the <strong>hosted</strong>{' '}
        service at <code>nextep.app</code>.
      </p>
      <p>
        If you self-host the code on your own infrastructure, you are the
        data controller for any data your users put into the system. The
        Nextep privacy policy does not apply to your instance. You are
        responsible for:
      </p>
      <ul>
        <li>Publishing your own privacy policy that names you as the controller.</li>
        <li>Listing the subprocessors <em>you</em> actually use (Stripe, Resend, AI providers, etc. — likely the same as ours, but it&apos;s your call).</li>
        <li>Responding to user data-access, deletion, and portability requests within the timelines required by your jurisdiction.</li>
        <li>Compliance with GDPR, CCPA, PIPEDA, or any other applicable privacy laws based on where your users live.</li>
      </ul>
      <p>
        See <a href="/SELF_HOSTING">self-hosting guide</a> for the full
        checklist.
      </p>

      <h2 id="changes">12. Changes to this policy</h2>
      <p>
        We will post material changes here at least 14 days before they
        take effect and email active users. Non-material changes (typo
        fixes, clarifications) are logged in the revision history below.
      </p>
      <ul>
        <li><strong>2026-09-24</strong> — initial version (generated from Termly open templates).</li>
        <li><strong>2026-09-24</strong> — added §11 &ldquo;Open-source + self-hosting&rdquo; scope clarification (the Nextep hosted service and your self-hosted instance have separate data-controller relationships).</li>
      </ul>

      <h2 id="contact">13. Contact</h2>
      <p>
        Privacy questions: <code>privacy@nextep.app</code>.
        <br />
        Security disclosures: <code>security@nextep.app</code>.
        <br />
        Postal: <em>available on request</em> (we&apos;re a small team; email
        is the fastest path).
      </p>
    </article>
  );
}