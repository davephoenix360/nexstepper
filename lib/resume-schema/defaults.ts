/**
 * Empty-but-typed defaults for every repeatable section.
 *
 * Used by the WYSIWYG editor when a user clicks "+ Add" on a section.
 * The values match each section's Zod shape so the appended row
 * validates and renders every field as a blank input (placeholders
 * are then shown via the `Field*` helpers' `placeholder` props).
 *
 * Centralised here because the same defaults are needed by the four
 * non-Classic templates and they MUST agree — if Modern's "Add
 * experience" appended a different shape than Classic's, the editor
 * would render the same field at one shape in one template and a
 * different shape in another.
 *
 * Mirrors `lib/resume-schema/sections/*.ts`. If a schema field is added,
 * its default must be added here too (the editor test asserts every
 * key of every default is a key of the corresponding inferred type).
 */

import type {
  AwardEntry,
  CertificateEntry,
  EducationEntry,
  InterestEntry,
  LanguageEntry,
  Position,
  Profile,
  ProjectEntry,
  PublicationEntry,
  ReferenceEntry,
  VolunteerEntry,
  WorkEntry
} from './sections';

export const EMPTY_POSITION: Position = {
  title: '',
  startDate: '',
  endDate: '',
  highlights: []
};

export const EMPTY_WORK: WorkEntry = {
  company: '',
  location: '',
  url: '',
  description: '',
  positions: []
};

export const EMPTY_EDUCATION: EducationEntry = {
  institution: '',
  url: '',
  location: '',
  degree: { degreeLevel: '', majors: [], minors: [] },
  startDate: '',
  endDate: '',
  gpa: '',
  courses: []
};

export const EMPTY_PROJECT: ProjectEntry = {
  name: '',
  description: '',
  highlights: [],
  keywords: [],
  startDate: '',
  endDate: '',
  url: '',
  roles: []
};

export const EMPTY_SKILL = {
  name: '',
  level: '',
  keywords: []
};

export const EMPTY_VOLUNTEER: VolunteerEntry = {
  organization: '',
  position: '',
  url: '',
  startDate: '',
  endDate: '',
  summary: '',
  highlights: []
};

export const EMPTY_AWARD: AwardEntry = {
  title: '',
  date: '',
  awarder: '',
  summary: ''
};

export const EMPTY_CERTIFICATE: CertificateEntry = {
  name: '',
  date: '',
  issuer: '',
  url: ''
};

export const EMPTY_PUBLICATION: PublicationEntry = {
  name: '',
  publisher: '',
  releaseDate: '',
  url: '',
  summary: ''
};

export const EMPTY_LANGUAGE: LanguageEntry = {
  language: '',
  fluency: ''
};

export const EMPTY_INTEREST: InterestEntry = {
  name: '',
  keywords: []
};

export const EMPTY_REFERENCE: ReferenceEntry = {
  name: '',
  reference: ''
};

export const EMPTY_PROFILE: Profile = {
  network: '',
  username: '',
  url: ''
};