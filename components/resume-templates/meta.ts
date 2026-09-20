/**
 * TemplateMeta — the *data* half of a resume template.
 *
 * The split is deliberate and load-bearing for the architecture:
 *
 *   - `Component`  → React JSX, lives in code, full creative power, type-safe
 *   - `meta`       → plain data object, validated by Zod, admin-editable in
 *                    Phase 6, serialization-friendly (server → client)
 *
 * Anything in `meta` is what shows up in the template picker, what the
 * pricing tier check looks at, what the ATS-safety badge reads, and what
 * the cache key includes. Anything NOT in `meta` is purely a rendering
 * detail — fonts, colors, layout — and lives in the component.
 *
 * The Zod schema is the contract. If a future contributor adds a field
 * to the source meta and forgets to add it here, the registry type
 * breaks at compile time. If a field is added HERE and the source meta
 * doesn't include it, runtime validation fails fast in dev.
 *
 * Field rationale:
 *   - `id`         → stable registry key + persisted in `data.template`
 *   - `name`       → display label in the picker and PDF chrome
 *   - `version`    → semver; bumps invalidate cached PDFs (Phase 2)
 *   - `tier`       → 'free' | 'pro' — drives Stripe gating, picker badge
 *   - `atsSafe`    → boolean; rendered as a badge in the picker so the
 *                    user knows the template won't lose their resume to
 *                    ATS parsing. All Phase 1+ templates must be true.
 *                    Add a creative tier later if we ship non-ATS
 *                    designs.
 *   - `category`   → grouping label in the picker (Classic, Modern,
 *                    Minimal, Executive, Creative). The picker uses
 *                    this to render section headers like "Classic" /
 *                    "Modern" / "Creative".
 *   - `accent`     → a palette identifier the template consumes for
 *                    its accent color. Today: 'indigo' (default),
 *                    'slate', 'emerald'. The picker can offer a
 *                    per-template accent override; the template reads
 *                    the value via a CSS variable the picker sets.
 *   - `maxPages`   → 'auto' (let the data drive pagination), '1' (force
 *                    single-page), '2' (force two-page). Drives the
 *                    print CSS via a data attribute on the wrapper.
 *   - `pageSize`   → 'letter' (US, default) or 'a4' (international).
 *   - `tags`       → free-form filter labels ("single-column",
 *                    "two-column", "academic", "tech"). For picker
 *                    search/filter in Phase 2.
 *   - `preview`    → optional absolute URL to a thumbnail (PNG/SVG).
 *                    Used in the picker; if absent the picker falls
 *                    back to a live mini-render.
 *   - `description` → one-liner for the picker card.
 *
 * Reference for the split: Reactive Resume's `Template` type (in their
 * monorepo's `packages/schema`) does something similar — a
 * discriminated union of meta shape and component — and it's what
 * powers their 14-template gallery without anyone having to maintain
 * 14 components' worth of meta info by hand.
 */

import { z } from "zod";

/**
 * Valid tier values for the Stripe-gated catalog. Keep this enum
 * tight — adding a new tier is a billing decision, not a code
 * decision, and we want the type system to force a review.
 */
export const templateTierSchema = z.enum(["free", "pro"]);
export type TemplateTier = z.infer<typeof templateTierSchema>;

/**
 * Categories drive how the picker groups templates. Adding a new
 * category means designing a new "lane" in the picker UI.
 */
export const templateCategorySchema = z.enum([
  "classic",
  "modern",
  "minimal",
  "executive",
  "creative"
]);
export type TemplateCategory = z.infer<typeof templateCategorySchema>;

/**
 * Pagination strategy. The template uses this as a `data-max-pages`
 * attribute on its wrapper; CSS reads it to suppress or force page
 * breaks.
 */
export const templateMaxPagesSchema = z.enum(["auto", "1", "2"]);
export type TemplateMaxPages = z.infer<typeof templateMaxPagesSchema>;

export const templatePageSizeSchema = z.enum(["letter", "a4"]);
export type TemplatePageSize = z.infer<typeof templatePageSizeSchema>;

/**
 * Accent color theme. The picker exposes a per-template override;
 * the value lands on a CSS variable the template reads in its
 * accent rule. The template picks the default if no override is set.
 */
export const templateAccentSchema = z.enum([
  "indigo",
  "slate",
  "emerald",
  "rose",
  "amber"
]);
export type TemplateAccent = z.infer<typeof templateAccentSchema>;

export const templateMetaSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]*$/, {
      message:
        "Template id must be lowercase kebab-case (e.g. 'classic', 'modern-tech')."
    }),
  name: z.string().min(2).max(40),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, {
      message: "Template version must be semver (e.g. 1.0.0)."
    }),
  description: z.string().max(200).optional(),
  tier: templateTierSchema,
  atsSafe: z.boolean(),
  category: templateCategorySchema,
  accent: templateAccentSchema,
  maxPages: templateMaxPagesSchema,
  pageSize: templatePageSizeSchema,
  tags: z.array(z.string().min(1).max(24)).max(8).default([]),
  preview: z.string().url().optional()
});

export type TemplateMeta = z.infer<typeof templateMetaSchema>;

/**
 * Default meta for the Classic template. Imported by the registry
 * initializer so we have a single source of truth for what Classic
 * reports to the picker. Picked deliberately:
 *   - tier: 'free' — the default, gates nothing
 *   - atsSafe: true — single column, no graphics, parseable
 *   - category: 'classic' — sets the lane in the picker
 *   - accent: 'indigo' — the existing brand color
 *   - maxPages: 'auto' — let the data drive it
 *   - pageSize: 'letter' — US default (matches globals.css @page rule)
 *   - tags: ['single-column', 'serif', 'traditional'] — picker filters
 */
