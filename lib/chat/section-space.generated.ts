/**
 * MEASURED section-space data — GENERATED, do not edit by hand.
 *
 * Produced by:
 *   node scripts/measure-section-space.cjs
 *   node scripts/build-section-space-table.cjs
 *
 * Every number here came from printing real resumes through the real
 * templates under real print CSS and counting PDF pages. The section
 * figures are DELTAS — the difference in total page height between a
 * resume with that section and the same resume with it hidden — which
 * is the number the assistant needs when it weighs "hide this" against
 * "cut that".
 *
 * Regenerate after changing a template's typography, or after the
 * print-settings presets change.
 *
 * Source: docs/plans/resume-length-guidelines.md
 */
export interface SectionSpaceEntry {
  template: string;
  setting: string;
  /** Inches of content that fit on one page at this setting. */
  usableInches: number;
  /** Total height of the measurement sample. */
  totalInches: number;
  /** Height of the header block (name, contact, summary). */
  headerInches: number;
  /** Height of each section, in inches, keyed by section slug. */
  sectionInches: Record<string, number>;
}

export const SECTION_SPACE_DATA: SectionSpaceEntry[] = [
  {
    "template": "classic",
    "setting": "standard",
    "usableInches": 9.5,
    "totalInches": 21.34,
    "headerInches": 2.8,
    "sectionInches": {
      "experience": 6.33,
      "projects": 2.79,
      "awards": 1.88,
      "skills": 1.87,
      "languages": 1.3,
      "volunteer": 1.24,
      "education": 1.17,
      "interests": 1.02,
      "certificates": 0.94
    }
  },
  {
    "template": "classic",
    "setting": "compact",
    "usableInches": 10,
    "totalInches": 18.35,
    "headerInches": 2.57,
    "sectionInches": {
      "experience": 5.03,
      "projects": 2.49,
      "awards": 1.66,
      "skills": 1.57,
      "languages": 1.12,
      "volunteer": 1.11,
      "education": 1.06,
      "interests": 0.89,
      "certificates": 0.85
    }
  },
  {
    "template": "classic",
    "setting": "tightest",
    "usableInches": 10,
    "totalInches": 16.53,
    "headerInches": 2.28,
    "sectionInches": {
      "experience": 4.18,
      "projects": 2.32,
      "awards": 1.55,
      "skills": 1.47,
      "volunteer": 1.05,
      "languages": 1.05,
      "education": 0.99,
      "interests": 0.84,
      "certificates": 0.8
    }
  },
  {
    "template": "minimal",
    "setting": "standard",
    "usableInches": 9.5,
    "totalInches": 15.49,
    "headerInches": 2.38,
    "sectionInches": {
      "experience": 6.46,
      "projects": 2.75,
      "skills": 1.55,
      "volunteer": 1.19,
      "education": 1.16
    }
  },
  {
    "template": "minimal",
    "setting": "compact",
    "usableInches": 10,
    "totalInches": 12.9,
    "headerInches": 2.2,
    "sectionInches": {
      "experience": 5.17,
      "projects": 2.29,
      "skills": 1.3,
      "volunteer": 0.99,
      "education": 0.95
    }
  },
  {
    "template": "minimal",
    "setting": "tightest",
    "usableInches": 10,
    "totalInches": 11.27,
    "headerInches": 1.97,
    "sectionInches": {
      "experience": 4.21,
      "projects": 2.11,
      "skills": 1.19,
      "volunteer": 0.92,
      "education": 0.87
    }
  },
  {
    "template": "modern",
    "setting": "standard",
    "usableInches": 9.5,
    "totalInches": 19.94,
    "headerInches": 2.99,
    "sectionInches": {
      "experience": 6.41,
      "projects": 2.76,
      "skills": 1.87,
      "awards": 1.4,
      "volunteer": 1.21,
      "education": 0.95,
      "certificates": 0.91,
      "languages": 0.72,
      "interests": 0.72
    }
  },
  {
    "template": "modern",
    "setting": "compact",
    "usableInches": 10,
    "totalInches": 16.14,
    "headerInches": 2.65,
    "sectionInches": {
      "experience": 4.87,
      "projects": 2.31,
      "skills": 1.48,
      "awards": 1.14,
      "volunteer": 1,
      "education": 0.79,
      "certificates": 0.74,
      "languages": 0.58,
      "interests": 0.58
    }
  },
  {
    "template": "modern",
    "setting": "tightest",
    "usableInches": 10,
    "totalInches": 14.18,
    "headerInches": 2.33,
    "sectionInches": {
      "experience": 3.83,
      "projects": 2.14,
      "skills": 1.38,
      "awards": 1.05,
      "volunteer": 0.94,
      "education": 0.73,
      "certificates": 0.7,
      "languages": 0.54,
      "interests": 0.54
    }
  },
  {
    "template": "executive",
    "setting": "standard",
    "usableInches": 9.5,
    "totalInches": 16.44,
    "headerInches": 2.25,
    "sectionInches": {
      "experience": 7.03,
      "projects": 2.84,
      "skills": 1.61,
      "volunteer": 1.26,
      "education": 1,
      "publications": 0.45
    }
  },
  {
    "template": "executive",
    "setting": "compact",
    "usableInches": 10,
    "totalInches": 13.61,
    "headerInches": 2.3,
    "sectionInches": {
      "experience": 5.4,
      "projects": 2.36,
      "skills": 1.34,
      "volunteer": 1.05,
      "education": 0.82,
      "publications": 0.34
    }
  },
  {
    "template": "executive",
    "setting": "tightest",
    "usableInches": 10,
    "totalInches": 12.08,
    "headerInches": 1.95,
    "sectionInches": {
      "experience": 4.58,
      "projects": 2.2,
      "skills": 1.25,
      "volunteer": 0.99,
      "education": 0.78,
      "publications": 0.33
    }
  },
  {
    "template": "creative",
    "setting": "standard",
    "usableInches": 9.5,
    "totalInches": 17.11,
    "headerInches": 2.3,
    "sectionInches": {
      "experience": 7.05,
      "projects": 3.35,
      "skills": 2.12,
      "volunteer": 1.27,
      "education": 1.02
    }
  },
  {
    "template": "creative",
    "setting": "compact",
    "usableInches": 10,
    "totalInches": 14.19,
    "headerInches": 2.13,
    "sectionInches": {
      "experience": 5.65,
      "projects": 2.77,
      "skills": 1.74,
      "volunteer": 1.06,
      "education": 0.84
    }
  },
  {
    "template": "creative",
    "setting": "tightest",
    "usableInches": 10,
    "totalInches": 12.46,
    "headerInches": 1.83,
    "sectionInches": {
      "experience": 4.58,
      "projects": 2.6,
      "skills": 1.66,
      "volunteer": 1,
      "education": 0.79
    }
  },
  {
    "template": "jake",
    "setting": "standard",
    "usableInches": 9.5,
    "totalInches": 21.8,
    "headerInches": 2.83,
    "sectionInches": {
      "experience": 6.46,
      "projects": 2.38,
      "skills": 1.91,
      "awards": 1.84,
      "education": 1.75,
      "languages": 1.34,
      "volunteer": 1.26,
      "interests": 1.05,
      "certificates": 0.98
    }
  },
  {
    "template": "jake",
    "setting": "compact",
    "usableInches": 10,
    "totalInches": 18.15,
    "headerInches": 2.53,
    "sectionInches": {
      "experience": 4.63,
      "projects": 2.07,
      "awards": 1.63,
      "skills": 1.61,
      "education": 1.57,
      "languages": 1.16,
      "volunteer": 1.13,
      "interests": 0.93,
      "certificates": 0.89
    }
  },
  {
    "template": "jake",
    "setting": "tightest",
    "usableInches": 10,
    "totalInches": 16.47,
    "headerInches": 2.28,
    "sectionInches": {
      "experience": 3.95,
      "projects": 1.93,
      "skills": 1.5,
      "awards": 1.5,
      "education": 1.46,
      "languages": 1.08,
      "volunteer": 1.06,
      "interests": 0.88,
      "certificates": 0.83
    }
  }
];

