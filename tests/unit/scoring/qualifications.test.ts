/**
 * Tests for the eligibility-requirement module.
 *
 * The bug this fixes: a JD's "Bachelor's degree" requirement was scored
 * as a missing skill, so a candidate finishing their degree was told to
 * add "bachelor" to their resume.
 *
 * These tests pin the DETECTION (what is and is not an eligibility
 * gate) and the EVALUATION (what the resume says about it).
 */
import { describe, expect, it } from 'vitest';

import {
  degreeSatisfies,
  detectDegreeLevel,
  detectQualification,
  eligibilityVocabulary,
  evaluateEligibility,
  findMatchingCertificate,
  formatYearMonth,
  parseYearMonth,
  partitionRequirements,
  toCertificateLike,
  toEducationLike,
  type EligibilityRequirement
} from '@/lib/scoring/qualifications';

const NOW = new Date('2026-10-22T12:00:00Z');

describe('detectQualification — what counts as an eligibility gate', () => {
  it('detects the degree requirement that started this', () => {
    const gate = detectQualification(
      "Bachelor's degree in Computer Science or equivalent practical experience"
    );
    expect(gate).not.toBeNull();
    expect(gate!.kind).toBe('degree');
    expect(gate!.requiredDegreeLevel).toBe('bachelor');
    expect(gate!.acceptsAlternative).toBe(true);
    expect(gate!.text).toContain('Bachelor');
  });

  it('detects a bare degree requirement with no level', () => {
    const gate = detectQualification('A degree in a relevant discipline');
    expect(gate!.kind).toBe('degree');
    expect(gate!.requiredDegreeLevel).toBeNull();
    expect(gate!.acceptsAlternative).toBe(false);
  });

  it('detects a certification only when the JD phrases it as a gate', () => {
    expect(detectQualification('Must be certified in AWS')!.kind).toBe(
      'certification'
    );
    // A credential that doubles as a technology name is a SKILL — the
    // candidate can list it on their resume, so it is not a gate.
    expect(detectQualification('AWS Certified Solutions Architect')).toBeNull();
  });

  it('detects work authorisation and clearance', () => {
    expect(
      detectQualification('Must be authorized to work in the US')!.kind
    ).toBe('authorisation');
    expect(detectQualification('Requires an active security clearance')!.kind).toBe(
      'authorisation'
    );
  });

  it('leaves ordinary skills alone', () => {
    for (const skill of [
      'TypeScript',
      'PostgreSQL',
      'Kubernetes',
      'AWS Certified Solutions Architect',
      'Master Data Management',
      'Node.js',
      'CI/CD pipelines'
    ]) {
      expect(detectQualification(skill), skill).toBeNull();
    }
  });

  it('does not treat a technology with "master" in the name as a degree', () => {
    // "Master Data Management" is a technology; only "master" + degree
    // context counts.
    expect(detectQualification('Master Data Management')).toBeNull();
    expect(detectQualification("Master's degree in Computer Science")!.kind).toBe(
      'degree'
    );
  });

  it('handles empty and non-string input', () => {
    expect(detectQualification('')).toBeNull();
    expect(detectQualification('   ')).toBeNull();
  });
});

describe('detectDegreeLevel', () => {
  it('reads the level from the requirement', () => {
    expect(detectDegreeLevel('Bachelor of Science')).toBe('bachelor');
    expect(detectDegreeLevel('BSc in Computer Science')).toBe('bachelor');
    expect(detectDegreeLevel("Master's degree")).toBe('master');
    expect(detectDegreeLevel('MBA')).toBe('master');
    expect(detectDegreeLevel('PhD')).toBe('doctorate');
    expect(detectDegreeLevel('Doctorate')).toBe('doctorate');
    expect(detectDegreeLevel('Associate degree')).toBe('associate');
  });

  it('returns null when no level is named', () => {
    expect(detectDegreeLevel('A degree in a relevant discipline')).toBeNull();
  });
});

describe('partitionRequirements', () => {
  it('separates skills from gates without dropping either', () => {
    const { skills, gates } = partitionRequirements([
      'TypeScript',
      "Bachelor's degree in Computer Science",
      'PostgreSQL',
      'Must be authorized to work in the US'
    ]);
    expect(skills).toEqual(['TypeScript', 'PostgreSQL']);
    expect(gates).toHaveLength(2);
    expect(gates.map((g) => g.kind)).toEqual(['degree', 'authorisation']);
  });

  it('keeps the JD wording on the gate', () => {
    const { gates } = partitionRequirements([
      "Bachelor's degree in Computer Science or equivalent practical experience"
    ]);
    expect(gates[0].text).toContain('equivalent practical experience');
  });
});

