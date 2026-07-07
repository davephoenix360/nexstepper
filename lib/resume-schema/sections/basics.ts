import { z } from 'zod';

/**
 * Profile schema (JSON Resume v1.0.0 `basics`).
 * Personal info: name, label, contact, location, online profiles.
 */
export const locationSchema = z.object({
  address: z.string().default(''),
  postalCode: z.string().default(''),
  city: z.string().default(''),
  countryCode: z.string().default(''), // ISO 3166-1 alpha-2, e.g. "US"
  region: z.string().default('') // state / province
});

export const profileSchema = z.object({
  network: z.string(), // e.g. "LinkedIn", "GitHub", "Twitter"
  username: z.string().default(''),
  url: z.url().or(z.literal('')).default('') // empty allowed so the form is forgiving
});

export const basicsSchema = z.object({
  name: z.string().default(''),
  label: z.string().default(''), // e.g. "Senior Software Engineer"
  email: z.email().or(z.literal('')).default(''),
  phone: z.string().default(''),
  url: z.url().or(z.literal('')).default(''), // personal website
  summary: z.string().default(''),
  location: locationSchema.default({
    address: '',
    postalCode: '',
    city: '',
    countryCode: '',
    region: ''
  }),
  profiles: z.array(profileSchema).default([])
});

export type Location = z.infer<typeof locationSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Basics = z.infer<typeof basicsSchema>;