'use client';

/**
 * TemplatePreviewModal — a stacked dialog that renders a single resume
 * template with `gallerySampleResumeData`, on top of the gallery.
 *
 * Why stacked on the gallery
 *   The gallery ("which template do I want?") and the preview ("what
 *   does this one look like?") serve different mental models.
 *   Stacking keeps the gallery reachable behind the preview — closing
 *   the preview returns the user to the same place they came from.
 *   Same convention as Linear / Notion / Figma.
 *
 * Why `editable={false}` on the template
 *   We don't want any of the editor affordances (X remove buttons,
 *   hover states, "Click to add" placeholders, "Add Work" buttons) to
 *   leak into the preview. The templates already handle this — when
 *   `editable` is omitted they render the read-only view (Classic
 *   delegates to `ClassicReadOnly`; Modern/Minimal/Executive/Creative
 *   use the `Field` abstraction with `editable=false`).
 *
 * Why no form context needed
 *   Same reason. The templates' read-only paths don't call
 *   `useFormContext()`; they read straight from the `data` prop.
 *   So we can drop a `<Template.Component />` into a modal without
 *   wrapping it in `<FormProvider>`.
 *
 * Sizing
 *   US Letter is 8.5in × 11in. We render the template at its natural
 *   width inside a scrolling container so the user can see the
 *   whole page. `max-w-[820px]` ≈ 8.5in at 96dpi; the body is
 *   scrollable for the height. The dialog itself caps at
 *   `max-h-[calc(100dvh-3rem)]` via the existing `<Dialog>` primitive.
 *
 * "Use this template" affordance
 *   The preview modal also exposes the same "Use this template" CTA
 *   that the gallery card does, so a user who lands in the preview
 *   first (e.g. reopens a recently-previewed template) can switch
 *   without backing out to the gallery.
 */

import * as React from 'react';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  listTemplates,
  getTemplate,
  type ResumeTemplate
} from '@/components/resume-templates';
import { gallerySampleResumeData } from '@/lib/resume-schema/sample';
import { ShieldCheck, Sparkles } from 'lucide-react';

interface TemplatePreviewModalProps {
  /** Id of the template to preview. Must be a key in the registry. */
  templateId: string | null;
  /** Controlled open state. */
  open: boolean;
  /** Called when the user dismisses the preview (Esc / backdrop / X). */
  onOpenChange: (open: boolean) => void;
  /**
   * Called when the user picks this template from the preview modal's
   * CTA. The gallery modal listens for this and forwards it to the
   * parent's `requestSave` pipeline.
   */
  onUseTemplate?: (templateId: string) => void;
}

export function TemplatePreviewModal({
  templateId,
  open,
  onOpenChange,
  onUseTemplate
}: TemplatePreviewModalProps) {
  // Resolve the template eagerly — we need it for the title even when
  // the modal is closed (so the next open has a fresh title). When
  // `templateId` is null, fall back to the first registered template
  // so the title doesn't go blank.
  const template = React.useMemo(
    () => getTemplate(templateId),
    [templateId]
  );
  // Refuse to render the modal body if the requested template doesn't
  // exist; we still let the dialog close cleanly via onOpenChange.
  const isKnown = templateId
    ? listTemplates().some((t) => t.meta.id === templateId)
    : false;

  function handleUse() {
    if (!templateId) return;
    onUseTemplate?.(templateId);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span data-testid="template-preview-title">
          Preview · {template.meta.name}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            v{template.meta.version}
          </span>
        </span>
      }
      description={
        <span data-testid="template-preview-description">
          {template.meta.description}
        </span>
      }
      // Wide enough to fit US Letter (~820px = 8.5in at 96dpi). The
      // dialog's own height cap handles tall resumes; the body
      // scrolls.
      widthClassName="max-w-[860px]"
      closeLabel="Close preview"
    >
      <TemplatePreviewBody
        template={template}
        isKnown={isKnown}
        onBack={() => onOpenChange(false)}
        onUse={handleUse}
      />
    </Dialog>
  );
}

/**
 * The body of the preview modal — badges, the rendered template frame,
 * and the action row. Extracted from the modal so SSR-based tests can
 * render the preview markup directly without going through the
 * `<Dialog>` portal.
 */
export function TemplatePreviewBody({
  template,
  isKnown,
  onBack,
  onUse
}: {
  template: ResumeTemplate;
  isKnown: boolean;
  onBack: () => void;
  onUse: () => void;
}) {
  return (
    <>
      <TemplateBadges template={template} className="mb-3" />
      <div
        // White background mirrors the printable render so the preview
        // looks like a real page, not the dashboard chrome. Border +
        // shadow give it the "sheet of paper" affordance. `mx-auto`
        // centers it inside the dialog body.
        data-testid="template-preview-frame"
        className="mx-auto max-h-[calc(100dvh-22rem)] overflow-auto rounded-md border border-zinc-200 bg-white shadow-sm"
      >
        {isKnown ? (
          <RenderedTemplate template={template} />
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Pick a template to preview.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBack}
          data-testid="template-preview-close"
        >
          Back to gallery
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onUse}
          disabled={!isKnown}
          data-testid="template-preview-use"
        >
          Use this template
        </Button>
      </div>
    </>
  );
}

/**
 * Render the chosen template with sample data.
 *
 * Why a tiny inner component: keeps the registry import surface tight
 * and lets us short-circuit the "unknown template" case without
 * scattering null checks through the parent.
 */
function RenderedTemplate({ template }: { template: ResumeTemplate }) {
  const Template = template.Component;
  // `editable` is omitted so the template renders its read-only path —
  // no editor hooks, no form context needed.
  return <Template data={gallerySampleResumeData} />;
}

/**
 * The badges row that mirrors what each card in the gallery shows.
 * Lives in its own component so both the preview and the card can
 * render the same chip set without duplicating markup.
 */
export function TemplateBadges({
  template,
  className
}: {
  template: ResumeTemplate;
  className?: string;
}) {
  return (
    <div
      className={
        'flex flex-wrap items-center gap-2 text-xs text-muted-foreground'
      }
      data-testid={`template-badges-${template.meta.id}`}
    >
      {template.meta.atsSafe && (
        <Badge
          variant="outline"
          className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
          data-testid={`template-ats-badge-${template.meta.id}`}
        >
          <ShieldCheck className="size-3" />
          ATS-safe
        </Badge>
      )}
      {template.meta.tier === 'pro' && (
        <Badge
          variant="outline"
          className="gap-1 border-amber-200 bg-amber-50 text-amber-700"
          data-testid={`template-pro-badge-${template.meta.id}`}
        >
          <Sparkles className="size-3" />
          Pro
        </Badge>
      )}
      <span className="text-[10pt] uppercase tracking-wider text-muted-foreground">
        {template.meta.category}
      </span>
      {template.meta.tags.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {template.meta.tags.map((t) => (
            <span
              key={t}
              className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10pt] text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </span>
      )}
      <span className={className} />
    </div>
  );
}