describe('parseYearMonth', () => {
  it('reads the formats resumes actually use', () => {
    expect(parseYearMonth('2027-06')).toEqual({ year: 2027, month: 6 });
    expect(parseYearMonth('2027/06')).toEqual({ year: 2027, month: 6 });
    expect(parseYearMonth('June 2027')).toEqual({ year: 2027, month: 6 });
    expect(parseYearMonth('Jun 2027')).toEqual({ year: 2027, month: 6 });
    expect(parseYearMonth('06 2027')).toEqual({ year: 2027, month: 6 });
    expect(parseYearMonth('2027')).toEqual({ year: 2027, month: 0 });
  });

  it('returns null when there is no year', () => {
    expect(parseYearMonth('')).toBeNull();
    expect(parseYearMonth('present')).toBeNull();
    expect(parseYearMonth(null)).toBeNull();
  });

  it('formats for display', () => {
    expect(formatYearMonth({ year: 2027, month: 6 })).toBe('June 2027');
    expect(formatYearMonth({ year: 2027, month: 0 })).toBe('2027');
  });
});

describe('degreeSatisfies', () => {
  it('lets a higher degree satisfy a lower requirement', () => {
    expect(degreeSatisfies('master', 'bachelor')).toBe(true);
    expect(degreeSatisfies('doctorate', 'master')).toBe(true);
    expect(degreeSatisfies('bachelor', 'master')).toBe(false);
    expect(degreeSatisfies('associate', 'bachelor')).toBe(false);
  });

  it('accepts any degree when no level is required', () => {
    expect(degreeSatisfies('bachelor', null)).toBe(true);
    expect(degreeSatisfies(null, null)).toBe(false);
  });
});

describe('evaluateEligibility — the candidate in school', () => {  const requirement: EligibilityRequirement = {
    text: "Bachelor's degree in Computer Science or equivalent practical experience",
    kind: 'degree',
    requiredDegreeLevel: 'bachelor',
    acceptsAlternative: true
  };

  it('says the degree is in progress and when it completes', () => {
    const note = evaluateEligibility(
      requirement,
      [{ degree: { degreeLevel: 'Bachelor' }, startDate: '2023-09', endDate: '2027-06' }],
      true,
      NOW
    );
    expect(note.status).toBe('in-progress');
    expect(note.completesOn).toBe('June 2027');
    expect(note.message).toContain('you will hold it by then');
  });

  it('treats a degree with no end date as complete', () => {
    const note = evaluateEligibility(
      requirement,
      [{ degree: { degreeLevel: 'Bachelor' }, startDate: '2019-09', endDate: '2023-06' }],
      true,
      NOW
    );
    expect(note.status).toBe('met');
  });

  it('treats a past end date as complete', () => {
    const note = evaluateEligibility(
      requirement,
      [{ degree: { degreeLevel: 'Bachelor' }, endDate: '2023-06' }],
      true,
      NOW
    );
    expect(note.status).toBe('met');
  });

  it('does not guess a status without a reference date', () => {
    const note = evaluateEligibility(
      requirement,
      [{ degree: { degreeLevel: 'Bachelor' }, endDate: '2027-06' }],
      true,
      null
    );
    expect(note.status).toBe('unknown');
  });

  it('points at the alternative route when the degree is not listed', () => {
    const note = evaluateEligibility(requirement, [], true, NOW);
    expect(note.status).toBe('alternative-accepted');
    expect(note.message).toContain('equivalent practical experience');
  });

  it('flags it plainly when there is no alternative route', () => {
    const strict: EligibilityRequirement = {
      ...requirement,
      acceptsAlternative: false
    };
    const note = evaluateEligibility(strict, [], true, NOW);
    expect(note.status).toBe('not-listed');
    expect(note.message).toContain('not something you can fix by rewording');
  });

  it('counts a master as satisfying a bachelor requirement', () => {
    const note = evaluateEligibility(
      requirement,
      [{ degree: { degreeLevel: 'Master of Science' }, endDate: '2025-06' }],
      true,
      NOW
    );
    expect(note.status).toBe('met');
  });
});

describe('eligibilityVocabulary', () => {
  it('is empty when the JD states no eligibility requirement', () => {
    expect(eligibilityVocabulary([]).size).toBe(0);
  });

  it('excludes degree vocabulary when a degree gate exists', () => {
    const vocab = eligibilityVocabulary([
      {
        text: "Bachelor's degree",
        kind: 'degree',
        requiredDegreeLevel: 'bachelor',
        acceptsAlternative: false
      }
    ]);
    expect(vocab.has('degree')).toBe(true);
    expect(vocab.has('bachelor')).toBe(true);
  });

  it('only excludes "master" when a master-level gate exists', () => {
    const master = eligibilityVocabulary([
      {
        text: "Master's degree",
        kind: 'degree',
        requiredDegreeLevel: 'master',
        acceptsAlternative: false
      }
    ]);
    expect(master.has('master')).toBe(true);

    const bachelor = eligibilityVocabulary([
      {
        text: "Bachelor's degree",
        kind: 'degree',
        requiredDegreeLevel: 'bachelor',
        acceptsAlternative: false
      }
    ]);
    expect(bachelor.has('master')).toBe(false);
  });

  it('does not exclude "certificate" or "license" — they have technical uses', () => {
    const vocab = eligibilityVocabulary([
      {
        text: 'Must be certified',
        kind: 'certification',
        requiredDegreeLevel: null,
        acceptsAlternative: false
      }
    ]);
    expect(vocab.has('certificate')).toBe(false);
    expect(vocab.has('license')).toBe(false);
  });
});

