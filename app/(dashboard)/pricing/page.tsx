import { CheckoutButton } from './submit-button';
import { Card, CardContent } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { PRICE_IDS } from '@/lib/payments/stripe';
import { getSubscription } from '@/lib/db/queries';

// Render at request time so the build doesn't depend on a live Stripe API key.
// Phase 0: this lets Vercel deploys succeed without configuring Stripe yet.
// Re-enable ISR (`export const revalidate = 3600`) once real Stripe prices are wired.
export const dynamic = 'force-dynamic';

type Plan = {
  id: 'free' | 'pro';
  name: string;
  price: number | null;
  interval: 'month' | null;
  features: string[];
  priceId: string | null;
  cta: string;
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: null,
    features: [
      'Unlimited resumes',
      '20 AI chat messages per day',
      'All starter templates',
      'PDF export'
    ],
    priceId: null,
    cta: 'Current plan'
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 1200,
    interval: 'month',
    features: [
      'Everything in Free, and:',
      'Unlimited AI chat',
      'AI Optimize tool (per-section rewrites)',
      'Peer reviews',
      'Real-time collaboration',
      'Priority email support'
    ],
    priceId: PRICE_IDS.pro,
    cta: 'Start 7-day free trial',
    highlight: true
  }
];

export default async function PricingPage() {
  const sub = await getSubscription();
  const currentPlan = sub.plan;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Simple pricing for job-seekers
        </h1>
        <p className="text-gray-600 max-w-xl mx-auto">
          Start free. Upgrade when you need unlimited AI help and collaboration.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          return (
            <Card
              key={plan.id}
              className={
                plan.highlight
                  ? 'border-orange-500 border-2 shadow-lg relative'
                  : ''
              }
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}
              <CardContent className="pt-8 pb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  {plan.name}
                </h2>
                <div className="mb-6">
                  {plan.price === null || plan.price === 0 ? (
                    <span className="text-4xl font-bold text-gray-900">
                      Free
                    </span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-gray-900">
                        ${(plan.price / 100).toFixed(0)}
                      </span>
                      <span className="text-base text-gray-600 ml-1">
                        /{plan.interval}
                      </span>
                    </>
                  )}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
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
    </main>
  );
}