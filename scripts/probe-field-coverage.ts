#!/usr/bin/env node
/**
 * Measure which resume fields actually move the ATS score.
 *
 * ## Why this exists
 *
 * The engine has SEVEN dimensions and a documented field list, but the
 * documentation is not evidence. This script is: it mutates ONE field of
 * one resume at a time, re-scores with the SHIPPED engine, and reports
 * the delta. A field that moves the number is read; a field that does
 * not is ignored — regardless of what a comment claims.
 *
 * ## The method
 *
 * A marker token (`Kafka`) is planted in a single field of a resume, and
 * the same marker is planted in the JD's `requirements` + `mustHaveSkills`.
 * The JD side is identical for every variant, so any delta is caused
 * solely by the resume side.
 *
 *   - If the field is read by the engine, the marker reaches the scored
 *     text, the JD keyword is matched, and the score moves.
 *   - If the field is ignored, the marker never reaches the text, the
 *     keyword stays unmatched, and the score does not move.
 *
 * Two probes:
 *
 *   A. FIELD PROBE — plant the marker in one leaf field.
 *   B. SECTION PROBE — empty one whole section and see what the score
 *      loses. This catches the fields that matter by PRESENCE only
 *      (education, awards, publications) which a text marker would miss.
 *
 * ## Why it is deterministic
 *
 * Uses the SYNC engine (`scoreResumeFromEnvelope`) — pure, no network, no
 * AI Gateway, no embedding model. The async hybrid path feeds the same
 * fields (verified: `lib/scoring-async/score-hybrid.ts` `toTextSource`
 * mirrors `lib/scoring/score.ts` `resumeDataToScoreable`), and Role Fit
 * is measured separately at the end because it needs the embedding model.
 *
 * ## Usage
 *
 *   pnpm probe:field-coverage
 *
 * Writes nothing. Read-only, offline.
 */

import './load-env';

import { gallerySampleResumeData } from '@/lib/resume-schema/sample';
import { composeOverallScore, scoreResumeFromEnvelope } from '@/lib/scoring/score';
import type { ResumeData } from '@/lib/resume-schema/resume-data';
import type { JobPosting } from '@/lib/resume-schema/job-posting';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

/** The planted token. Absent from the baseline resume. */
const MARKER = 'Kafka';

/** Fixed clock so every run is comparable. */
const NOW = new Date('2026-11-16T12:00:00Z');

const DIMENSION_LABELS: Record<string, string> = {
  atsMatching: 'Keywords',
  structure: 'Format',
  contentQuality: 'Impact',
  alignment: 'Experience match',
  intentCoverage: 'Intent',
  roleFit: 'Role fit',
  seniorityFit: 'Seniority'
};

/**
 * The JD. Deliberately includes:
 *   - a title (so Role Fit has something to compare against),
 *   - a marker-bearing requirement (so a read field matches it),
 *   - `yearsRequiredMin` (so Seniority Fit is a measurement, not a
 *     constant 50),
 *   - `mustHaveSkills` (so Intent Coverage is not on its neutral
 *     fallback — without it the dimension is a constant and would
 *     swallow every delta).
 */
const JOB: JobPosting = {
  id: 'probe-job',
  title: 'Senior Backend Engineer',
  company: 'Cartwheel',
  location: 'San Francisco, CA',
  description:
    'We build a streaming data platform for logistics. You will own our event pipeline and the services behind it.',
  requirements: [
    `Hands-on experience with ${MARKER} and distributed event streaming`,
    'Strong TypeScript and React skills for the customer-facing console',
    '5+ years building backend services in production'
  ],
  niceToHaves: ['Experience with Kubernetes and Terraform'],
  benefits: ['Health insurance', 'Remote-friendly'],
  keywords: [],
  seniority: 'senior',
  employmentType: 'Full-time',
  source: 'paste',
  mustHaveSkills: [MARKER, 'TypeScript', 'React'],
  niceToHaveSkills: ['Kubernetes'],
  implicitSkills: [],
  seniorityLevel: 'senior',
  yearsRequiredMin: 5,
  yearsRequiredMax: null,
  roleFamily: 'Backend Engineer',
  domainSignals: [],
  markdown: null,
  markdownGeneratedAt: null
};

