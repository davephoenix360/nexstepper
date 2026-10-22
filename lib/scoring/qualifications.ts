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

/** A year and (optionally) a month. Avoids `Date` entirely — see purity. */
interface YearMonth {
  year: number;
  /** 1-12, or 0 when the source only gave a year. */
  month: number;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const MONTH_KEYS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
};

/**
 * Parse a resume date string into a year and month.
 *
 * Handles "2027-06", "06/2027", "June 2027", "Jun 2027", "06 2027" and a
 * bare "2027". Returns null when there is no year in it.
 */
export function parseYearMonth(value: string | null | undefined): YearMonth | null {
  if (!value) return null;
  const text = value.toLowerCase().trim();
  if (text.length === 0) return null;

  // "2027-06" / "2027/06"
  const iso = text.match(/(\d{4})\s*[-/.]\s*(\d{1,2})/);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) {
      return { year: Number(iso[1]), month };
    }
  }

  // "june 2027" / "jun 2027"
  const named = text.match(/([a-z]{3,9})\.?\s+(\d{4})/);
  if (named) {
    const month = MONTH_KEYS[named[1].slice(0, 3)];
    if (month) return { year: Number(named[2]), month };
  }

  // "06 2027"
  const monthFirst = text.match(/(\d{1,2})\s+(\d{4})/);
  if (monthFirst) {
    const month = Number(monthFirst[1]);
    if (month >= 1 && month <= 12) {
      return { year: Number(monthFirst[2]), month };
    }
  }

  // A bare year.
  const year = text.match(/\b(\d{4})\b/);
  if (year) return { year: Number(year[1]), month: 0 };

  return null;
}

/** Format a parsed date for display — "June 2027" or "2027". */
export function formatYearMonth(ym: YearMonth): string {
  if (ym.month === 0) return String(ym.year);
  return `${MONTH_NAMES[ym.month - 1]} ${ym.year}`;
}

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
 * Resolve one eligibility requirement against a resume.
 *
 * `now` is injected so the scoring engine stays free of a clock. When it
 * is null the date comparison cannot run and the status degrades to
 * `unknown` rather than guessing.
 */
export function evaluateEligibility(
  requirement: EligibilityRequirement,
  education: EducationLike[],
  hasWorkHistory: boolean,
  now: Date | null
): EligibilityNote {
  if (requirement.kind === 'degree') {
    return evaluateDegree(requirement, education, hasWorkHistory, now);
  }

  // Certification and authorisation are not things the resume's dates can
  // settle — the candidate either lists them or does not.
  const listed = education.length > 0;
  if (requirement.kind === 'certification') {
    return {
      requirement,
      status: 'not-listed',
      message:
        'This role asks for a certification or licence. Your resume does not list one — ' +
        'check whether you hold it, and add it if you do.'
    };
  }

  return {
    requirement,
    status: 'not-listed',
    message:
      'This role has a work-authorisation or clearance requirement. It is not a skill ' +
      'you can add to your resume — worth checking early if it applies to you.',
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
 */
export function evaluateEligibilityNotes(
  requirements: EligibilityRequirement[],
  education: EducationLike[],
  hasWorkHistory: boolean,
  now: Date | null
): EligibilityNote[] {
  return requirements.map((requirement) =>
    evaluateEligibility(requirement, education, hasWorkHistory, now)
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
