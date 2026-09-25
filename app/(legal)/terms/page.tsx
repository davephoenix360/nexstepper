import type { Metadata } from 'next';

import { PolicyNotice } from '../_components/policy-notice';
import { PolicyToc } from '../_components/policy-toc';

export const metadata: Metadata = {
  title: 'Terms of Service — Nextep',
  description:
    'The terms that govern your use of Nextep — account rules, billing, AI-generated content disclaimer, and acceptable use.',
  robots: { index: true, follow: true }
};

const LAST_UPDATED = '2026-09-24';

const toc = [
  { id: 'acceptance', label: '1. Acceptance' },
  { id: 'service', label: '2. The service' },
  { id: 'open-source', label: '3. Open-source + hosted' },
  { id: 'accounts', label: '4. Your account' },
  { id: 'subscription', label: '5. Subscriptions + billing' },
  { id: 'acceptable-use', label: '6. Acceptable use' },
  { id: 'ip', label: '7. Intellectual property' },
  { id: 'ai-disclaimer', label: '8. AI-generated content' },
  { id: 'trademarks', label: '9. Trademarks' },
  { id: 'liability', label: '10. Limitation of liability' },
  { id: 'disclaimers', label: '11. Disclaimers + warranties' },
  { id: 'termination', label: '12. Termination' },
  { id: 'changes', label: '13. Changes to these terms' },
  { id: 'governing-law', label: '14. Governing law' },
  { id: 'contact', label: '15. Contact' }
];

