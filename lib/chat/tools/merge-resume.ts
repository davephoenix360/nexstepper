import type { ResumeData, ResumeSections } from '@/lib/resume-schema';
import type { EditResumeArgs } from './types';

/**
 * Pure merge logic for the `editResume` tool.
 *
 * Deliberately free of `server-only`, DB, and auth imports so it can be unit
 * tested directly — the merge is where the resume-data bugs actually live, so
 * it needs tests that don't need a database.
 *
 * ## The bug this replaced
 *
 * The previous implementation returned the merged resume as a chain of
 * conditional object spreads:
 *
 * ```ts
 * return {
 *   ...existing,
 *   ...(args.contact && { sections: { ...existing.sections, basics: {...} } }),
 *   ...(args.work    && { sections: { ...existing.sections, work:    ... } }),
 *   ...(args.skills  && { sections: { ...existing.sections, skills:  ... } })
 * };
 * ```
 *
 * Every branch re-derived `sections` from `existing.sections`, so each one
 * **overwrote** the previous. A single tool call carrying `contact` +
 * `experience` silently discarded the contact edit — the revision saved, the
 * UI showed a green "Changes applied", and the summary the user asked to change
 * was untouched. That is the "it says it updated my resume and nothing
 * changed" report.
 *
 * This version folds every operation into one accumulator instead, so
 * operations compose safely in a single call.
 */

/** What the executor reports back to the model after a merge. */
export interface MergeOutcome {
  data: ResumeData;
  /** Human-readable lines describing what actually changed. */
  applied: string[];
  /**
   * Lines describing requested operations that could NOT be performed — most
   * often a `matchCompany` / `matchName` that matched nothing.
   *
   * These are returned to the model as a tool result so it can retry with a
   * different matcher rather than silently telling the user it worked.
   */
  warnings: string[];
}

const empty = <T>(v: T | undefined, fallback: T): T => (v === undefined ? fallback : v);

/** Case-insensitive "does `haystack` contain `needle`". */
function includesCI(haystack: string | undefined, needle: string): boolean {
  return (haystack ?? '').toLowerCase().includes(needle.trim().toLowerCase());
}

/**
 * Set (or create) a profile entry for a network, preserving the URL form the
 * user already had when the incoming value is just a handle.
 */
function upsertProfile(
  profiles: Array<{ network: string; username: string; url: string }> | undefined,
  network: string,
  value: string
): Array<{ network: string; username: string; url: string }> {
  const list = profiles ?? [];
  const idx = list.findIndex((p) => p.network.toLowerCase() === network.toLowerCase());
  const next = [...list];

  if (idx >= 0) {
    const current = next[idx];
    // If the model passed a bare handle ("davephoenix360") rather than a URL,
    // keep the existing URL and record it as the username.
    const looksLikeUrl = /^https?:\/\//i.test(value) || /^[^@\s]+\.[a-z]{2,}/i.test(value);
    next[idx] = {
      network: current.network,
      username: looksLikeUrl ? current.username : value,
      url: looksLikeUrl ? value : current.url
    };
    return next;
  }

  const looksLikeUrl = /^https?:\/\//i.test(value) || /^[^@\s]+\.[a-z]{2,}/i.test(value);
  next.push({
    network,
    username: looksLikeUrl ? '' : value,
    url: looksLikeUrl ? value : ''
  });
  return next;
}

/** Normalize a loose "clear this" signal: a template URL is the delete verb. */
function isClearValue(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v === 'clear' || v === 'remove' || v === 'delete' || v === 'none';
}

/**
 * Apply a set of `editResume` operations to an existing resume.
 *
 * Never mutates `existing` — every touched collection is copied first, so a
 * failed operation can never leave the caller holding a half-mutated resume.
 */
