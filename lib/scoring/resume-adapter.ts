/**
 * The adapter from the wide `ResumeData` envelope to the narrow
 * `ResumeTextSource` shape the engine reads.
 *
 * ## Why it lives in its own file
 *
 * `lib/scoring/score.ts` imports every dimension, and
 * `lib/scoring/dimensions/intent-coverage.ts` needs this adapter too —
 * so putting it in `score.ts` would make the dimension import the
 * engine that imports the dimension. A cycle.
 *
 * `lib/scoring/similarity.ts` cannot hold it either: that module has
 **no imports at all**, on purpose — it is the dependency-free core the
 * rest of the engine is built on.
 *
 * So: one adapter, one file, imported by everyone.
 */

import type { ResumeData } from '@/lib/resume-schema';
import type { ResumeTextSource } from './similarity';

/**
 * Reduce the resume envelope to the evidence the scorer reads.
 *
 * The fields that are DROPPED are dropped deliberately — a proper noun,
 * a contact detail, a link and a self-assessment are not evidence a JD
 * can ask for. `lib/scoring/similarity.ts` (`flattenResumeText`) carries
 * the full list and the reasoning; this is the other half of the same
 * decision, and the two must agree.
 */
export function resumeDataToScoreable(resume: ResumeData): ResumeTextSource {
  const sections = resume.sections;
  return {
    basics: {
      summary: sections.basics.summary ?? '',
      label: sections.basics.label ?? '',
      // City and region only. The street address, the postal code and
      // the country code are noise — and a two-letter country code would
      // match all sorts of unrelated JD tokens.
      location: {
        city: sections.basics.location?.city ?? '',
        region: sections.basics.location?.region ?? ''
      }
    },
    skills: sections.skills.map((s) => ({
      name: s.name,
      keywords: s.keywords
    })),
    work: sections.work.map((w) => ({
      summary: w.description ?? '',
      positions: w.positions.map((p) => ({
        title: p.title ?? '',
        highlights: p.highlights ?? []
      }))
    })),
    projects: (sections.projects ?? []).map((p) => ({
      name: p.name,
      description: p.description,
      highlights: p.highlights,
      keywords: p.keywords,
      roles: p.roles
    })),
    // Education carries BOTH the subject evidence and the dates — the
    // flattener needs the first, the eligibility module needs the second.
    // The institution, its location, the GPA and the url are not evidence
    // a JD can ask for, so they are not carried.
    education: (sections.education ?? []).map((e) => ({
      degree: {
        degreeLevel: e.degree?.degreeLevel ?? '',
        majors: e.degree?.majors ?? [],
        minors: e.degree?.minors ?? []
      },
      courses: e.courses ?? [],
      startDate: e.startDate ?? '',
      endDate: e.endDate ?? ''
    })),
    certificates: (sections.certificates ?? []).map((c) => ({
      name: c.name ?? '',
      issuer: c.issuer ?? ''
    })),
    languages: (sections.languages ?? []).map((l) => ({
      language: l.language ?? ''
    })),
    volunteer: (sections.volunteer ?? []).map((v) => ({
      position: v.position ?? '',
      summary: v.summary ?? '',
      highlights: v.highlights ?? []
    })),
    awards: (sections.awards ?? []).map((a) => ({
      title: a.title ?? '',
      summary: a.summary ?? ''
    })),
    publications: (sections.publications ?? []).map((p) => ({
      name: p.name ?? '',
      summary: p.summary ?? ''
    }))
  };
}
