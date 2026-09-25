import { Check } from 'lucide-react';

/**
 * HowItWorks — the 3-step process on the landing page.
 */
export function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Drop in your background once',
      description:
        'Import your existing resume or fill in the structured form. Nexstepper captures the full picture — work history, projects, skills, education.'
    },
    {
      number: '02',
      title: 'Paste a job description',
      description:
        'From LinkedIn, the company site, anywhere. Nexstepper parses it into structured requirements, must-haves, and seniority. Works on URLs or pasted text.'
    },
    {
      number: '03',
      title: 'Get a tailored variant + score',
      description:
        'A new variant of your master resume, pre-tuned for the role. ATS score tells you how close you are. Edit, export as PDF, apply.'
    }
  ];

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Three steps. Zero filler.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            The full loop from your background to a tailored, scored
            variant — under five minutes.
          </p>
        </div>

        <ol className="mt-16 grid gap-12 lg:grid-cols-3">
          {steps.map((step) => (
            <li key={step.number} className="relative">
              <div className="mb-4 inline-flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-primary">
                  {step.number}
                </span>
                <span className="h-px w-12 bg-gradient-to-r from-primary/60 to-transparent" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
              <Check className="mt-4 size-4 text-primary/40" aria-hidden />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}