export function buildMergedData(existing: ResumeData, args: EditResumeArgs): MergeOutcome {
  // One accumulator for the whole merge. Every operation folds into this.
  const sections: ResumeSections = {
    ...existing.sections,
    basics: { ...existing.sections.basics },
    work: [...existing.sections.work],
    education: [...existing.sections.education],
    projects: [...existing.sections.projects],
    skills: existing.sections.skills.map((s) => ({ ...s })),
    volunteer: [...existing.sections.volunteer],
    awards: [...existing.sections.awards],
    certificates: [...existing.sections.certificates],
    publications: [...existing.sections.publications],
    languages: [...existing.sections.languages],
    interests: [...existing.sections.interests],
    references: [...existing.sections.references]
  };

  const applied: string[] = [];
  const warnings: string[] = [];
  let name = existing.name;

  // ─── setBasics ────────────────────────────────────────────────────────────
  const b = args.setBasics;
  if (b) {
    const basics = sections.basics;

    if (b.name !== undefined) {
      basics.name = b.name;
      name = b.name;
      applied.push('name');
    }
    if (b.headline !== undefined) {
      basics.label = b.headline;
      applied.push('headline');
    }
    if (b.email !== undefined) {
      basics.email = b.email;
      applied.push('email');
    }
    if (b.phone !== undefined) {
      basics.phone = b.phone;
      applied.push('phone');
    }
    if (b.website !== undefined) {
      basics.url = isClearValue(b.website) ? '' : b.website;
      applied.push('website');
    }
    if (b.linkedin !== undefined) {
      basics.profiles = upsertProfile(basics.profiles, 'LinkedIn', b.linkedin);
      applied.push('LinkedIn');
    }
    if (b.github !== undefined) {
      basics.profiles = upsertProfile(basics.profiles, 'GitHub', b.github);
      applied.push('GitHub');
    }
    if (b.city !== undefined || b.region !== undefined || b.countryCode !== undefined) {
      basics.location = {
        ...basics.location,
        ...(b.city !== undefined ? { city: b.city } : {}),
        ...(b.region !== undefined ? { region: b.region } : {}),
        ...(b.countryCode !== undefined ? { countryCode: b.countryCode } : {})
      };
      applied.push('location');
    }
    if (b.summary !== undefined) {
      basics.summary = b.summary;
      applied.push('summary');
    }
  }

  // ─── addWork ──────────────────────────────────────────────────────────────
  for (const job of args.addWork ?? []) {
    sections.work = [
      ...sections.work,
      {
        company: job.company,
        location: empty(job.location, ''),
        url: '',
        description: '',
        positions: [
          {
            title: job.role,
            startDate: empty(job.startDate, ''),
            endDate: empty(job.endDate, ''),
            highlights: [...(job.highlights ?? [])]
          }
        ]
      }
    ];
    applied.push(`added ${job.role} at ${job.company}`);
  }

  // ─── updateWork ───────────────────────────────────────────────────────────
  for (const edit of args.updateWork ?? []) {
    const entryIdx = sections.work.findIndex((w) => includesCI(w.company, edit.matchCompany));
    if (entryIdx < 0) {
      warnings.push(
        `No work entry matched company "${edit.matchCompany}". Check the spelling against the resume above, or use addWork to create a new role.`
      );
      continue;
    }

    const entry = sections.work[entryIdx];
    // With several positions at one company, `matchRole` picks which one.
    const posIdx =
      edit.matchRole !== undefined
        ? entry.positions.findIndex((p) => includesCI(p.title, edit.matchRole as string))
        : 0;

    if (posIdx < 0) {
      warnings.push(
        `Found ${entry.company} but no position matched role "${edit.matchRole}". Available: ${entry.positions.map((p) => p.title || '(untitled)').join(', ')}.`
      );
      continue;
    }

    const pos = entry.positions[posIdx];
    const s = edit.set;
    if (s.role !== undefined) pos.title = s.role;
    if (s.startDate !== undefined) pos.startDate = s.startDate;
    if (s.endDate !== undefined) pos.endDate = s.endDate;
    if (s.highlights !== undefined) pos.highlights = [...s.highlights];
    if (s.location !== undefined) entry.location = s.location;
    if (s.description !== undefined) entry.description = s.description;

    applied.push(
      `updated ${edit.matchRole ?? entry.positions[posIdx]?.title ?? 'role'} at ${entry.company}`
    );
  }

  // ─── removeWork ───────────────────────────────────────────────────────────
  for (const rm of args.removeWork ?? []) {
    const entryIdx = sections.work.findIndex((w) => includesCI(w.company, rm.company));
    if (entryIdx < 0) {
      warnings.push(`No work entry matched company "${rm.company}" to remove.`);
      continue;
    }
    const entry = sections.work[entryIdx];

    // Target one position at a multi-role company, otherwise drop the entry.
    if (rm.role !== undefined && entry.positions.length > 1) {
      const posIdx = entry.positions.findIndex((p) => includesCI(p.title, rm.role as string));
      if (posIdx < 0) {
        warnings.push(
          `Found ${entry.company} but no position matched "${rm.role}" to remove. Available: ${entry.positions.map((p) => p.title || '(untitled)').join(', ')}.`
        );
        continue;
      }
      entry.positions = entry.positions.filter((_, i) => i !== posIdx);
      applied.push(`removed ${rm.role} from ${entry.company}`);
      continue;
    }

    sections.work = sections.work.filter((_, i) => i !== entryIdx);
    applied.push(`removed ${entry.company}`);
  }

  // ─── addEducation ─────────────────────────────────────────────────────────
  for (const edu of args.addEducation ?? []) {
    sections.education = [
      ...sections.education,
      {
        institution: edu.institution,
        url: '',
        location: empty(edu.location, ''),
        degree: {
          degreeLevel: empty(edu.degreeLevel, ''),
          majors: [...(edu.majors ?? [])],
          minors: [...(edu.minors ?? [])]
        },
        startDate: empty(edu.startDate, ''),
        endDate: empty(edu.endDate, ''),
        gpa: empty(edu.gpa, ''),
        courses: [...(edu.courses ?? [])]
      }
    ];
    applied.push(`added education: ${edu.institution}`);
  }

  // ─── removeEducation ──────────────────────────────────────────────────────
  for (const rm of args.removeEducation ?? []) {
    const before = sections.education.length;
    sections.education = sections.education.filter((e) => !includesCI(e.institution, rm.institution));
    if (sections.education.length === before) {
      warnings.push(`No education entry matched institution "${rm.institution}" to remove.`);
    } else {
      applied.push(`removed education: ${rm.institution}`);
    }
  }

  // ─── addSkills (merge into existing category) ─────────────────────────────
  for (const group of args.addSkills ?? []) {
    const idx = sections.skills.findIndex((s) => includesCI(s.name, group.category));
    if (idx >= 0) {
      const current = sections.skills[idx];
      // Merge, don't replace — "add Python" must not drop the user's other languages.
      const merged = [...current.keywords];
      for (const kw of group.keywords) {
        if (!merged.some((k) => k.toLowerCase() === kw.toLowerCase())) merged.push(kw);
      }
      sections.skills[idx] = { ...current, keywords: merged };
    } else {
      sections.skills = [
        ...sections.skills,
        { name: group.category, level: '', keywords: [...group.keywords] }
      ];
    }
    applied.push(`added ${group.keywords.length} skill(s) to "${group.category}"`);
  }

  // ─── removeSkills ─────────────────────────────────────────────────────────
  for (const rm of args.removeSkills ?? []) {
    const idx = sections.skills.findIndex((s) => includesCI(s.name, rm.category));
    if (idx < 0) {
      warnings.push(`No skill category matched "${rm.category}" to remove from.`);
      continue;
    }
    const current = sections.skills[idx];
    const drop = new Set(rm.keywords.map((k) => k.toLowerCase()));
    const kept = current.keywords.filter((k) => !drop.has(k.toLowerCase()));
    const removedCount = current.keywords.length - kept.length;

    if (removedCount === 0) {
      warnings.push(
        `Category "${current.name}" has none of those keywords (has: ${current.keywords.join(', ') || 'none'}).`
      );
      continue;
    }

    // Drop the category entirely once it's empty — an empty category renders
    // as a blank heading band in the PDF.
    if (kept.length === 0) {
      sections.skills = sections.skills.filter((_, i) => i !== idx);
      applied.push(`removed skill category "${current.name}"`);
    } else {
      sections.skills[idx] = { ...current, keywords: kept };
      applied.push(`removed ${removedCount} skill(s) from "${current.name}"`);
    }
  }

  // ─── addProject ───────────────────────────────────────────────────────────
  for (const proj of args.addProject ?? []) {
    sections.projects = [
      ...sections.projects,
      {
        name: proj.name,
        description: empty(proj.description, ''),
        highlights: [...(proj.highlights ?? [])],
        keywords: [...(proj.keywords ?? [])],
        startDate: empty(proj.startDate, ''),
        endDate: empty(proj.endDate, ''),
        url: empty(proj.url, ''),
        roles: [...(proj.roles ?? [])]
      }
    ];
    applied.push(`added project: ${proj.name}`);
  }

  // ─── updateProject ────────────────────────────────────────────────────────
  for (const edit of args.updateProject ?? []) {
    const idx = sections.projects.findIndex((p) => includesCI(p.name, edit.matchName));
    if (idx < 0) {
      warnings.push(
        `No project matched "${edit.matchName}". Available: ${sections.projects.map((p) => p.name).join(', ') || '(none)'}.`
      );
      continue;
    }
    const current = sections.projects[idx];
    const s = edit.set;
    sections.projects[idx] = {
      ...current,
      ...(s.name !== undefined ? { name: s.name } : {}),
      ...(s.description !== undefined ? { description: s.description } : {}),
      ...(s.highlights !== undefined ? { highlights: [...s.highlights] } : {}),
      ...(s.keywords !== undefined ? { keywords: [...s.keywords] } : {}),
      ...(s.roles !== undefined ? { roles: [...s.roles] } : {}),
      ...(s.startDate !== undefined ? { startDate: s.startDate } : {}),
      ...(s.endDate !== undefined ? { endDate: s.endDate } : {}),
      ...(s.url !== undefined ? { url: s.url } : {})
    };
    applied.push(`updated project: ${edit.matchName}`);
  }

  // ─── removeProject ────────────────────────────────────────────────────────
  for (const rm of args.removeProject ?? []) {
    const before = sections.projects.length;
    sections.projects = sections.projects.filter((p) => !includesCI(p.name, rm.name));
    if (sections.projects.length === before) {
      warnings.push(`No project matched "${rm.name}" to remove.`);
    } else {
      applied.push(`removed project: ${rm.name}`);
    }
  }

  // ─── Leaf sections ────────────────────────────────────────────────────────
  for (const cert of args.addCertificates ?? []) {
    sections.certificates = [
      ...sections.certificates,
      {
        name: cert.name,
        date: empty(cert.date, ''),
        issuer: empty(cert.issuer, ''),
        url: empty(cert.url, '')
      }
    ];
    applied.push(`added certificate: ${cert.name}`);
  }

  for (const lang of args.addLanguages ?? []) {
    const existingIdx = sections.languages.findIndex((l) => includesCI(l.language, lang.language));
    if (existingIdx >= 0) {
      sections.languages[existingIdx] = {
        language: lang.language,
        fluency: empty(lang.fluency, sections.languages[existingIdx].fluency)
      };
    } else {
      sections.languages = [
        ...sections.languages,
        { language: lang.language, fluency: empty(lang.fluency, '') }
      ];
    }
    applied.push(`added language: ${lang.language}`);
  }

  for (const interest of args.addInterests ?? []) {
    const existingIdx = sections.interests.findIndex((i) => includesCI(i.name, interest.name));
    if (existingIdx >= 0) {
      const merged = [...sections.interests[existingIdx].keywords];
      for (const kw of interest.keywords ?? []) {
        if (!merged.some((k) => k.toLowerCase() === kw.toLowerCase())) merged.push(kw);
      }
      sections.interests[existingIdx] = { name: interest.name, keywords: merged };
    } else {
      sections.interests = [
        ...sections.interests,
        { name: interest.name, keywords: [...(interest.keywords ?? [])] }
      ];
    }
    applied.push(`added interest: ${interest.name}`);
  }

  for (const award of args.addAwards ?? []) {
    sections.awards = [
      ...sections.awards,
      {
        title: award.title,
        date: empty(award.date, ''),
        awarder: empty(award.awarder, ''),
        summary: empty(award.summary, '')
      }
    ];
    applied.push(`added award: ${award.title}`);
  }

  // ─── clearSection (runs last so it wins over any earlier op on it) ────────
  for (const slug of args.clearSection ?? []) {
    switch (slug) {
      case 'work':
        sections.work = [];
        break;
      case 'education':
        sections.education = [];
        break;
      case 'projects':
        sections.projects = [];
        break;
      case 'skills':
        sections.skills = [];
        break;
      case 'volunteer':
        sections.volunteer = [];
        break;
      case 'awards':
        sections.awards = [];
        break;
      case 'certificates':
        sections.certificates = [];
        break;
      case 'publications':
        sections.publications = [];
        break;
      case 'languages':
        sections.languages = [];
        break;
      case 'interests':
        sections.interests = [];
        break;
      case 'references':
        sections.references = [];
        break;
    }
    applied.push(`cleared the ${slug} section`);
  }

  return {
    data: { ...existing, name, sections },
    applied,
    warnings
  };
}