type Breakdown = ReturnType<typeof scoreResumeFromEnvelope>;

function baselineResume(): ResumeData {
  return structuredClone(gallerySampleResumeData);
}

function score(resume: ResumeData): Breakdown {
  return scoreResumeFromEnvelope(resume, JOB, NOW);
}

function dimensionDelta(
  before: Breakdown,
  after: Breakdown
): Array<[string, number]> {
  const moved: Array<[string, number]> = [];
  for (const key of Object.keys(DIMENSION_LABELS)) {
    const b = before.dimensionScores[key as keyof typeof before.dimensionScores];
    const a = after.dimensionScores[key as keyof typeof after.dimensionScores];
    const delta = a - b;
    if (Math.abs(delta) >= 0.005) {
      moved.push([DIMENSION_LABELS[key], delta]);
    }
  }
  return moved;
}

// ── Probe A: one leaf field at a time ─────────────────────────────────

type FieldProbe = {
  /** Human label — the field path. */
  field: string;
  /** Which part of the resume the field belongs to. */
  group: string;
  /** Mutate the draft so the field carries the marker. */
  apply: (r: ResumeData) => void;
};

const FIELD_PROBES: FieldProbe[] = [
  // basics
  {
    field: 'basics.name',
    group: 'basics',
    apply: (r) => {
      r.sections.basics.name = `${r.sections.basics.name} ${MARKER}`;
    }
  },
  {
    field: 'basics.label',
    group: 'basics',
    apply: (r) => {
      r.sections.basics.label = `${r.sections.basics.label} ${MARKER}`;
    }
  },
  {
    field: 'basics.email',
    group: 'basics',
    apply: (r) => {
      r.sections.basics.email = `${r.sections.basics.email}.${MARKER}`;
    }
  },
  {
    field: 'basics.phone',
    group: 'basics',
    apply: (r) => {
      r.sections.basics.phone = `${r.sections.basics.phone} ${MARKER}`;
    }
  },
  {
    field: 'basics.url',
    group: 'basics',
    apply: (r) => {
      r.sections.basics.url = `https://${MARKER.toLowerCase()}.example.com`;
    }
  },
  {
    field: 'basics.summary',
    group: 'basics',
    apply: (r) => {
      r.sections.basics.summary = `${r.sections.basics.summary} ${MARKER}`;
    }
  },
  {
    field: 'basics.location.city',
    group: 'basics',
    apply: (r) => {
      r.sections.basics.location.city = `${r.sections.basics.location.city} ${MARKER}`;
    }
  },
  {
    field: 'basics.location.region',
    group: 'basics',
    apply: (r) => {
      r.sections.basics.location.region = `${r.sections.basics.location.region} ${MARKER}`;
    }
  },
  {
    field: 'basics.location.countryCode',
    group: 'basics',
    apply: (r) => {
      r.sections.basics.location.countryCode = 'KE';
      r.sections.basics.location.region = MARKER;
    }
  },
  {
    field: 'basics.location.address',
    group: 'basics',
    apply: (r) => {
      r.sections.basics.location.address = `${r.sections.basics.location.address} ${MARKER}`;
    }
  },
  {
    field: 'basics.location.postalCode',
    group: 'basics',
    apply: (r) => {
      r.sections.basics.location.postalCode = '9999';
    }
  },
  {
    field: 'basics.profiles[].username',
    group: 'basics',
    apply: (r) => {
      r.sections.basics.profiles[0].username = MARKER;
    }
  },

  // work
  {
    field: 'work[].company',
    group: 'work',
    apply: (r) => {
      r.sections.work[0].company = MARKER;
    }
  },
  {
    field: 'work[].location',
    group: 'work',
    apply: (r) => {
      r.sections.work[0].location = MARKER;
    }
  },
  {
    field: 'work[].url',
    group: 'work',
    apply: (r) => {
      r.sections.work[0].url = `https://${MARKER.toLowerCase()}.example.com`;
    }
  },
  {
    field: 'work[].description',
    group: 'work',
    apply: (r) => {
      r.sections.work[0].description = `${r.sections.work[0].description} ${MARKER}`;
    }
  },
  {
    field: 'work[].positions[].title',
    group: 'work',
    apply: (r) => {
      r.sections.work[0].positions[0].title = `${r.sections.work[0].positions[0].title} ${MARKER}`;
    }
  },
  {
    field: 'work[].positions[].highlights[]',
    group: 'work',
    apply: (r) => {
      r.sections.work[0].positions[0].highlights = [
        ...r.sections.work[0].positions[0].highlights,
        `Shipped ${MARKER} to production`
      ];
    }
  },

  // skills
  {
    field: 'skills[].name',
    group: 'skills',
    apply: (r) => {
      r.sections.skills[0].name = `${r.sections.skills[0].name} ${MARKER}`;
    }
  },
  {
    field: 'skills[].level',
    group: 'skills',
    apply: (r) => {
      r.sections.skills[0].level = MARKER;
    }
  },
  {
    field: 'skills[].keywords[]',
    group: 'skills',
    apply: (r) => {
      r.sections.skills[0].keywords = [...r.sections.skills[0].keywords, MARKER];
    }
  },

  // projects
  {
    field: 'projects[].name',
    group: 'projects',
    apply: (r) => {
      r.sections.projects[0].name = `${r.sections.projects[0].name} ${MARKER}`;
    }
  },
  {
    field: 'projects[].description',
    group: 'projects',
    apply: (r) => {
      r.sections.projects[0].description = `${r.sections.projects[0].description} ${MARKER}`;
    }
  },
  {
    field: 'projects[].highlights[]',
    group: 'projects',
    apply: (r) => {
      r.sections.projects[0].highlights = [
        ...r.sections.projects[0].highlights,
        `Built ${MARKER} tooling`
      ];
    }
  },
  {
    field: 'projects[].keywords[]',
    group: 'projects',
    apply: (r) => {
      r.sections.projects[0].keywords = [...r.sections.projects[0].keywords, MARKER];
    }
  },
  {
    field: 'projects[].roles[]',
    group: 'projects',
    apply: (r) => {
      r.sections.projects[0].roles = [...r.sections.projects[0].roles, MARKER];
    }
  },

  // education
  {
    field: 'education[].institution',
    group: 'education',
    apply: (r) => {
      r.sections.education[0].institution = `${r.sections.education[0].institution} ${MARKER}`;
    }
  },
  {
    field: 'education[].location',
    group: 'education',
    apply: (r) => {
      r.sections.education[0].location = MARKER;
    }
  },
  {
    field: 'education[].degree.degreeLevel',
    group: 'education',
    apply: (r) => {
      r.sections.education[0].degree.degreeLevel = 'Bachelor';
      r.sections.education[0].degree.majors = [
        ...r.sections.education[0].degree.majors,
        MARKER
      ];
    }
  },
  {
    field: 'education[].degree.majors[]',
    group: 'education',
    apply: (r) => {
      r.sections.education[0].degree.majors = [
        ...r.sections.education[0].degree.majors,
        MARKER
      ];
    }
  },
  {
    field: 'education[].degree.minors[]',
    group: 'education',
    apply: (r) => {
      r.sections.education[0].degree.minors = [
        ...r.sections.education[0].degree.minors,
        MARKER
      ];
    }
  },
  {
    field: 'education[].courses[]',
    group: 'education',
    apply: (r) => {
      r.sections.education[0].courses = [...r.sections.education[0].courses, MARKER];
    }
  },
  {
    field: 'education[].gpa',
    group: 'education',
    apply: (r) => {
      r.sections.education[0].gpa = '3.8';
    }
  },
  {
    field: 'education[].url',
    group: 'education',
    apply: (r) => {
      r.sections.education[0].url = `https://${MARKER.toLowerCase()}.example.com`;
    }
  },

  // volunteer
  {
    field: 'volunteer[].organization',
    group: 'volunteer',
    apply: (r) => {
      r.sections.volunteer[0].organization = MARKER;
    }
  },
  {
    field: 'volunteer[].position',
    group: 'volunteer',
    apply: (r) => {
      r.sections.volunteer[0].position = MARKER;
    }
  },
  {
    field: 'volunteer[].summary',
    group: 'volunteer',
    apply: (r) => {
      r.sections.volunteer[0].summary = `${r.sections.volunteer[0].summary} ${MARKER}`;
    }
  },
  {
    field: 'volunteer[].highlights[]',
    group: 'volunteer',
    apply: (r) => {
      r.sections.volunteer[0].highlights = [
        ...r.sections.volunteer[0].highlights,
        `Mentored on ${MARKER}`
      ];
    }
  },

  // awards
  {
    field: 'awards[].title',
    group: 'awards',
    apply: (r) => {
      r.sections.awards[0].title = `${r.sections.awards[0].title} ${MARKER}`;
    }
  },
  {
    field: 'awards[].awarder',
    group: 'awards',
    apply: (r) => {
      r.sections.awards[0].awarder = MARKER;
    }
  },
  {
    field: 'awards[].summary',
    group: 'awards',
    apply: (r) => {
      r.sections.awards[0].summary = `${r.sections.awards[0].summary} ${MARKER}`;
    }
  },

  // certificates
  {
    field: 'certificates[].name',
    group: 'certificates',
    apply: (r) => {
      r.sections.certificates[0].name = `${r.sections.certificates[0].name} ${MARKER}`;
    }
  },
  {
    field: 'certificates[].issuer',
    group: 'certificates',
    apply: (r) => {
      r.sections.certificates[0].issuer = MARKER;
    }
  },

  // publications
  {
    field: 'publications[].name',
    group: 'publications',
    apply: (r) => {
      r.sections.publications = [
        {
          name: `${MARKER} at Scale`,
          publisher: 'ACM',
          releaseDate: '2024-01-01',
          url: '',
          summary: `A paper about ${MARKER}`
        }
      ];
    }
  },
  {
    field: 'publications[].summary',
    group: 'publications',
    apply: (r) => {
      r.sections.publications = [
        {
          name: 'A paper',
          publisher: 'ACM',
          releaseDate: '2024-01-01',
          url: '',
          summary: `A paper about ${MARKER}`
        }
      ];
    }
  },

  // languages
  {
    field: 'languages[].language',
    group: 'languages',
    apply: (r) => {
      r.sections.languages[0].language = MARKER;
    }
  },
  {
    field: 'languages[].fluency',
    group: 'languages',
    apply: (r) => {
      r.sections.languages[0].fluency = MARKER;
    }
  },

  // interests
  {
    field: 'interests[].name',
    group: 'interests',
    apply: (r) => {
      r.sections.interests[0].name = MARKER;
    }
  },
  {
    field: 'interests[].keywords[]',
    group: 'interests',
    apply: (r) => {
      r.sections.interests[0].keywords = [...r.sections.interests[0].keywords, MARKER];
    }
  },

  // references
  {
    field: 'references[].name',
    group: 'references',
    apply: (r) => {
      r.sections.references = [{ name: MARKER, reference: `A reference from ${MARKER}` }];
    }
  },
  {
    field: 'references[].reference',
    group: 'references',
    apply: (r) => {
      r.sections.references = [{ name: 'Someone', reference: `A reference from ${MARKER}` }];
    }
  }
];

