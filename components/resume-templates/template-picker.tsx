'use client';

/**
 * TemplatePicker — the dropdown control on the editor toolbar that
 * lets the user pick which template renders their resume.
 *
 * Why a dropdown and not a grid-of-cards:
 *   - Two templates today; the toolbar is the right place for a
 *     compact "current template" indicator
 *   - A full grid is for the Phase 6 admin UI / public template
 *     gallery, not the in-editor experience
 *   - The picker surfaces meta (ATS-safe, tier, version) as small
 *     badges inline — recruiters care about ATS, designers care
 *     about version, billing cares about tier
 *
 * What it does on selection:
 *   1. Optimistically sets `form.setValue('template', id)` so the
 *      rendered surface immediately switches to the new template.
 *   2. Triggers the existing handleSave (same pipeline as Ctrl+S
 *      and the Save button) so the new template persists in the DB
 *      and the URL revalidates.
 *   3. Disables itself while a save is in flight (so a rapid
 *      double-click doesn't pile on two concurrent saves).
 *
 * No new Server Action is needed: the template field is part of
 * the ResumeData envelope, saveResumeAction already updates the
 * `resumes.template` column on the new revision.
 *
 * Tier gating (Phase 6+): when we add paid templates, the
 * dropdown will show a "Locked" affordance + a tooltip pointing at
 * the upgrade page when the user picks a `tier: 'pro'` template
 * they're not entitled to. For now both templates are free, so the
 * `tier` badge is purely informational.
 */

import * as React from "react";
import { Check, ChevronsUpDown, Sparkles, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useFormContext } from "react-hook-form";

import { listTemplates } from "./index";
import type { ResumeTemplate } from "./types";
import type { ResumeData } from "@/lib/resume-schema";

interface TemplatePickerProps {
  /**
   * Called right after the form value is updated and the save is
   * dispatched. Parent uses this to surface a "Template switched"
   * toast in Phase 2.5. Optional — leave undefined to ignore.
   */
  onTemplatePicked?: (templateId: string) => void;
  /**
   * Parent-owned save trigger. The picker can't reach into the
   * DOM to find the form (any <form> on the page — including a
   * portal-rendered EditableSectionDialog — would shadow it),
   * so the parent supplies the trigger that already knows the
   * right handleSubmit path.
   *
   * Example from `editable-resume.tsx`:
   *
   *   <TemplatePicker
   *     requestSave={() => formRef.current?.requestSubmit()}
   *     onTemplatePicked={(id) => toast.success(`Template: ${id}`)}
   *   />
   */
  requestSave: () => void;
  /** Disable the picker (e.g. while a save is in flight). */
  disabled?: boolean;
}

export function TemplatePicker({
  onTemplatePicked,
  requestSave,
  disabled = false
}: TemplatePickerProps) {
  const form = useFormContext<ResumeData>();
  const templates = listTemplates();
  const currentId = form.watch("template") ?? templates[0]?.meta.id;
  const current = templates.find((t) => t.meta.id === currentId) ?? templates[0];

  function pickTemplate(t: ResumeTemplate) {
    if (t.meta.id === currentId) return;
    // Optimistic update — the rendered template swaps immediately.
    form.setValue("template", t.meta.id, {
      shouldDirty: true,
      shouldValidate: false
    });
    onTemplatePicked?.(t.meta.id);
    // Parent's save trigger; we deliberately do NOT call
    // `document.querySelector('form').requestSubmit()` — that's
    // ambiguous (any <form> rendered via portal shadows it).
    requestSave();
  }

  if (!current) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2"
          data-testid="template-picker-trigger"
        >
          <span className="text-xs text-muted-foreground">Template</span>
          <span className="font-medium" data-testid="template-picker-current">
            {current.meta.name}
          </span>
          <span className="text-[10pt] text-muted-foreground">
            v{current.meta.version}
          </span>
          <ChevronsUpDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-72"
        data-testid="template-picker-content"
      >
        <DropdownMenuLabel className="text-[10pt] uppercase tracking-wider text-muted-foreground">
          Choose template
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {templates.map((t) => (
          <TemplateMenuItem
            key={t.meta.id}
            template={t}
            selected={t.meta.id === currentId}
            onSelect={() => pickTemplate(t)}
          />
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-2 text-[10pt] text-muted-foreground">
          New templates ship in the dashboard gallery. The picker
          updates the rendered preview and saves automatically.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TemplateMenuItem({
  template,
  selected,
  onSelect
}: {
  template: ResumeTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className="flex flex-col items-start gap-1 py-2"
      data-testid={`template-picker-item-${template.meta.id}`}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="font-medium">{template.meta.name}</span>
          <span className="text-[10pt] text-muted-foreground">
            v{template.meta.version}
          </span>
        </span>
        <span className="flex items-center gap-1">
          {template.meta.tier === "pro" && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9pt] font-medium uppercase tracking-wider text-amber-800"
              data-testid={`template-tier-${template.meta.id}`}
            >
              <Sparkles className="size-2.5" />
              Pro
            </span>
          )}
          {template.meta.atsSafe && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9pt] font-medium uppercase tracking-wider text-emerald-800"
              title="This template uses a single-column layout with standard section headings — parses cleanly in Workday, Greenhouse, Lever, Taleo."
            >
              <ShieldCheck className="size-2.5" />
              ATS
            </span>
          )}
          {selected && <Check className="size-3.5 text-primary" />}
        </span>
      </div>
      {template.meta.description && (
        <span
          className={cn(
            "text-[11pt] leading-tight",
            selected ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {template.meta.description}
        </span>
      )}
      {template.meta.tags.length > 0 && (
        <span className="flex flex-wrap gap-1 text-[9pt] text-muted-foreground">
          {template.meta.tags.map((t) => (
            <span
              key={t}
              className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5"
            >
              {t}
            </span>
          ))}
        </span>
      )}
    </DropdownMenuItem>
  );
}
