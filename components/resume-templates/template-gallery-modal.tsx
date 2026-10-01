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
import {
  Eye,
  Check,
  ChevronsUpDown,
  Loader2,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { useFormContext } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  listTemplates,
  type ResumeTemplate
} from '@/components/resume-templates';
import type { ResumeData } from '@/lib/resume-schema';
import { TemplatePreviewModal } from './template-preview-modal';
import { TemplateThumbnail } from './template-thumbnail';

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
      {/* Reassurance strip — every shipped template is ATS-safe by
          default, so we tell the user once instead of repeating the
          badge in every card header. Also reminds them the pick is
          auto-saved (same info as the old footer line, but framed
          positively). */}
      <div
        className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-[10pt] text-muted-foreground"
        data-testid="template-gallery-footer"
      >
        <span className="inline-flex items-center gap-1.5 text-emerald-700">
          <ShieldCheck className="size-3" />
          Every template is ATS-safe by default
        </span>
        <span className="text-zinc-300">·</span>
        <span>Picking a template saves automatically.</span>
      </div>
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
          <span
            className="flex items-baseline gap-2"
            data-testid="template-gallery-title"
          >
            <span>Choose a template</span>
            <span
              className="text-xs font-normal text-muted-foreground"
              data-testid="template-gallery-count"
            >
              {templates.length} layouts
            </span>
          </span>
        }
        description={
          <span data-testid="template-gallery-description">
            Pick the layout that fits the role you’re applying for. Open a
            preview to see what your resume will look like with sample data
            before you commit.
          </span>
        }
        // Wide enough for a 2-column grid of cards with the visual
        // thumbnail at the top. Three columns would cramp the cards
        // on the typical 1280px viewport the editor runs in.
        widthClassName="max-w-4xl"
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
 *
 * Layout (top → bottom):
 *   1. Visual thumbnail (5:3 aspect, paper feel, template accent color)
 *   2. Header row: template name + version, with a filled "Current"
 *      chip in the corner if this card is the active template
 *   3. One-line description (clamped to 2 lines via line-clamp-2)
 *   4. Compact metadata row: tier badge, category label, ATS-safe badge
 *      (the existing TemplateBadges, but condensed for the card scale)
 *   5. Tag chips — small, subtle, one row max
 *   6. Action row: "Preview" (outline) + "Use this template" (primary)
 *      or "In use" (filled) when this is the active card
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
        'group relative flex flex-col overflow-hidden rounded-xl border bg-background transition-all',
        isCurrent
          ? // Filled background + ring gives the active card a clear
            // "this is your current pick" affordance that doesn't
            // depend on reading the "Current" badge.
            'border-primary/50 bg-primary/[0.04] shadow-sm ring-1 ring-primary/20'
          : 'border-zinc-200 hover:border-zinc-300 hover:shadow-sm'
      )}
    >
      {/* Thumbnail area — the visual hook that differentiates the
          templates at a glance. The aspect ratio is locked to 5:3
          so all five cards stay aligned regardless of which
          template they hold. */}
      <div
        className={cn(
          'relative overflow-hidden border-b',
          isCurrent ? 'border-primary/15' : 'border-zinc-200'
        )}
        data-testid={`template-thumbnail-${template.meta.id}`}
      >
        <TemplateThumbnail
          templateId={template.meta.id}
          accent={template.meta.accent}
          className="block h-auto w-full"
        />
        {/* Top-right "Current" badge — sits on top of the thumbnail
            so it's the first thing the eye lands on. We float it
            instead of pinning it inside the card body so the active
            state reads from across the grid (the user can see at a
            glance which card is theirs without reading text). */}
        {isCurrent && (
          <span
            className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10pt] font-medium text-primary-foreground shadow-sm"
            data-testid={`template-card-current-${template.meta.id}`}
          >
            <Check className="size-3" />
            Current
          </span>
        )}
        {/* "Pro" badge in the top-left — preempts the price shock
            for paid tiers before the user clicks. Today every
            template is free, so this slot is empty. */}
        {template.meta.tier === 'pro' && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-1 text-[10pt] font-medium text-white shadow-sm">
            <Sparkles className="size-3" />
            Pro
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Title row — bigger name, subtle version */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span
              className="text-base font-semibold tracking-tight text-foreground"
              data-testid={`template-card-name-${template.meta.id}`}
            >
              {template.meta.name}
            </span>
            <span className="text-[10pt] font-medium text-muted-foreground">
              v{template.meta.version}
            </span>
          </div>
        </div>

        {/* Description — clamp to 2 lines so a long description
            doesn't push the action buttons down and create uneven
            card heights in the grid. */}
        {template.meta.description && (
          <p
            className={cn(
              'text-xs leading-relaxed text-muted-foreground',
              'line-clamp-2'
            )}
          >
            {template.meta.description}
          </p>
        )}

        {/* Inline meta row — category label + ATS-safe badge, all
            on a single line so the card stays compact. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10pt]">
          <span
            className="font-medium uppercase tracking-wider text-muted-foreground"
            data-testid={`template-card-category-${template.meta.id}`}
          >
            {template.meta.category}
          </span>
          {template.meta.atsSafe && (
            <span
              className="inline-flex items-center gap-1 font-medium text-emerald-700"
              data-testid={`template-card-ats-${template.meta.id}`}
            >
              <ShieldCheck className="size-3" />
              ATS-safe
            </span>
          )}
        </div>

        {/* Tag chips — smaller + more subtle than the modal's badge
            row so they don't compete with the description. We rely
            on flex-wrap so tags flow naturally; if a template has
            4+ tags, the second row pushes the action buttons down,
            but the `mt-auto` on the action row keeps the buttons
            pinned to the bottom so cards stay aligned. */}
        {template.meta.tags.length > 0 && (
          <div
            className="flex flex-wrap gap-1"
            data-testid={`template-card-tags-${template.meta.id}`}
          >
            {template.meta.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[9pt] text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Actions — Preview (outline-secondary) + Use (primary,
            or "In use" filled-disabled on the active card). */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
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
          {isCurrent ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled
              className="gap-1.5"
              data-testid={`template-card-use-${template.meta.id}`}
            >
              <Check className="size-3.5" />
              In use
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onUse}
              className="gap-1.5"
              data-testid={`template-card-use-${template.meta.id}`}
            >
              Use this template
            </Button>
          )}
        </div>
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
