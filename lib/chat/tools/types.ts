import { z } from 'zod';

/**
 * Argument shape for the `editResume` tool.
 * All fields are optional — the AI merges partial data into the
 * existing resume and must not overwrite unspecified fields.
 */
export const editResumeArgsSchema = z.object({
  /**
   * Updated contact fields (name, email, phone, etc.).
   * Any omitted field is left unchanged.
   */
  contact: z
    .object({
      name: z.string().optional(),
      headline: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      location: z.string().optional(),
      website: z.string().optional(),
      linkedin: z.string().optional(),
      github: z.string().optional(),
      summary: z.string().optional()
    })
    .optional(),

  /**
   * Updated work experience. Full replacement of the experience array.
   * Pass the complete updated array — any omitted entry is lost.
   */
  experience: z
    .array(
      z.object({
        id: z.string(),
        company: z.string(),
        role: z.string(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        location: z.string().optional(),
        highlights: z.array(z.string()).optional()
      })
    )
    .optional(),

  /**
   * Updated education. Full replacement of the education array.
   */
  education: z
    .array(
      z.object({
        id: z.string(),
        institution: z.string(),
        degree: z.string().optional(),
        field: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        gpa: z.string().optional()
      })
    )
    .optional(),

  /**
   * Updated skills. Full replacement of the skills array.
   */
  skills: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        level: z.string().optional()
      })
    )
    .optional(),

  /**
   * Updated projects. Full replacement of the projects array.
   */
  projects: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        link: z.string().optional(),
        highlights: z.array(z.string()).optional()
      })
    )
    .optional()
});

export type EditResumeArgs = z.infer<typeof editResumeArgsSchema>;

/**
 * Argument shape for the `switchTemplate` tool.
 */
export const switchTemplateArgsSchema = z.object({
  templateId: z.enum(['minimal', 'classic', 'executive', 'creative', 'modern'])
});

export type SwitchTemplateArgs = z.infer<typeof switchTemplateArgsSchema>;

/** Union of all tool argument shapes. */
export type ChatToolArgs = EditResumeArgs | SwitchTemplateArgs;

/** Tool identifiers surfaced to the AI. */
export type ChatToolName = 'editResume' | 'switchTemplate';