// ── Probe B: whole sections ──────────────────────────────────────────

type SectionProbe = {
  section: string;
  apply: (r: ResumeData) => void;
};

const SECTION_PROBES: SectionProbe[] = [
  { section: 'work', apply: (r) => void (r.sections.work = []) },
  { section: 'education', apply: (r) => void (r.sections.education = []) },
  { section: 'skills', apply: (r) => void (r.sections.skills = []) },
  { section: 'projects', apply: (r) => void (r.sections.projects = []) },
  { section: 'volunteer', apply: (r) => void (r.sections.volunteer = []) },
  { section: 'awards', apply: (r) => void (r.sections.awards = []) },
  { section: 'certificates', apply: (r) => void (r.sections.certificates = []) },
  { section: 'publications', apply: (r) => void (r.sections.publications = []) },
  { section: 'languages', apply: (r) => void (r.sections.languages = []) },
  { section: 'interests', apply: (r) => void (r.sections.interests = []) },
  { section: 'references', apply: (r) => void (r.sections.references = []) },
  {
    section: 'ALL EXTRAS (projects+awards+publications+volunteer+certificates+languages+interests+references)',
    apply: (r) => {
      r.sections.projects = [];
      r.sections.awards = [];
      r.sections.publications = [];
      r.sections.volunteer = [];
      r.sections.certificates = [];
      r.sections.languages = [];
      r.sections.interests = [];
      r.sections.references = [];
    }
  }
];

