/**
 * Eligibility requirements — degrees, certifications, work authorisation.
 *
 * ## The bug this module exists to fix
 *
 * A JD asked for a bachelor's degree. The intent extractor put it in
 * `mustHaveSkills`, because the extractor's own prompt lists "Qualifications"
 * as a must-have section header and the intent schema has nowhere else to
 * put a requirement that is not a skill.
 *
 * The scorer then treated it as a missing skill: an 8-point Intent Coverage
 * penalty, and a tip telling the user to add "bachelor", "degree", "computer",
 * "science" to their resume. For a candidate three months from graduating,
 * that is both wrong and unactionable.
 *
 * ## Why the fix is deterministic
 *
 * `EducationEntry` already carries `degreeLevel`, `startDate` and `endDate`.
 * So "will this candidate hold the required degree by the time the role
 * starts?" is arithmetic over the resume's own fields — not a probability.
 * A fact beats a guess: the assistant can say "your BSc completes in June
 * 2027" because the resume says so.
 *
 * ## Why the detection is text-based
 *
 * The detection runs at SCORING time, over the requirement text the
 * extractor produced. That means it works on every JD already stored —
 * no backfill, no re-extraction, no migration. The extractor still puts
 * qualifications in `mustHaveSkills`; we take them back out here and
 * report them separately.
 *
 * When the intent schema later grows a `qualifications` field (the Jev
 * work), this module stays as the fallback for rows that predate it.
 *
 * ## Purity
 *
 * Pure, sync, no IO, no clock of its own. The reference date is injected,
 * because `lib/scoring/` forbids `new Date()` and `Date.now()` — see
 * `tests/unit/scoring/purity.test.ts`.
 */

/** What kind of eligibility gate a requirement is. */
export type QualificationKind = 'degree' | 'certification' | 'authorisation';

/** Degree levels, ordered so a higher level satisfies a lower one. */
export type DegreeLevel = 'associate' | 'bachelor' | 'master' | 'doctorate';

const DEGREE_ORDER: Record<DegreeLevel, number> = {
  associate: 1,
  bachelor: 2,
  master: 3,
  doctorate: 4
};

/** A requirement the candidate must already satisfy to be considered. */
export interface EligibilityRequirement {
  /** The JD's own wording — shown to the user verbatim. */
  text: string;
  kind: QualificationKind;
  /** The degree level named, when the requirement names one. */
  requiredDegreeLevel: DegreeLevel | null;
  /**
   * The JD offers another route — "or equivalent practical experience".
   * When true, a missing degree is a conversation, not a rejection.
   */
  acceptsAlternative: boolean;
}

/** How the resume stands against an eligibility requirement. */
export type EligibilityStatus =
  /** The resume lists a matching qualification and it is complete. */
  | 'met'
  /** The resume lists it, finishing on a future date. */
  | 'in-progress'
  /** No matching qualification, but the JD accepts another route. */
  | 'alternative-accepted'
  /** No matching qualification and no alternative offered. */
  | 'not-listed'
  /** Not enough information to decide (e.g. no reference date available). */
  | 'unknown';

/** One eligibility requirement, resolved against a resume. */
export interface EligibilityNote {
  requirement: EligibilityRequirement;
  status: EligibilityStatus;
  /** One factual sentence. No advice, no judgement. */
  message: string;
  /** When the qualification completes, when the resume says so. */
  completesOn?: string;
}