export const SECTION_SPACE_TABLE = `Measured vertical space per section, in inches, at DEFAULT print settings (0.75in margin, 1.4 line height, 11pt body, standard section and item spacing).
One page of Letter at these settings holds 9.5 inches of content (11in page minus the two 0.75in margins).

| template | section | inches |
|---|---|---|
| Classic | _usable page_ | 9.5 |
| Classic | Header (name, contact, summary) | 2.80 |
| Classic | Experience | 6.33 |
| Classic | Projects | 2.79 |
| Classic | Awards | 1.88 |
| Classic | Skills | 1.87 |
| Classic | Languages | 1.30 |
| Classic | Volunteer | 1.24 |
| Classic | Education | 1.17 |
| Classic | Interests | 1.02 |
| Classic | Certificates | 0.94 |
| Classic | _total for this sample_ | 21.34 |
| Creative | _usable page_ | 9.5 |
| Creative | Header (name, contact, summary) | 2.30 |
| Creative | Experience | 7.05 |
| Creative | Projects | 3.35 |
| Creative | Skills | 2.12 |
| Creative | Volunteer | 1.27 |
| Creative | Education | 1.02 |
| Creative | _total for this sample_ | 17.11 |
| Executive | _usable page_ | 9.5 |
| Executive | Header (name, contact, summary) | 2.25 |
| Executive | Experience | 7.03 |
| Executive | Projects | 2.84 |
| Executive | Skills | 1.61 |
| Executive | Volunteer | 1.26 |
| Executive | Education | 1.00 |
| Executive | Publications | 0.45 |
| Executive | _total for this sample_ | 16.44 |
| Jake | _usable page_ | 9.5 |
| Jake | Header (name, contact, summary) | 2.83 |
| Jake | Experience | 6.46 |
| Jake | Projects | 2.38 |
| Jake | Skills | 1.91 |
| Jake | Awards | 1.84 |
| Jake | Education | 1.75 |
| Jake | Languages | 1.34 |
| Jake | Volunteer | 1.26 |
| Jake | Interests | 1.05 |
| Jake | Certificates | 0.98 |
| Jake | _total for this sample_ | 21.80 |
| Minimal | _usable page_ | 9.5 |
| Minimal | Header (name, contact, summary) | 2.38 |
| Minimal | Experience | 6.46 |
| Minimal | Projects | 2.75 |
| Minimal | Skills | 1.55 |
| Minimal | Volunteer | 1.19 |
| Minimal | Education | 1.16 |
| Minimal | _total for this sample_ | 15.49 |
| Modern | _usable page_ | 9.5 |
| Modern | Header (name, contact, summary) | 2.99 |
| Modern | Experience | 6.41 |
| Modern | Projects | 2.76 |
| Modern | Skills | 1.87 |
| Modern | Awards | 1.40 |
| Modern | Volunteer | 1.21 |
| Modern | Education | 0.95 |
| Modern | Certificates | 0.91 |
| Modern | Languages | 0.72 |
| Modern | Interests | 0.72 |
| Modern | _total for this sample_ | 19.94 |

The sample is a 3-role resume with 3 bullets each and every section populated, so the per-section figures are for a typical populated section — a bigger section takes more. Use these to estimate, and say "about" rather than promising an exact page count.

Hiding a section costs the user NOTHING — the content stays in their resume and stays editable, it just does not appear in the PDF. That makes it the cheapest lever for fitting a page, and it should be offered BEFORE cutting their work. Tightening the layout (compact margin + compact line height and spacing) buys about 3.1 inches on this sample resume. Cutting content is the expensive option and needs their sign-off.`;
