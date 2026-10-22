import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { EligibilityList } from '@/components/scorecard/eligibility-list';
import type { EligibilityNote } from '@/lib/scoring/qualifications';

/**
 * Locks the eligibility-requirement block in the scorecard.
 *
 * It is deliberately NOT part of the skill-gap miss list: a degree you
 * are three months from finishing is not a skill gap, and "add a degree
 * to your resume" is not advice.
 */

const IN_PROGRESS: EligibilityNote = {
  requirement: {
    text: "Bachelor's degree in Computer Science or equivalent practical experience",
    kind: 'degree',
    requiredDegreeLevel: 'bachelor',
    acceptsAlternative: true
  },
  status: 'in-progress',
  message:
    'Your resume lists this qualification as completing in June 2027 — you will hold it by then.',
  completesOn: 'June 2027'
};

describe('<EligibilityList>', () => {
  it('renders nothing when there are no eligibility requirements', () => {
    const html = renderToStaticMarkup(<EligibilityList notes={[]} />);
    expect(html).toBe('');
  });

  it('renders nothing when the notes are undefined', () => {
    // Score snapshots persisted before this field existed have none.
    const html = renderToStaticMarkup(<EligibilityList notes={undefined} />);
    expect(html).toBe('');
  });

  it('shows the requirement and its status', () => {
    const html = renderToStaticMarkup(
      <EligibilityList notes={[IN_PROGRESS]} />
    );
    expect(html).toContain('data-testid="eligibility-list"');
    expect(html).toContain('Eligibility requirements');
    expect(html).toContain(
      "Bachelor&#x27;s degree in Computer Science or equivalent practical experience"
    );
    expect(html).toContain('In progress');
    expect(html).toContain('completes June 2027');
  });

  it('tells the user these are not skill gaps', () => {
    const html = renderToStaticMarkup(
      <EligibilityList notes={[IN_PROGRESS]} />
    );
    expect(html).toContain('These are not skill gaps');
    expect(html).toContain('Nothing here needs to be added to your resume');
  });

  it('labels a not-listed requirement honestly', () => {
    const html = renderToStaticMarkup(
      <EligibilityList
        notes={[
          {
            requirement: {
              text: "Bachelor's degree",
              kind: 'degree',
              requiredDegreeLevel: 'bachelor',
              acceptsAlternative: false
            },
            status: 'not-listed',
            message:
              'This role asks for a degree your resume does not list. It is not something you can fix by rewording — check whether it is a hard requirement before applying.'
          }
        ]}
      />
    );
    expect(html).toContain('Not on your resume');
  });

  it('labels the alternative route', () => {
    const html = renderToStaticMarkup(
      <EligibilityList
        notes={[
          {
            requirement: {
              text: "Bachelor's degree or equivalent practical experience",
              kind: 'degree',
              requiredDegreeLevel: 'bachelor',
              acceptsAlternative: true
            },
            status: 'alternative-accepted',
            message: 'The job description allows another route.'
          }
        ]}
      />
    );
    expect(html).toContain('Alternative accepted');
  });
});