/** The parts of an education entry this module needs. */
export interface EducationLike {
  degree?: { degreeLevel?: string } | null;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * The parts of a certificate entry this module needs.
 *
 * ## Why this type exists
 *
 * The certification branch of `evaluateEligibility` used to be a hardcoded
 * "your resume does not list one" — the resume's `sections.certificates`
 * was never consulted. A candidate holding the exact certification the JD
 * asks for was told to go and list it. The message was a falsehood, and a
 * falsehood shown to a user is worse than no message at all.
 */
export interface CertificateLike {
  name?: string;
  issuer?: string;
}

/* ------------------------------------------------------------------ */
/* Detection                                                          */
/* ------------------------------------------------------------------ */

/**
 * The degree level a requirement names, or null.
 *
 * Deliberately conservative. "Master" alone is ambiguous — "Master Data
 * Management" is a technology, not a degree — so it only counts when the
 * requirement also says "degree" (or names the MSc/MBA abbreviation).
 * "Bachelor" is unambiguous on its own.
 */
export function detectDegreeLevel(text: string): DegreeLevel | null {
  const t = text.toLowerCase();

  if (/\b(ph\.?\s?d|doctorate|doctoral)\b/.test(t)) return 'doctorate';
  if (/\bmba\b/.test(t)) return 'master';
  // "master" alone is ambiguous ("Master Data Management"), so it only
  // counts with degree context — the word "degree", the abbreviation, or
  // the "Master of <field>" form.
  if (
    /\bmasters?\b/.test(t) &&
    /\bdegrees?\b|\bm\.?s\.?c?\b|\bmasters?\s+of\b/.test(t)
  ) {
    return 'master';
  }
  if (/\bbachelors?\b|\bb\.?\s?s\.?c?\.?\b|\bundergraduate\b/.test(t)) {
    return 'bachelor';
  }
  if (/\bassociate(?:'s)?\b/.test(t) && /\bdegrees?\b|\ba\.?s\.?\b/.test(t)) {
    return 'associate';
  }
  return null;
}

/** Does the JD offer an alternative route to the same requirement? */
function detectAlternative(text: string): boolean {
  return /\bor equivalent\b|\bequivalent (?:practical |relevant |professional )?experience\b|\bor an equivalent\b|\bequivalency\b/.test(
    text.toLowerCase()
  );
}

/**
 * Is this requirement an eligibility gate rather than a skill?
 *
 * Returns null for anything that is a skill — including credentials that
 * double as technology names ("AWS Certified Solutions Architect"), which
 * are actionable on a resume and are NOT treated as gates.
 */
export function detectQualification(
  text: string
): EligibilityRequirement | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const t = trimmed.toLowerCase();
  const acceptsAlternative = detectAlternative(t);

  // 1. A degree. Unambiguous when it names a level or says "degree".
  const level = detectDegreeLevel(t);
  if (level !== null || /\bdegrees?\b|\bdiploma\b/.test(t)) {
    return {
      text: trimmed,
      kind: 'degree',
      requiredDegreeLevel: level,
      acceptsAlternative
    };
  }

  // 2. A certification or licence, but only when the JD phrases it as a
  //    gate. "Certified Kubernetes Administrator" names a technology and
  //    stays a skill; "must be certified in AWS" is a gate.
  if (
    /\b(certif\w*|licen[cs]\w*|accredit\w*)\b/.test(t) &&
    /\b(must|required|requirement|need|needs|hold|possess|active|have)\b/.test(t)
  ) {
    return {
      text: trimmed,
      kind: 'certification',
      requiredDegreeLevel: null,
      acceptsAlternative
    };
  }

  // 3. Work authorisation, clearance, residency, citizenship.
  if (
    /\b(work authori[sz]ation|authori[sz]ed to work|legally (?:authori[sz]ed|entitled)|right to work|security clearance|clearance level|visa sponsorship|residency (?:status|requirement)|citizenship (?:status|requirement)|must be a (?:us |canadian |uk |australian )?citizen)\b/.test(
      t
    )
  ) {
    return {
      text: trimmed,
      kind: 'authorisation',
      requiredDegreeLevel: null,
      acceptsAlternative
    };
  }

  return null;
}

/**
 * Split a list of JD requirement entries into the ones that are skills and
 * the ones that are eligibility gates.
 *
 * `gates` are surfaced to the user as notes. `skills` are scored as
 * before. Nothing is dropped: a gate still appears in the product, just
 * as a different kind of thing.
 */
export function partitionRequirements(entries: string[]): {
  skills: string[];
  gates: EligibilityRequirement[];
} {
  const skills: string[] = [];
  const gates: EligibilityRequirement[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'string' || entry.trim().length === 0) continue;
    const gate = detectQualification(entry);
    if (gate) gates.push(gate);
    else skills.push(entry);
  }
  return { skills, gates };
}

