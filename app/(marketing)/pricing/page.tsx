import { CheckoutButton } from './submit-button';
import { Card, CardContent } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { PRICE_IDS, getStripePrices } from '@/lib/payments/stripe';
import { getSubscription } from '@/lib/db/queries';
import { isProEffective } from '@/lib/billing';

// Render at request time so the build doesn't depend on a live Stripe API key.
// Phase 0: this lets Vercel deploys succeed without configuring Stripe yet.
// Re-enable ISR (`export const revalidate = 3600`) once real Stripe prices are wired.
export const dynamic = 'force-dynamic';

type Plan = {
  id: 'free' | 'pro';
  name: string;
  /** `null` for Free. For Pro, read live from Stripe so the displayed
   *  price + currency auto-track whatever the founder configures in
   *  the Stripe Dashboard — no code change required. */
  price: { unitAmount: number; currency: string } | null;
  interval: 'month' | null;
  /** Optional subtitle shown under the price (joke/copy line). */
  priceNote: string | null;
  features: string[];
  priceId: string | null;
  cta: string;
  highlight?: boolean;
};

/**
 * Brand voice: students-made-by-students, job-seekers-made-by-a-
 * job-seeker. Funny, self-aware, never precious. Copy is calibrated
 * to the founder's "buy me a coffee" framing — Pro is the price of
 * one latte; Free is genuinely useful, not a crippled teaser.
 *
 * Pricing is the coffee-cup tier. AI is cheap; the goal is to keep
 * the lights on while the user lands the gig. No upsell pressure,
 * no dark patterns.
 */
const FREE_FEATURES = [
  'Unlimited resumes',
  '20 AI chat messages a day',
  'All starter templates',
  'PDF export'
];

const PRO_FEATURES = [
  'Everything in Free, plus:',
  'Unlimited AI chat (3am cram sessions included)',
  'Inline AI rewrites — click any weak bullet, get 3 fixes',
  'Peer reviews (your friends roast your resume; you pick the keepers)',
  'Real-time collaboration (study-group energy, but for jobs)',
  'Priority email support — a human reads these, mostly'
];

export default async function PricingPage() {
  const sub = await getSubscription();
  // `isProEffective` is the canonical "is this user Pro right now?"
  // predicate (lib/billing/types.ts). Use it instead of `sub.plan === 'pro'`
  // so a canceled-Pro / past_due / unpaid user sees Free as their current
  // plan — matching what `requirePro()` enforces server-side.
  const isPro = isProEffective(sub);

  // Pull the live Pro price from Stripe so the display auto-tracks
  // whatever the founder configures in the Dashboard. If Stripe is
  // unconfigured (no `STRIPE_PRICE_ID_PRO` env var), fall back to a
  // safe placeholder so the page still renders.
  let proPrice: Plan['price'] = null;
  if (PRICE_IDS.pro) {
    try {
      const prices = await getStripePrices();
      const proStripePrice = prices.find((p) => p.id === PRICE_IDS.pro);
      if (proStripePrice?.unitAmount != null && proStripePrice.currency) {
        proPrice = {
          unitAmount: proStripePrice.unitAmount,
          currency: proStripePrice.currency
        };
      }
    } catch {
      // Stripe unreachable in dev — fall through with the placeholder.
    }
  }

  const PLANS: Plan[] = [
    {
      id: 'free',
      name: 'Free',
      price: null,
      interval: null,
      priceNote: null,
      features: FREE_FEATURES,
      priceId: null,
      cta: 'Already on it'
    },
    {
      id: 'pro',
      name: 'Pro',
      price: proPrice,
      interval: proPrice ? 'month' : null,
      priceNote: proPrice
        ? 'less than your morning coffee, more useful than a LinkedIn coach'
        : null,
      features: PRO_FEATURES,
      priceId: PRICE_IDS.pro,
      cta: 'Start 7-day free trial',
      highlight: true
    }
  ];

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Pricing for broke-but-brave job-seekers
        </h1>
        <p className="text-gray-600 max-w-xl mx-auto">
          Free is genuinely useful. Pro is the price of a coffee — keeps
          the AI awake and the lights on while you land the gig.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {PLANS.map((plan) => {
          // Symmetric to the server gate: the Pro card is "current"
          // iff the user is Pro-effective; the Free card is "current"
          // iff the user is not. A canceled-Pro user therefore sees
          // Free as their current plan, not Pro.
          const isCurrent = plan.id === 'pro' ? isPro : !isPro;
          return (
            <Card
              key={plan.id}
              className={
                plan.highlight
                  ? 'border-primary border-2 shadow-lg relative'
                  : ''
              }
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}
              <CardContent className="pt-8 pb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  {plan.name}
                </h2>
                <div className="mb-2">
                  {plan.price === null ? (
                    <span className="text-4xl font-bold text-gray-900">
                      Free
                    </span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-gray-900">
                        {formatPrice(plan.price.unitAmount, plan.price.currency)}
                      </span>
                      <span className="text-base text-gray-600 ml-1">
                        /{plan.interval}
                      </span>
                    </>
                  )}
                </div>
                {plan.priceNote && (
                  <p className="text-xs text-gray-500 mb-6 italic">
                    {plan.priceNote}
                  </p>
                )}
                {!plan.priceNote && plan.price === null && <div className="mb-6" />}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
                {isCurrent || plan.priceId === null ? (
                  <button
                    disabled
                    className="w-full py-2 px-4 rounded-full text-sm font-medium bg-gray-100 text-gray-500 cursor-not-allowed"
                  >
                    {isCurrent ? '✓ Your current plan' : plan.cta}
                  </button>
                ) : (
                  <CheckoutButton priceId={plan.priceId} label={plan.cta} />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-sm text-gray-500 mt-12 max-w-md mx-auto">
        Built by a job-seeker, for job-seekers. If the price is the
        reason you didn&apos;t upgrade, <a href="mailto:hi@nextep.app" className="underline">tell me</a> — there&apos;s a more-honest answer.
      </p>
    </main>
  );
}

/**
 * Format a Stripe `unit_amount` + `currency` into a display string.
 *
 * Stripe convention: amounts are in the smallest currency unit
 * (cents for USD/CAD, yen for JPY, etc.). `Intl.NumberFormat` handles
 * the scaling automatically when we pass the major-unit value, so
 * we divide by 10^currencyFractionDigits. For our supported tiers
 * (USD, CAD, EUR), that's /100.
 */
function formatPrice(unitAmount: number, currency: string): string {
  // USD/CAD/EUR/GBP/AUD all use 2 fraction digits. JPY/KRW use 0.
  // Stripe's `currency` is always lowercase ISO 4217.
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      // No decimals for "the price of a coffee" — round to whole units.
      maximumFractionDigits: 0
    }).format(unitAmount / 100);
  } catch {
    // Unknown currency code (Stripe test mode can have funky ones).
    return `${currency.toUpperCase()} ${(unitAmount / 100).toFixed(0)}`;
  }
}