export default function TermsPage() {
  return (
    <article className="prose prose-neutral max-w-none dark:prose-invert">
      <PolicyNotice lastUpdated={LAST_UPDATED} />
      <PolicyToc items={toc} />

      <h1>Terms of Service</h1>
      <p>
        <strong>Last updated:</strong> {LAST_UPDATED}.
      </p>

      <h2 id="acceptance">1. Acceptance</h2>
      <p>
        By creating an account or otherwise using Nextep
        (&ldquo;Nextep&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), you agree to these Terms
        of Service (&ldquo;Terms&rdquo;). If you don&apos;t agree, do not use the
        service. These Terms form a binding agreement between you and
        Nextep.
      </p>

      <h2 id="service">2. The service</h2>
      <p>
        Nextep is an AI-assisted resume builder. We let you create a
        master resume, generate tailored variants against a job
        description, score your resume against an ATS rubric, share
        resumes via a public link, and converse with an AI chat assistant.
        We may add, change, or remove features at any time; if a change
        materially reduces what you can do with your paid plan, we&apos;ll
        give you 30 days&apos; notice and the option to cancel for a prorated
        refund.
      </p>

      <h2 id="open-source">3. Open-source + hosted</h2>
      <p>
        The Nextep source code is released under the
        <a href="https://opensource.org/licenses/MIT" rel="noreferrer">
        MIT license
        </a>
        and is available at our GitHub repository. The MIT license gives
        you the right to run, modify, and distribute the code, including
        for commercial purposes.
      </p>
      <p>
        These Terms apply specifically to the <strong>hosted</strong>
        service offered at <code>nextep.app</code> and any other domain we
        operate. If you self-host the code under your own infrastructure,
        you are responsible for your own terms of service, privacy
        policy, and legal compliance — see our
        <a href="/SELF_HOSTING">self-hosting guide</a> for the rules.
        This document does not govern your relationship with users of your
        self-hosted instance.
      </p>
      <p>
        We charge for the hosted version because we manage authentication,
        billing, AI provider keys, error monitoring, and security patches
        on your behalf. You can run the same code yourself for free
        (subject to your own infrastructure costs).
      </p>

      <h2 id="accounts">4. Your account</h2>
      <ul>
        <li>You must be at least 16 years old to use the service.</li>
        <li>You&apos;re responsible for keeping your password secure and for activity on your account.</li>
        <li>Provide accurate information; don&apos;t impersonate anyone.</li>
        <li>You may close your account at any time from <code>/dashboard/security</code>. Closure is non-reversible and erases your data per our <a href="/privacy">Privacy Policy</a>.</li>
      </ul>

      <h2 id="subscription">5. Subscriptions + billing</h2>
      <p>
        <strong>Free tier.</strong> The Free tier is free of charge and
        includes unlimited resume creation and ATS feedback, plus up to
        20 AI chat messages per day. Free users do <em>not</em> get access
        to AI-powered bullet rewrites; that is a Pro feature.
      </p>
      <p>
        <strong>Pro tier.</strong> The Pro tier is billed monthly through
        Stripe. The current price is displayed on the{' '}
        <a href="/pricing">Pricing</a> page before you upgrade.
        Pro includes unlimited chat, AI rewrites, public sharing, and any
        other Pro-marked feature.
      </p>
      <p>
        <strong>Billing cycle.</strong> Your subscription renews
        automatically each month on the date you first subscribed. You
        can cancel at any time from <code>/dashboard/general</code>; you
        keep Pro access through the end of the current billing period
        and are not charged again. We do not pro-rate refunds for
        partial months except where required by law or at our sole
        discretion.
      </p>
      <p>
        <strong>Failed payments.</strong> If a charge fails, Stripe
        retries per their policy and we move your account to a 7-day
        grace period. After 7 days the subscription flips to inactive
        and Pro features stop working. Your data is preserved; you can
        re-subscribe and resume.
      </p>
      <p>
        <strong>Taxes.</strong> Prices are exclusive of applicable
        sales tax, VAT, or GST. Stripe Tax calculates these for
        jurisdictions that require collection; the invoice you receive
        reflects the final amount charged.
      </p>
      <p>
        <strong>Price changes.</strong> We may change Pro pricing with
        30 days&apos; notice. Price changes apply to your next billing
        cycle after the notice period; you can cancel before the change
        takes effect.
      </p>

      <h2 id="acceptable-use">6. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the service to harass, defame, or harm anyone.</li>
        <li>Upload content you don&apos;t have the right to share (e.g. someone else&apos;s confidential information).</li>
        <li>Attempt to reverse-engineer, scrape at scale, or otherwise extract our proprietary models, scoring engine, or templates for use in a competing service.</li>
        <li>Upload malicious code, attempt to bypass rate limits, or otherwise abuse the infrastructure.</li>
        <li>Use the service to generate resumes that misrepresent qualifications, credentials, employment history, or identity in a way intended to deceive an employer.</li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate this section.
        We&apos;ll tell you before suspension unless the violation is so
        severe that warning would defeat the purpose.
      </p>

      <h2 id="ip">7. Intellectual property</h2>
      <p>
        <strong>Your content is yours.</strong> You retain all rights to
        the resume content, applications, and chat messages you create.
        You grant us a limited, worldwide, non-exclusive licence to host,
        process, and transmit that content solely to operate the service
        for you. We will never train third-party AI models on your
        content.
      </p>
      <p>
        <strong>Our service is ours.</strong> The Nextep name, logo,
        templates, scoring engine, and any other proprietary technology
        are owned by Nextep. Your use of the service does not transfer
        any ownership to you.
      </p>
      <p>
        <strong>Feedback.</strong> If you send us feedback or suggestions,
        we may use them without restriction or compensation. You waive
        any moral rights to that feedback.
      </p>

      <h2 id="ai-disclaimer">8. AI-generated content</h2>
      <p>
        Nextep includes AI features that generate, rewrite, or score
        resume content. AI suggestions are provided <em>as-is</em> and are
        <em>not professional career advice</em>. You are solely
        responsible for reviewing AI suggestions before using them in a
        job application. We make no representation that:
      </p>
      <ul>
        <li>An AI-generated bullet accurately describes your experience.</li>
        <li>An AI rewrite will improve your chances with a specific employer.</li>
        <li>An ATS score predicts whether you will receive an interview or job offer.</li>
      </ul>
      <p>
        Do not include fabricated qualifications, employers, dates, or
        credentials in your resume — whether AI-suggested or not. Doing
        so is grounds for account termination and may have legal
        consequences in your jurisdiction.
      </p>
      <p>
        <strong>Hosted service vs self-hosted AI.</strong> On the hosted
        version (<code>nextep.app</code>), AI requests route through our
        Vercel AI Gateway account and are subject to the provider&apos;s
        terms. If you self-host the software, AI requests route through{' '}
        <em>your</em> AI provider account and are subject to{' '}
        <em>your</em> agreement with that provider. Nextep has no
        visibility into prompts or outputs on a self-hosted instance.
      </p>

      <h2 id="trademarks">9. Trademarks</h2>
      <p>
        <strong>&ldquo;Nextep&rdquo;</strong>, the Nextep logo, the Nextep
        wordmark, and any related marks are trademarks of Nextep. They
        are <em>not</em> licensed under the MIT license that covers the
        source code. The MIT license gives you the right to run, modify,
        and distribute the code; it does not give you the right to use
        the Nextep name, logo, or any confusingly similar mark to
        identify or market your service.
      </p>
      <p>
        If you self-host, fork, or modify this code, you must:
      </p>
      <ul>
        <li>Choose a different name and logo for your service.</li>
        <li>Not market your service as &ldquo;Nextep&rdquo; or as officially affiliated with, endorsed by, or sponsored by Nextep.</li>
        <li>Not use the Nextep logo in any promotional material for your service.</li>
        <li>Make clear in your service&apos;s documentation that your instance is independently operated, not affiliated with Nextep.</li>
      </ul>
      <p>
        See <a href="/SELF_HOSTING">self-hosting guide</a> and the
        trademark notice in <a href="/LICENSE">LICENSE</a> for details.
      </p>

      <h2 id="liability">10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Nextep&apos;s total
        liability to you for any claim arising from your use of the
        service is limited to the greater of (a) the total amount you
        paid Nextep in the 12 months before the claim arose, or (b) USD
        $100. Nextep is not liable for indirect, incidental, special,
        consequential, or punitive damages, including lost profits,
        lost data, or reputational harm.
      </p>
      <p>
        Nothing in this section limits liability that cannot be excluded
        under applicable law (e.g. fraud, death, or personal injury
        caused by negligence).
      </p>

      <h2 id="disclaimers">11. Disclaimers + warranties</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;,
        without warranty of any kind, express or implied, including the
        implied warranties of merchantability, fitness for a particular
        purpose, and non-infringement. We do not warrant that the
        service will be uninterrupted, error-free, or secure.
      </p>

      <h2 id="termination">12. Termination</h2>
      <p>
        You may terminate at any time by closing your account from{' '}
        <code>/dashboard/security</code>. We may terminate or suspend your
        account for violation of these Terms (per §6) or for non-payment
        after the 7-day grace period (§5). Upon termination, we erase
        your personal data per our Privacy Policy §7; we retain only
        records we are legally required to keep (e.g. tax invoices).
      </p>

      <h2 id="changes">13. Changes to these terms</h2>
      <p>
        Material changes are announced via email at least 14 days before
        they take effect. Continued use after the effective date
        constitutes acceptance. If you do not accept the changes, you
        may close your account before they take effect; your data is
        exported or deleted per your Privacy Policy rights.
      </p>
      <ul>
        <li><strong>2026-09-24</strong> — initial version (generated from Termly open templates).</li>
        <li><strong>2026-09-24</strong> — added §3 &ldquo;Open-source + hosted&rdquo; scope, §8 hosted-vs-self-host AI disclaimer, §9 trademark clause.</li>
      </ul>

      <h2 id="governing-law">14. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of Delaware,
        United States, without regard to its conflict-of-laws
        principles. Any dispute arising from these Terms is subject to
        the exclusive jurisdiction of the state and federal courts in
        Delaware. Consumers in the EU/UK retain the protection of the
        mandatory laws of their country of residence.
      </p>

      <h2 id="contact">15. Contact</h2>
      <p>
        Questions about these Terms: <code>legal@nextep.app</code>.
        <br />
        Account issues: <code>support@nextep.app</code>.
      </p>
    </article>
  );
}