'use client';

/**
 * TemplateGalleryModal — the new in-editor surface for picking a resume
 * template. Replaces the old compact `<TemplatePicker>` dropdown.
 *
 * Why a modal (not a popover or dropdown)
 *   Five templates today. The user is choosing between visually
 *   distinct layouts; a 72-character dropdown made them pick blind.
 *   A full modal with a 2-column grid gives each template its own
 *   card (name, version, ATS badge, Pro badge, description, tags,
 *   two CTAs) and makes space for a "Preview" CTA on each card that
 *   opens a second stacked modal showing the actual rendered output.
 *
 * Architecture
 *   - The trigger button (`<TemplateGalleryButton>`) lives on the
 *     editor toolbar and shows the currently-active template name +
 *     version. Click → opens the modal.
 *   - The modal renders one `<TemplateCard />` per registered
 *     template.
 *   - Each card has two CTAs:
 *       • "Preview" → opens the stacked `<TemplatePreviewModal>`
 *         with that template rendered against `gallerySampleResumeData`.
 *       • "Use this template" → calls the parent's `onUseTemplate`
 *         (which optimistically updates the form value AND triggers
 *         `requestSave` via the same pipeline the old picker used),
 *         then closes the gallery.
 *   - The currently-active template is marked with a "Current" badge
 *     so the user doesn't accidentally re-select what they have.
 *
 * Why a stacked preview instead of view-switching
 *   View-switching inside one modal requires explicit back navigation
 *   + state machine; stacked dialogs leverage the native `<dialog>`
 *   element's stacking behavior + the existing `<Dialog>` primitive.
 *   Same pattern Linear / Notion / Figma use.
 *
 * Tier-gating (Phase 6+)
 *   When we ship Pro-only templates, the card will show a "Locked"
 *   overlay + a tooltip pointing at the upgrade page instead of a
 *   "Use this template" button. Today every template is `tier: 'free'`,
 *   so the Pro badge is purely informational.
 */

import * as React from 'react';
import { Eye, Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useFormContext } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  listTemplates,
  type ResumeTemplate
} from '@/components/resume-templates';
import type { ResumeData } from '@/lib/resume-schema';
import { TemplateBadges } from './template-preview-modal';
import { TemplatePreviewModal } from './template-preview-modal';

/* --------------------------------------------------------------------- *
 * Trigger button
 * --------------------------------------------------------------------- */

interface TemplateGalleryButtonProps {
  /**
   * Parent-owned save trigger. Same shape as the old
   * `<TemplatePicker>` — the gallery button can't reach into the DOM
   * for the form (any `<form>` on the page would shadow it), so the
   * parent supplies the trigger that already knows the right
   * handleSubmit path.
   */
  requestSave: () => void;
  /** Disable while a save is in flight (avoids piled saves). */
  disabled?: boolean;
}

export function TemplateGalleryButton({
  requestSave,
  disabled = false
}: TemplateGalleryButtonProps) {
  const form = useFormContext<ResumeData>();
  const [open, setOpen] = React.useState(false);
  const templates = listTemplates();
  const currentId = form.watch("template") ?? templates[0]?.meta.id;
  const current = templates.find((t) => t.meta.id === currentId) ?? templates[0];

  function handleUse(templateId: string) {
    if (templateId === currentId) {
      // Same template — just close, don't fire a redundant save.
      setOpen(false);
      return;
    }
    // Optimistic update — the rendered template swaps immediately.
    form.setValue("template", templateId, {
      shouldDirty: true,
      shouldValidate: false
    });
    setOpen(false);
    // Parent's save trigger; we deliberately do NOT call
    // `document.querySelector('form').requestSubmit()` — that's
    // ambiguous (any <form> rendered via portal shadows it).
    requestSave();
  }

  if (!current) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="gap-2"
        data-testid="template-gallery-trigger"
      >
        <span className="text-xs text-muted-foreground">Template</span>
        <span className="font-medium" data-testid="template-gallery-current">
          {current.meta.name}
        </span>
        <span className="text-[10pt] text-muted-foreground">
          v{current.meta.version}
        </span>
        <ChevronsUpDown className="size-3 text-muted-foreground" />
      </Button>
      <TemplateGalleryModal
        open={open}
        onOpenChange={setOpen}
        currentTemplateId={current.meta.id}
        onUseTemplate={handleUse}
      />
    </>
  );
}

/* --------------------------------------------------------------------- *
 * Gallery modal
 * --------------------------------------------------------------------- */

interface TemplateGalleryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTemplateId: string;
  /**
   * Called when the user picks a template. Parent is expected to:
   *   1. update the RHF form value (`setValue('template', id, ...)`),
   *   2. trigger the save pipeline (`requestSave()`),
   *   3. close the gallery (we call `onOpenChange(false)` after).
   * The preview modal can also call this when the user clicks
   * "Use this template" from inside a preview.
   */
  onUseTemplate: (templateId: string) => void;
}