describe('toEducationLike', () => {
  it('parses the unknown education shape defensively', () => {
    const parsed = toEducationLike([
      { degree: { degreeLevel: 'Bachelor' }, startDate: '2023-09', endDate: '2027-06' },
      null,
      'nonsense',
      { degree: null }
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].degree?.degreeLevel).toBe('Bachelor');
    expect(parsed[1].degree).toBeNull();
  });

  it('returns an empty list for a non-array', () => {
    expect(toEducationLike(undefined)).toEqual([]);
    expect(toEducationLike({})).toEqual([]);
  });
});

/**
 * The certification branch.
 *
 * ## The bug this pins
 *
 * The branch used to return a hardcoded "your resume does not list one" —
 * `sections.certificates` was never consulted. A candidate holding the
 * exact certification the JD asks for was told to go and list it. The
 * message was a falsehood shown to a user.
 */
describe('evaluateEligibility — the certification branch', () => {
  const requirement: EligibilityRequirement = {
    text: 'Must be certified in AWS',
    kind: 'certification',
    requiredDegreeLevel: null,
    acceptsAlternative: false
  };

  it('says the resume lists it when the candidate holds it', () => {
    const note = evaluateEligibility(requirement, [], true, NOW, [
      { name: 'AWS Solutions Architect Associate', issuer: 'Amazon Web Services' }
    ]);
    expect(note.status).toBe('met');
    expect(note.message).toContain('lists a matching certification');
    expect(note.message).toContain('AWS Solutions Architect Associate');
  });

  it('never claims the resume lacks one when it does list it', () => {
    const note = evaluateEligibility(requirement, [], true, NOW, [
      { name: 'AWS Solutions Architect Associate', issuer: 'Amazon Web Services' }
    ]);
    expect(note.message).not.toContain('does not list one');
  });

  it('still says "does not list one" when the resume genuinely lists none', () => {
    const note = evaluateEligibility(requirement, [], true, NOW, []);
    expect(note.status).toBe('not-listed');
    expect(note.message).toContain('does not list one');
  });

  it('distinguishes "lists some, but not this one" from "lists none"', () => {
    const note = evaluateEligibility(requirement, [], true, NOW, [
      { name: 'Google Cloud Professional Architect', issuer: 'Google' }
    ]);
    expect(note.status).toBe('not-listed');
    expect(note.message).toContain('none of them is the one this role asks for');
  });

  it('matches on whole words, not substrings', () => {
    // "AWS" must not match "lawsuit".
    const note = evaluateEligibility(
      { ...requirement, text: 'Must be certified in AWS' },
      [],
      true,
      NOW,
      [{ name: 'Certified Public Accountant', issuer: 'Local Law Society' }]
    );
    expect(note.status).toBe('not-listed');
  });

  it('matches a multi-word credential on any of its subject tokens', () => {
    const note = evaluateEligibility(
      { ...requirement, text: 'Must hold an active PMP certification' },
      [],
      true,
      NOW,
      [{ name: 'PMP — Project Management Professional', issuer: 'PMI' }]
    );
    expect(note.status).toBe('met');
  });
});

describe('findMatchingCertificate', () => {
  const requirement: EligibilityRequirement = {
    text: 'Must be certified in AWS',
    kind: 'certification',
    requiredDegreeLevel: null,
    acceptsAlternative: false
  };

  it('returns the matching certificate', () => {
    const cert = { name: 'AWS Certified Solutions Architect', issuer: 'Amazon' };
    expect(findMatchingCertificate(requirement, [cert])).toBe(cert);
  });

  it('returns null when nothing matches', () => {
    expect(findMatchingCertificate(requirement, [{ name: 'Terraform Associate' }])).toBeNull();
  });

  it('ignores an empty certificate entry', () => {
    expect(findMatchingCertificate(requirement, [{ name: '', issuer: '' }])).toBeNull();
  });
});

describe('toCertificateLike', () => {
  it('parses the unknown certificate shape defensively', () => {
    const parsed = toCertificateLike([
      { name: 'AWS Solutions Architect Associate', issuer: 'Amazon Web Services' },
      null,
      'nonsense'
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('AWS Solutions Architect Associate');
    expect(parsed[0].issuer).toBe('Amazon Web Services');
  });

  it('returns an empty list for a non-array', () => {
    expect(toCertificateLike(undefined)).toEqual([]);
    expect(toCertificateLike({})).toEqual([]);
  });
});