// ── Probe C: dates ───────────────────────────────────────────────────
//
// The Seniority Fit dimension has a ±2-year tolerance band, so a single
// role's end date is not enough to move it. These probes move the WHOLE
// work history across the band, and then remove work history entirely to
// test whether EDUCATION dates count toward years of experience.

function dateProbes(): Array<{ label: string; apply: (r: ResumeData) => void }> {
  return [
    {
      label: 'ALL work endDates -> 20 years ago',
      apply: (r) => {
        for (const w of r.sections.work) {
          for (const p of w.positions) p.endDate = '2006-01-01';
        }
      }
    },
    {
      label: 'work removed + education endDate in 2032 (education = experience?)',
      apply: (r) => {
        r.sections.work = [];
        r.sections.education[0].startDate = '2020-01-01';
        r.sections.education[0].endDate = '2032-01-01';
      }
    }
  ];
}

// ── Probe D: eligibility notes (advisory, not scored) ────────────────
//
// Eligibility gates are detected in the intent extractor's SKILL LISTS
// (`mustHaveSkills` / `niceToHaveSkills`), not in `job.requirements` —
// see `lib/scoring/dimensions/intent-coverage.ts:225`. So that is where
// the gate lines have to go for a note to be produced.

const ELIGIBILITY_JOB: JobPosting = {
  ...JOB,
  id: 'probe-eligibility',
  title: 'Senior Backend Engineer',
  requirements: [
    "Bachelor's degree in Computer Science required",
    'Must be certified in AWS',
    'Must be authorised to work in the US'
  ],
  mustHaveSkills: [
    "Bachelor's degree in Computer Science required",
    'Must be certified in AWS',
    'TypeScript'
  ],
  niceToHaveSkills: ['Must be authorised to work in the US'],
  implicitSkills: []
};

