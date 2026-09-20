import { BillingCard } from './_components/billing-card';
import { ProfileForm } from './_components/profile-form';

/**
 * Account settings page — Server Component. Renders the existing
 * Profile form (Client Component, extracted for SSR boundaries) plus
 * the new Billing card (also Server-rendered). The Billing card
 * fetches `getSubscription()` directly so the page is a single
 * server round-trip with no client-side fetch.
 */
export default function GeneralPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mb-6">
        Account
      </h1>

      <div className="space-y-6">
        <BillingCard />
        <ProfileForm />
      </div>
    </section>
  );
}
