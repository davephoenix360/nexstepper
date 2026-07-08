import { z } from 'zod';

import { optionalFlexibleUrl } from '../url';

/**
 * Education schema (JSON Resume v1.0.0 `education`).
 */

export const degreeSchema = z.object({
  degreeLevel: z.string().default(''), // e.g. "Bachelor", "Master", "PhD"
  majors: z.array(z.string()).default([]),
  minors: z.array(z.string()).default([])
});

export const educationEntrySchema = z.object({
  institution: z.string().default(''),
  url: optionalFlexibleUrl,
  location: z.string().default(''),
  degree: degreeSchema.default({ degreeLevel: '', majors: [], minors: [] }),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  gpa: z.string().default(''),
  courses: z.array(z.string()).default([])
});

export const educationSchema = z.array(educationEntrySchema).default([]);

export type Degree = z.infer<typeof degreeSchema>;
export type EducationEntry = z.infer<typeof educationEntrySchema>;