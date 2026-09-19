/**
 * Improvement tips for each ATS sub-criterion.
 *
 * Displayed as hover tooltips on the expanded sub-criteria breakdown
 * in the scorecard panel. Each tip is a short, actionable sentence —
 * the user should know exactly what to do after reading it.
 *
 * Tips are keyed by the canonical sub-criterion label as it appears
 * in `ScoreBreakdown.criteriaScores` so the scorecard can do a
 * direct lookup without any mapping layer.
 */

export const CRITERIA_TIPS: Record<string, string> = {
  'ATS Keyword Match':
    'Add more skills and requirements from the job description to your resume. ATS systems filter on exact and near-exact keyword matches.',

  'ATS Similarity':
    'Rewrite your descriptions to use the same language as the job posting. Phrases like "built a database" and "designed a data store" score higher when they match the JD wording.',

  'ATS Coverage':
    'Make sure your resume covers the main requirements: if the JD asks for five things and you only address three, add content that covers the missing ones.',

  'Section Completeness':
    'Fill in every standard resume section: Summary, Experience, Education, Skills, and at least one achievement-oriented section. Missing sections lower your score.',

  'Optimal Length':
    "Keep your resume to 1-2 pages. Too short and the ATS can't find enough content to score; too long and recruiters may not read it.",

  'Accomplishment Focus':
    'Replace generic duty lists with specific accomplishments. Use the XYZ formula: achieved X by doing Y, resulting in Z (e.g., "Reduced API latency by 40% by migrating to a CDN, cutting load times in half").',

  'Action Verb Usage':
    'Start bullet points with strong action verbs: Built, Designed, Led, Scaled, Automated. Avoid weak verbs like "helped with" or "worked on".',

  Tailoring:
    'Customize your resume for each application. A generic resume scores lower than one written specifically for this job — mirror the job title, required skills, and key phrases from the posting.',

  'Unique Value':
    'Highlight what makes you different: awards, certifications, notable projects, or unique domain expertise that few other candidates will have.',

  'Soft Skills':
    'Add soft skills from the job description if you have evidence of them — collaboration, leadership, communication. Show them in context, not just as a list.'
};