/**
 * The words that belong to an eligibility requirement rather than to a
 * skill.
 *
 * Deliberately narrow. `certificate` and `license` are NOT here because
 * they have real technical uses — "SSL certificate", "Apache License" —
 * that candidates legitimately list on a resume. `master` is added
 * separately and only when a master's-level degree gate was detected,
 * because "Master Data Management" is a technology, not a degree.
 *
 * These words are excluded from the JD's keyword vocabulary so that a
 * candidate is not marked down for not being able to add "bachelor's
 * degree" to their resume.
 */
const ELIGIBILITY_VOCABULARY: ReadonlySet<string> = new Set([
  'bachelor',
  'bachelors',
  'degree',
  'degrees',
  'mba',
  'phd',
  'doctorate',
  'doctoral',
  'diploma',
  'certification',
  'certifications',
  'certified',
  'clearance',
  'eligibility',
  'eligible',
  'transcript',
  'gpa',
  'equivalency'
]);

/**
 * The token vocabulary to exclude from a JD's keyword set, given the
 * eligibility requirements it states.
 *
 * Returns an empty set when there are no gates — a JD that states no
 * eligibility requirement keeps exactly the vocabulary it had.
 */
export function eligibilityVocabulary(
  gates: EligibilityRequirement[]
): ReadonlySet<string> {
  if (gates.length === 0) return new Set<string>();
  const out = new Set(ELIGIBILITY_VOCABULARY);
  for (const gate of gates) {
    if (gate.kind !== 'degree') continue;
    switch (gate.requiredDegreeLevel) {
      case 'master':
        out.add('master');
        out.add('masters');
        break;
      case 'associate':
        out.add('associate');
        break;
      default:
        break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                         */
/* ------------------------------------------------------------------ */

/**
 * The date parser lives in `lib/scoring/date-parse.ts` — it is shared
 * with the Seniority Fit dimension, which used to carry its own
 * ISO-only copy and therefore measured nothing for any resume whose
 * dates were typed the way people actually type them.
 *
 * Re-exported here because this module is where it historically lived
 * and `parseYearMonth` is part of its public surface.
 */
export {
  parseYearMonth,
  parseYearMonthForTenure,
  formatYearMonth,
  MONTH_NAMES,
  type YearMonth
} from './date-parse';

import {
  parseYearMonth,
  formatYearMonth,
  type YearMonth
} from './date-parse';

/** Is the given month/year in the past relative to `now`? */
function isPast(ym: YearMonth, now: Date): boolean {
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  if (ym.year < nowYear) return true;
  if (ym.year > nowYear) return false;
  // Same year, unknown month — assume it has NOT finished yet, which is
  // the conservative reading for an in-progress qualification.
  if (ym.month === 0) return false;
  return ym.month < nowMonth;
}

/** The degree level an education entry names, if any. */
export function educationDegreeLevel(entry: EducationLike): DegreeLevel | null {
  return detectDegreeLevel(entry.degree?.degreeLevel ?? '');
}

/**
 * Does an education entry satisfy a required degree level?
 *
 * A HIGHER level satisfies a LOWER requirement — a master's satisfies a
 * bachelor's requirement. That is how employers read it.
 */
export function degreeSatisfies(
  held: DegreeLevel | null,
  required: DegreeLevel | null
): boolean {
  if (held === null) return false;
  if (required === null) return true; // a degree of some kind was required
  return DEGREE_ORDER[held] >= DEGREE_ORDER[required];
}

/**
 * Words that appear in every "you must hold this credential" requirement
 * and therefore say nothing about WHICH credential is wanted.
 *
 * Without this list, "Must be certified in AWS" reduces to the tokens
 * `must`, `be`, `certified`, `in`, `aws` — and the first four match almost
 * any certificate name (`"Big Zebra Certified"` contains "be" and "in").
 */
const CERTIFICATION_GATE_WORDS: ReadonlySet<string> = new Set([
  'must',
  'shall',
  'should',
  'need',
  'needs',
  'required',
  'requirement',
  'requirements',
  'hold',
  'holds',
  'possess',
  'active',
  'have',
  'has',
  'be',
  'is',
  'are',
  'certified',
  'certification',
  'certifications',
  'certify',
  'license',
  'licence',
  'licensed',
  'accredited',
  'accreditation',
  'valid',
  'current',
  'qualified',
  'a',
  'an',
  'the',
  'in',
  'of',
  'with',
  'and',
  'or',
  'to',
  'for'
]);

/**
 * Does one of the resume's certificates match this requirement?
 *
 * Returns the matching certificate, or null.
 *
 * The requirement is reduced to its **subject** — the tokens that say which
 * credential is wanted ("AWS" in "must be certified in AWS") — and each
 * subject token is matched against the certificate's name and issuer on
 * **word boundaries**.
 *
 * Word boundaries matter: a substring match would let "aws" match
 * "lawsuit", and "pmp" match "pmpl". The subject token is matched
 * whole-word; the haystack is the certificate's own text.
 *
 * Conservative by design. A near miss (the JD wants "Certified Medical
 * License", the resume says "Medical License, MD") reports "not listed"
 * rather than claiming a match it cannot justify.
 */
export function findMatchingCertificate(
  requirement: EligibilityRequirement,
  certificates: CertificateLike[]
): CertificateLike | null {
  const subjects = requirementTokens(requirement.text).filter(
    (token) => !CERTIFICATION_GATE_WORDS.has(token) && token.length >= 2
  );
  if (subjects.length === 0) return null;

  for (const certificate of certificates) {
    const haystack = `${certificate.name ?? ''} ${certificate.issuer ?? ''}`;
    if (haystack.trim().length === 0) continue;
    for (const subject of subjects) {
      if (matchesWholeWord(haystack, subject)) return certificate;
    }
  }
  return null;
}

/** Lowercase word tokens of a piece of text. */
function requirementTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length >= 2);
}

/**
 * Is `token` present in `text` as a whole word?
 *
 * Word boundaries on both sides: "aws" matches "AWS Certified" and
 * "Certified AWS", but not "lawsuit" or "draws".
 */
function matchesWholeWord(text: string, token: string): boolean {
  const pattern = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return pattern.test(text);
}

/**
 * Resolve one eligibility requirement against a resume.
 *
 * `now` is injected so the scoring engine stays free of a clock. When it
 * is null the date comparison cannot run and the status degrades to
 * `unknown` rather than guessing.
 *
 * `certificates` is optional and defaults to empty: a caller that does
 * not have the resume's certificate list still gets an answer, it just
 * cannot confirm a certification.
 */
export function evaluateEligibility(
  requirement: EligibilityRequirement,
  education: EducationLike[],
  hasWorkHistory: boolean,
  now: Date | null,
  certificates: CertificateLike[] = []
): EligibilityNote {
  if (requirement.kind === 'degree') {
    return evaluateDegree(requirement, education, hasWorkHistory, now);
  }

  if (requirement.kind === 'certification') {
    return evaluateCertification(requirement, certificates);
  }

  // Work authorisation and clearance are not things the resume's fields
  // can settle — the schema has no field for it. The message says so
  // rather than pretending the resume was checked.
  return {
    requirement,
    status: 'not-listed',
    message:
      'This role has a work-authorisation or clearance requirement. It is not a skill ' +
      'you can add to your resume — worth checking early if it applies to you.'
  };
}

/**
 * Does the resume list the certification this role asks for?
 *
 * ## The bug this replaced
 *
 * The branch used to be:
 *
 * ```ts
 * const listed = education.length > 0;   // never used
 * if (requirement.kind === 'certification') {
 *   return { status: 'not-listed', message: '...your resume does not list one...' };
 * }
 * ```
 *
 * `sections.certificates` was never read, and the message — "your resume
 * does not list one" — was emitted unconditionally. A candidate holding
 * the exact certification was told to go and list it. The dead `listed`
 * binding was the fossil of the check that was never finished.
 *
 * Now the resume's certificates ARE consulted, and the message is true in
 * every branch: it says "not listed" only when the resume genuinely lists
 * no matching certification.
 */
function evaluateCertification(
  requirement: EligibilityRequirement,
  certificates: CertificateLike[]
): EligibilityNote {
  const match = findMatchingCertificate(requirement, certificates);

  if (match) {
    const name = (match.name ?? '').trim();
    return {
      requirement,
      status: 'met',
      message: name
        ? `Your resume lists a matching certification (${name}).`
        : 'Your resume lists a matching certification.'
    };
  }

  const listed = certificates.filter(
    (certificate) => `${certificate.name ?? ''} ${certificate.issuer ?? ''}`.trim() !== ''
  );

  if (listed.length > 0) {
    return {
      requirement,
      status: 'not-listed',
      message:
        'Your resume lists certifications, but none of them is the one this role asks ' +
        'for. Check whether the requirement covers a different certification.'
    };
  }

  return {
    requirement,
    status: 'not-listed',
    message:
      'This role asks for a certification or licence. Your resume does not list one — ' +
      'check whether you hold it, and add it if you do.'
  };
}

function evaluateDegree(
  requirement: EligibilityRequirement,
  education: EducationLike[],
  hasWorkHistory: boolean,
  now: Date | null
): EligibilityNote {
  const required = requirement.requiredDegreeLevel ?? null;

  const matching = education.filter((entry) =>
    degreeSatisfies(educationDegreeLevel(entry), required)
  );

  if (matching.length === 0) {
    if (requirement.acceptsAlternative) {
      return {
        requirement,
        status: 'alternative-accepted',
        message:
          'This role asks for a degree or equivalent practical experience. Your resume ' +
          'does not list the degree, but the job description allows another route — ' +
          'make sure your work history makes the equivalent obvious.'
      };
    }
    return {
      requirement,
      status: 'not-listed',
      message:
        'This role asks for a degree your resume does not list. It is not something you ' +
        'can fix by rewording — check whether it is a hard requirement before applying.'
    };
  }

  // A matching entry exists. Work out whether it is finished.
  if (now === null) {
    return {
      requirement,
      status: 'unknown',
      message: 'Your resume lists a degree that matches this requirement.'
    };
  }

  // Prefer the entry that is still in progress, if there is one — that is
  // the one the user needs to hear about.
  const pending = matching
    .map((entry) => ({
      entry,
      end: parseYearMonth(entry.endDate),
      start: parseYearMonth(entry.startDate)
    }))
    .filter(({ end, start }) => {
      if (end && !isPast(end, now)) return true;
      if (!end && start && !isPast(start, now)) return true;
      return false;
    });

  if (pending.length > 0) {
    const first = pending[0];
    const completesOn = first.end
      ? formatYearMonth(first.end)
      : first.start
        ? formatYearMonth(first.start)
        : undefined;
    return {
      requirement,
      status: 'in-progress',
      message: completesOn
        ? `Your resume lists this qualification as completing in ${completesOn} — you will hold it by then.`
        : 'Your resume lists this qualification as still in progress.',
      completesOn
    };
  }

  return {
    requirement,
    status: 'met',
    message: 'Your resume lists a degree that matches this requirement.'
  };
}

/**
 * Resolve a set of requirements against a resume.
 *
 * `certificates` is optional — see `evaluateEligibility`.
 */
export function evaluateEligibilityNotes(
  requirements: EligibilityRequirement[],
  education: EducationLike[],
  hasWorkHistory: boolean,
  now: Date | null,
  certificates: CertificateLike[] = []
): EligibilityNote[] {
  return requirements.map((requirement) =>
    evaluateEligibility(requirement, education, hasWorkHistory, now, certificates)
  );
}

/**
 * Narrow an unknown list to the shape this module needs.
 *
 * The scoreable resume shape carries `education` as `unknown[]`, so this
 * parses defensively rather than trusting the input.
 */
export function toEducationLike(value: unknown): EducationLike[] {
  if (!Array.isArray(value)) return [];
  const out: EducationLike[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const degree = record.degree as Record<string, unknown> | undefined;
    out.push({
      degree:
        degree && typeof degree === 'object'
          ? { degreeLevel: typeof degree.degreeLevel === 'string' ? degree.degreeLevel : '' }
          : null,
      startDate: typeof record.startDate === 'string' ? record.startDate : '',
      endDate: typeof record.endDate === 'string' ? record.endDate : ''
    });
  }
  return out;
}

/**
 * Narrow an unknown list of certificate entries to `CertificateLike`.
 *
 * Same defensive posture as `toEducationLike`: the scoreable shape carries
 * `certificates` as `unknown[]`.
 */
export function toCertificateLike(value: unknown): CertificateLike[] {
  if (!Array.isArray(value)) return [];
  const out: CertificateLike[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    out.push({
      name: typeof record.name === 'string' ? record.name : '',
      issuer: typeof record.issuer === 'string' ? record.issuer : ''
    });
  }
  return out;
}