/**
 * Inner content of the gallery modal — the grid of template cards
 * plus the footer hint. Extracted so SSR-based tests can render
 * the grid markup directly without going through the `<Dialog>`
 * portal (which returns null on the server because it requires
 * `document`). The modal itself wires this into `<Dialog>` below.
 */
export function TemplateGalleryGrid({
  currentTemplateId,
  onPreview,
  onUse
}: {
  currentTemplateId: string;
  onPreview: (templateId: string) => void;
  onUse: (templateId: string) => void;
}) {
  const templates = listTemplates();
  return (
    <>
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        data-testid="template-gallery-grid"
      >
        {templates.map((t) => (
          <TemplateCard
            key={t.meta.id}
            template={t}
            isCurrent={t.meta.id === currentTemplateId}
            onPreview={() => onPreview(t.meta.id)}
            onUse={() => onUse(t.meta.id)}
          />
        ))}
      </div>
      <p className="mt-4 text-[10pt] text-muted-foreground">
        Picking a template updates your preview and saves automatically. Use
        “Preview” to see the layout with sample data first.
      </p>
    </>
  );
}

export function TemplateGalleryModal({
  open,
  onOpenChange,
  currentTemplateId,
  onUseTemplate
}: TemplateGalleryModalProps) {
  // Preview-modal state lives here so the preview is a child of the
  // gallery. Stacked dialogs share the React tree but each gets its
  // own `<dialog>` element so native stacking handles the layering.
  const [previewingId, setPreviewingId] = React.useState<string | null>(null);

  // Close the preview first when the user closes the gallery — we
  // don't want a leaked preview modal to survive the gallery's
  // backdrop.
  React.useEffect(() => {
    if (!open) setPreviewingId(null);
  }, [open]);

  const templates = listTemplates();

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={
          <span data-testid="template-gallery-title">Choose a template</span>
        }
        description={
          <span data-testid="template-gallery-description">
            Pick the layout that fits the role you’re applying for. Open a
            preview to see what your resume will look like with sample data
            before you commit.
          </span>
        }
        // Wide enough for a 2-column grid of cards at the modal's
        // default padding. Three columns would cramp the cards.
        widthClassName="max-w-3xl"
        closeLabel="Close gallery"
      >
        <TemplateGalleryGrid
          currentTemplateId={currentTemplateId}
          onPreview={setPreviewingId}
          onUse={onUseTemplate}
        />
      </Dialog>
      <TemplatePreviewModal
        templateId={previewingId}
        open={previewingId !== null}
        onOpenChange={(o) => {
          if (!o) setPreviewingId(null);
        }}
        onUseTemplate={onUseTemplate}
      />
    </>
  );
}

/* --------------------------------------------------------------------- *
 * Card
 * --------------------------------------------------------------------- */

interface TemplateCardProps {
  template: ResumeTemplate;
  isCurrent: boolean;
  onPreview: () => void;
  onUse: () => void;
}

function TemplateCard({
  template,
  isCurrent,
  onPreview,
  onUse
}: TemplateCardProps) {
  return (
    <div
      data-testid={`template-card-${template.meta.id}`}
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-background p-4 transition-colors',
        isCurrent
          ? 'border-primary/60 ring-1 ring-primary/30'
          : 'border-zinc-200 hover:border-zinc-300'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-semibold"
              data-testid={`template-card-name-${template.meta.id}`}
            >
              {template.meta.name}
            </span>
            <span className="text-[10pt] text-muted-foreground">
              v{template.meta.version}
            </span>
          </div>
          {template.meta.description && (
            <span className="mt-1 text-xs leading-snug text-muted-foreground">
              {template.meta.description}
            </span>
          )}
        </div>
        {isCurrent && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10pt] font-medium uppercase tracking-wider text-primary"
            data-testid={`template-card-current-${template.meta.id}`}
          >
            <Check className="size-3" />
            Current
          </span>
        )}
      </div>

      <TemplateBadges template={template} />

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPreview}
          className="gap-1.5"
          data-testid={`template-card-preview-${template.meta.id}`}
        >
          <Eye className="size-3.5" />
          Preview
        </Button>
        <Button
          type="button"
          variant={isCurrent ? 'outline' : 'default'}
          size="sm"
          onClick={onUse}
          disabled={isCurrent}
          className="gap-1.5"
          data-testid={`template-card-use-${template.meta.id}`}
        >
          {isCurrent ? (
            <>
              <Check className="size-3.5" />
              In use
            </>
          ) : (
            'Use this template'
          )}
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- *
 * Re-export the loading-state spinner the editor uses on save, so the
 * gallery + preview can show a transient "switching…" indicator if we
 * ever need one. Currently unused — kept as an escape hatch for the
 * "requestSave fired but the round-trip is slow" UX problem.
 * --------------------------------------------------------------------- */

export function TemplateSaveIndicator({
  pending
}: {
  pending: boolean;
}) {
  if (!pending) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      data-testid="template-save-indicator"
    >
      <Loader2 className="size-3 animate-spin" />
      Saving template…
    </span>
  );
}
