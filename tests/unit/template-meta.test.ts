import { describe, expect, it } from "vitest";

import {
  CLASSIC_TEMPLATE_META,
  MODERN_TEMPLATE_META,
  templateMetaSchema,
  templateTierSchema,
  templateCategorySchema,
  templateMaxPagesSchema,
  templatePageSizeSchema,
  templateAccentSchema
} from "@/components/resume-templates/meta";
import {
  templateRegistry,
  getTemplate,
  listTemplates
} from "@/components/resume-templates";
import type { TemplateMeta } from "@/components/resume-templates";

/**
 * Locks the contract between the TemplateMeta Zod schema and the
 * meta constants we ship (Classic, Modern). The schema is the
 * type-level truth — if a future contributor adds a required
 * field to templateMetaSchema without updating CLASSIC_TEMPLATE_META
 * or MODERN_TEMPLATE_META, the parse call below throws at import time.
 *
 * Also locks the registry: every registered template's id matches
 * the key in the registry map, and getTemplate() falls back to
 * Classic when the requested id is unknown.
 */

describe("TemplateMeta Zod schema", () => {
  it("accepts the Classic template's meta", () => {
    const result = templateMetaSchema.safeParse(CLASSIC_TEMPLATE_META);
    expect(result.success).toBe(true);
  });

  it("accepts the Modern template's meta", () => {
    const result = templateMetaSchema.safeParse(MODERN_TEMPLATE_META);
    expect(result.success).toBe(true);
  });

  it("rejects an id that isn't lowercase kebab-case", () => {
    const result = templateMetaSchema.safeParse({
      ...CLASSIC_TEMPLATE_META,
      id: "Not-Valid_ID"
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-semver version", () => {
    const result = templateMetaSchema.safeParse({
      ...CLASSIC_TEMPLATE_META,
      version: "v1"
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown tier (locks the tier enum)", () => {
    const result = templateMetaSchema.safeParse({
      ...CLASSIC_TEMPLATE_META,
      tier: "enterprise"
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown category (locks the category enum)", () => {
    const result = templateMetaSchema.safeParse({
      ...CLASSIC_TEMPLATE_META,
      category: "abstract"
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-URL preview string", () => {
    const result = templateMetaSchema.safeParse({
      ...CLASSIC_TEMPLATE_META,
      preview: "not a url"
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 8 tags", () => {
    const result = templateMetaSchema.safeParse({
      ...CLASSIC_TEMPLATE_META,
      tags: Array.from({ length: 9 }, (_, i) => `tag-${i}`)
    });
    expect(result.success).toBe(false);
  });

  it("rejects a tag longer than 24 characters", () => {
    const result = templateMetaSchema.safeParse({
      ...CLASSIC_TEMPLATE_META,
      tags: ["this-tag-is-way-way-way-too-long"]
    });
    expect(result.success).toBe(false);
  });
});

describe("Tier enum", () => {
  it("includes free and pro", () => {
    expect(templateTierSchema.options).toContain("free");
    expect(templateTierSchema.options).toContain("pro");
  });
});

describe("Category enum", () => {
  it("includes the five picker lanes", () => {
    expect(templateCategorySchema.options).toEqual(
      expect.arrayContaining([
        "classic",
        "modern",
        "minimal",
        "executive",
        "creative"
      ])
    );
  });
});

describe("Max pages enum", () => {
  it("includes auto, 1, 2", () => {
    expect(templateMaxPagesSchema.options).toEqual(
      expect.arrayContaining(["auto", "1", "2"])
    );
  });
});

describe("Page size enum", () => {
  it("includes letter and a4", () => {
    expect(templatePageSizeSchema.options).toEqual(
      expect.arrayContaining(["letter", "a4"])
    );
  });
});

describe("Accent enum", () => {
  it("includes the five accent options", () => {
    expect(templateAccentSchema.options).toEqual(
      expect.arrayContaining([
        "indigo",
        "slate",
        "emerald",
        "rose",
        "amber"
      ])
    );
  });
});

describe("Default template meta constants", () => {
  it("Classic is free, atsSafe, classic category, indigo accent", () => {
    expect(CLASSIC_TEMPLATE_META.tier).toBe("free");
    expect(CLASSIC_TEMPLATE_META.atsSafe).toBe(true);
    expect(CLASSIC_TEMPLATE_META.category).toBe("classic");
    expect(CLASSIC_TEMPLATE_META.accent).toBe("indigo");
    expect(CLASSIC_TEMPLATE_META.pageSize).toBe("letter");
  });

  it("Modern is free, atsSafe, modern category, indigo accent", () => {
    expect(MODERN_TEMPLATE_META.tier).toBe("free");
    expect(MODERN_TEMPLATE_META.atsSafe).toBe(true);
    expect(MODERN_TEMPLATE_META.category).toBe("modern");
    expect(MODERN_TEMPLATE_META.accent).toBe("indigo");
  });

  it("Classic and Modern have distinct ids (no collisions in the registry)", () => {
    expect(CLASSIC_TEMPLATE_META.id).not.toBe(MODERN_TEMPLATE_META.id);
  });

  it("both default templates parse against the schema (import-time safety net)", () => {
    // If the constants ever drift from the schema, this throws.
    expect(() =>
      templateMetaSchema.parse(CLASSIC_TEMPLATE_META)
    ).not.toThrow();
    expect(() =>
      templateMetaSchema.parse(MODERN_TEMPLATE_META)
    ).not.toThrow();
  });
});

describe("Template registry", () => {
  it("contains both shipped templates", () => {
    expect(Object.keys(templateRegistry).sort()).toEqual([
      "classic",
      "modern"
    ]);
  });

  it("every registered template's meta parses against the schema", () => {
    for (const [id, t] of Object.entries(templateRegistry)) {
      const result = templateMetaSchema.safeParse(t.meta);
      expect(
        result.success,
        `Template "${id}" failed schema validation: ${JSON.stringify(result)}`
      ).toBe(true);
    }
  });

  it("getTemplate returns the right template for known ids", () => {
    expect(getTemplate("classic").meta.id).toBe("classic");
    expect(getTemplate("modern").meta.id).toBe("modern");
  });

  it("getTemplate falls back to Classic for unknown / null / undefined ids", () => {
    expect(getTemplate("does-not-exist").meta.id).toBe("classic");
    expect(getTemplate(null).meta.id).toBe("classic");
    expect(getTemplate(undefined).meta.id).toBe("classic");
    expect(getTemplate("").meta.id).toBe("classic");
  });

  it("listTemplates returns at least the two shipped templates", () => {
    const list = listTemplates();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const ids = list.map((t) => t.meta.id);
    expect(ids).toContain("classic");
    expect(ids).toContain("modern");
  });
});

describe("Template type contract", () => {
  it("every template's meta is a valid TemplateMeta (compile-time + runtime check)", () => {
    // The `satisfies ResumeTemplate` cast in each template file
    // gives us compile-time checking; this loop re-verifies at
    // runtime so a refactor that drops the satisfies doesn't
    // silently break the contract.
    for (const t of listTemplates()) {
      const meta: TemplateMeta = t.meta;
      const result = templateMetaSchema.safeParse(meta);
      expect(result.success).toBe(true);
    }
  });
});