// ── Probe E: does the JD's own city penalise the candidate? ──────────

const JOB_NO_CITY: JobPosting = {
  ...JOB,
  id: 'probe-nocity',
  description:
    'We build a streaming data platform for logistics. You will own our event pipeline and the services behind it.'
};

const JOB_CITY: JobPosting = {
  ...JOB,
  id: 'probe-city',
  description:
    'We build a streaming data platform for logistics in San Francisco, CA. You will own our event pipeline and the services behind it.'
};

// ── Run ──────────────────────────────────────────────────────────────

interface Row {
  label: string;
  group: string;
  overallDelta: number;
  moved: Array<[string, number]>;
}

function main(): void {
  const base = baselineResume();
  const baseScore = score(base);

  console.log('');
  console.log(`${BOLD}Which resume fields move the score?${RESET}`);
  console.log(
    `${DIM}scripts/probe-field-coverage.ts · sync engine · marker "${MARKER}" planted in one field at a time${RESET}`
  );
  console.log(
    `${DIM}Baseline overall ${baseScore.overallScore} · JD "${JOB.title}"${RESET}`
  );
  console.log('');

  // Probe A
  const fieldRows: Row[] = [];
  for (const probe of FIELD_PROBES) {
    const draft = baselineResume();
    probe.apply(draft);
    const after = score(draft);
    fieldRows.push({
      label: probe.field,
      group: probe.group,
      overallDelta: after.overallScore - baseScore.overallScore,
      moved: dimensionDelta(baseScore, after)
    });
  }

  // Probe B
  const sectionRows: Row[] = [];
  for (const probe of SECTION_PROBES) {
    const draft = baselineResume();
    probe.apply(draft);
    const after = score(draft);
    sectionRows.push({
      label: probe.section,
      group: probe.section,
      overallDelta: after.overallScore - baseScore.overallScore,
      moved: dimensionDelta(baseScore, after)
    });
  }

  // Probe C
  const dateRows: Row[] = [];
  for (const probe of dateProbes()) {
    const draft = baselineResume();
    probe.apply(draft);
    const after = score(draft);
    dateRows.push({
      label: probe.label,
      group: 'dates',
      overallDelta: after.overallScore - baseScore.overallScore,
      moved: dimensionDelta(baseScore, after)
    });
  }

  const pad = (s: string, n: number) => s.padEnd(n);

  console.log(`${BOLD}A. FIELD PROBE — is the field's TEXT read by the engine?${RESET}`);
  console.log(
    `${DIM}  Δoverall  field${RESET}`
  );
  console.log(`${DIM}${'─'.repeat(74)}${RESET}`);
  let currentGroup = '';
  for (const row of fieldRows) {
    if (row.group !== currentGroup) {
      currentGroup = row.group;
      console.log(`${DIM}  ${currentGroup}${RESET}`);
    }
    const delta = row.overallDelta;
    const color = delta > 0 ? GREEN : delta < 0 ? RED : DIM;
    const sign = delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
    const moved =
      row.moved.length > 0
        ? row.moved.map(([l, d]) => `${l} ${d > 0 ? '+' : ''}${d.toFixed(1)}`).join(', ')
        : `${DIM}nothing${RESET}`;
    console.log(`  ${color}${pad(sign, 9)}${RESET} ${pad(row.label, 40)} ${moved}`);
  }

  console.log('');
  console.log(`${BOLD}B. SECTION PROBE — what does removing the whole section cost?${RESET}`);
  console.log(`${DIM}${'─'.repeat(74)}${RESET}`);
  for (const row of sectionRows) {
    const delta = row.overallDelta;
    const color = delta > 0 ? GREEN : delta < 0 ? RED : DIM;
    const sign = delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
    const moved =
      row.moved.length > 0
        ? row.moved.map(([l, d]) => `${l} ${d > 0 ? '+' : ''}${d.toFixed(1)}`).join(', ')
        : `${DIM}nothing${RESET}`;
    console.log(`  ${color}${pad(sign, 9)}${RESET} ${pad(row.label, 40)} ${moved}`);
  }

  console.log('');
  console.log(`${BOLD}C. DATE PROBE — which dates move Seniority Fit?${RESET}`);
  console.log(`${DIM}${'─'.repeat(74)}${RESET}`);
  for (const row of dateRows) {
    const delta = row.overallDelta;
    const color = delta > 0 ? GREEN : delta < 0 ? RED : DIM;
    const sign = delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
    const moved =
      row.moved.length > 0
        ? row.moved.map(([l, d]) => `${l} ${d > 0 ? '+' : ''}${d.toFixed(1)}`).join(', ')
        : `${DIM}nothing${RESET}`;
    console.log(`  ${color}${pad(sign, 9)}${RESET} ${pad(row.label, 40)} ${moved}`);
  }

  // Summary
  const read = fieldRows.filter((r) => r.overallDelta !== 0);
  const ignored = fieldRows.filter((r) => r.overallDelta === 0);
  console.log('');
  console.log(`${BOLD}SUMMARY${RESET}`);
  console.log(
    `  ${GREEN}${read.length}${RESET} of ${fieldRows.length} probed fields move the score.`
  );
  console.log(`  ${RED}${ignored.length}${RESET} move nothing:`);
  for (const row of ignored) {
    console.log(`    ${DIM}·${RESET} ${row.label}`);
  }
  console.log('');

  // Role Fit — needs the embedding model, so it is measured separately.
  console.log(`${BOLD}D. ELIGIBILITY — are degree/certification/auth read?${RESET}`);
  console.log(
    `${DIM}  (advisory only — these notes are NOT part of the weighted score)${RESET}`
  );
  const eligResume = baselineResume();
  const elig = scoreResumeFromEnvelope(eligResume, ELIGIBILITY_JOB, NOW);
  for (const note of elig.eligibility ?? []) {
    console.log(`  ${BOLD}${note.requirement.kind}${RESET} — "${note.requirement.text}"`);
    console.log(`    status: ${YELLOW}${note.status}${RESET}`);
    console.log(`    ${DIM}${note.message}${RESET}`);
  }
  console.log(
    `  ${DIM}→ the resume HAS an AWS certificate ("AWS Solutions Architect Associate"` +
      ` ${DIM}in sections.certificates). Does the note say so?${RESET}`
  );
  console.log('');

  console.log(`${BOLD}E. THE JD'S OWN CITY — does it penalise the candidate?${RESET}`);
  const noCity = scoreResumeFromEnvelope(baselineResume(), JOB_NO_CITY, NOW);
  const withCity = scoreResumeFromEnvelope(baselineResume(), JOB_CITY, NOW);
  const cityInSummary = baselineResume();
  cityInSummary.sections.basics.summary = `${cityInSummary.sections.basics.summary} San Francisco, CA`;
  const cityPromoted = scoreResumeFromEnvelope(cityInSummary, JOB_CITY, NOW);
  const precise = (b: Breakdown) =>
    composeOverallScore(b.dimensionScores, !b.intentCoverageBreakdown.fallback);
  console.log(
    `  JD without a city in the prose : ${noCity.overallScore} (exact ${precise(noCity).toFixed(2)})   ` +
      `Keywords ${Math.round(noCity.dimensionScores.atsMatching)}`
  );
  console.log(
    `  JD mentioning "San Francisco, CA": ${withCity.overallScore} (exact ${precise(withCity).toFixed(2)})   ` +
      `Keywords ${Math.round(withCity.dimensionScores.atsMatching)}`
  );
  console.log(
    `  same JD, "San Francisco, CA" copied into the SUMMARY: ${cityPromoted.overallScore} (exact ${precise(cityPromoted).toFixed(2)})   ` +
      `Keywords ${Math.round(cityPromoted.dimensionScores.atsMatching)}`
  );
  console.log(
    `  ${DIM}the candidate's own basics.location.city is "San Francisco" in all three.${RESET}`
  );
  console.log('');

  console.log(`${BOLD}F. ROLE FIT — which titles does it compare?${RESET}`);
  console.log(
    `${DIM}  (needs the MiniLM model; skipped in the offline run — see the code trace)${RESET}`
  );
  console.log('');
}

main();