export const CLASSIC_TEMPLATE_META: TemplateMeta = {
  id: "classic",
  name: "Classic",
  version: "1.1.0",
  description: "Single-column, generous whitespace, ATS-friendly.",
  tier: "free",
  atsSafe: true,
  category: "classic",
  accent: "indigo",
  maxPages: "auto",
  pageSize: "letter",
  tags: ["single-column", "serif", "traditional"]
};

/**
 * Default meta for the Modern template. Picked to be visually
 * distinct from Classic while staying ATS-safe:
 *   - tier: 'free' — both starter templates free
 *   - atsSafe: true — single column, no graphics, parseable
 *   - category: 'modern' — sets a separate lane in the picker
 *   - accent: 'indigo' — same brand accent by default; the picker
 *     will eventually let the user override per template
 *   - maxPages: 'auto' — same as Classic
 *   - pageSize: 'letter' — same default; picker lets user switch
 *   - tags: ['single-column', 'sans-serif', 'contemporary'] — these
 *     drive the picker filters so users can find Modern by searching
 *     for "sans-serif" or "contemporary"
 */
export const MODERN_TEMPLATE_META: TemplateMeta = {
  id: "modern",
  name: "Modern",
  version: "1.0.0",
  description:
    "Bold, sans-serif, contemporary. Single-column with accent bar.",
  tier: "free",
  atsSafe: true,
  category: "modern",
  accent: "indigo",
  maxPages: "auto",
  pageSize: "letter",
  tags: ["single-column", "sans-serif", "contemporary"]
};

/**
 * Default meta for the Minimal template. Picked to complement the
 * existing Classic + Modern pair:
 *   - tier: 'free' — keeps the starter set free
 *   - atsSafe: true — single column, no graphics, parseable
 *   - category: 'minimal' — sets a separate lane in the picker
 *   - accent: 'slate' — quieter than indigo; the minimal aesthetic
 *     leans toward neutral chrome. Picker can still override per
 *     template via the accent CSS variable.
 *   - maxPages: 'auto' — same as the existing pair
 *   - pageSize: 'letter' — US default
 *   - tags: ['single-column', 'sans-serif', 'editorial'] — picker
 *     filters so users can find Minimal via "editorial" or
 *     "whitespace"
 *
 * Use case (per the founder): designers, PMs, anyone who wants
 * an understated resume. The chrome is the visual signal — no
 * section borders, no accent bar, smaller body font, generous
 * letter-spacing on section headings.
 */
export const MINIMAL_TEMPLATE_META: TemplateMeta = {
  id: "minimal",
  name: "Minimal",
  version: "1.0.0",
  description:
    "Editorial, generous whitespace, hairline accent. For understated types.",
  tier: "free",
  atsSafe: true,
  category: "minimal",
  accent: "slate",
  maxPages: "auto",
  pageSize: "letter",
  tags: ["single-column", "sans-serif", "editorial", "whitespace"]
};

/**
 * Default meta for the Executive template. Picked for senior roles
 * where authority matters more than modern visuals:
 *   - tier: 'free' — keeps the starter set free (Phase 6+ can flip)
 *   - atsSafe: true — single column, no graphics, parseable
 *   - category: 'executive' — sets a separate lane in the picker
 *   - accent: 'slate' — quieter than indigo; serif body wants a
 *     neutral accent. Picker can still override.
 *   - maxPages: '2' — exec resumes often run 2 pages, force it
 *     so the picker doesn't accidentally truncate
 *   - pageSize: 'letter' — US default
 *   - tags: ['single-column', 'serif', 'executive', 'senior']
 *
 * Use case: C-suite, VP, Director-track. The serif body is the
 * signal — readers associate serif with academic / legal /
 * authority. Header is right-justified with no hairline chrome.
 */
export const EXECUTIVE_TEMPLATE_META: TemplateMeta = {
  id: "executive",
  name: "Executive",
  version: "1.0.0",
  description:
    "Serif, dignified, right-justified header. For senior-track roles.",
  tier: "free",
  atsSafe: true,
  category: "executive",
  accent: "slate",
  maxPages: "2",
  pageSize: "letter",
  tags: ["single-column", "serif", "executive", "senior"]
};

/**
 * Default meta for the Creative template. Picked for designers,
 * marketers, creative-leaning PMs:
 *   - tier: 'free' — keeps the starter set free
 *   - atsSafe: true — single column, no graphics, no tables. The
 *     color accent is just typography (the section accent) and a
 *     thin section divider line; nothing an ATS can't parse.
 *   - category: 'creative' — sets a separate lane in the picker
 *   - accent: 'rose' — the existing rose palette entry; the
 *     picker exposes it via the accent CSS variable
 *   - maxPages: 'auto' — same as the existing pair
 *   - pageSize: 'letter' — US default
 *   - tags: ['single-column', 'sans-serif', 'creative', 'color']
 *
 * Use case: visual roles where the candidate WANTS a touch of
 * color but the resume still needs to parse in Workday / Greenhouse
 * / Lever / Taleo. The accent is a single-color section rule and
 * the contact strip gets the accent color too.
 */
export const CREATIVE_TEMPLATE_META: TemplateMeta = {
  id: "creative",
  name: "Creative",
  version: "1.0.0",
  description:
    "Color-forward, single-column, accent section rules. For visual roles.",
  tier: "free",
  atsSafe: true,
  category: "creative",
  accent: "rose",
  maxPages: "auto",
  pageSize: "letter",
  tags: ["single-column", "sans-serif", "creative", "color"]
};
