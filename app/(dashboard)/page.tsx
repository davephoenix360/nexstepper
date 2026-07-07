import {
  Hero,
  FeaturesSection,
  HowItWorks,
  CtaSection,
  MarketingFooter
} from '@/components/marketing';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <FeaturesSection />
      <HowItWorks />
      <CtaSection variant="pricing" />
      <CtaSection variant="final" />
      <MarketingFooter />
    </main>
  );
}