'use client';

/**
 * Client island for /dev/design-lab/reorder.
 *
 * Mounts a RHF form seeded with `gallerySampleResumeData`, wraps a
 * `<ModernTemplate editable />` in `<FormProvider>`, and renders a
 * live "Current order" sidebar that re-reads the same array paths
 * after each drag so a reviewer can confirm in the browser that:
 *
 *  1. A drag actually changes the order (work items, projects,
 *     education entries, nested positions inside a work entry,
 *     skills, languages, interests, etc.).
 *  2. The keyboard drag path works (Tab to a handle, Space to
 *     pick up, Arrow Up/Down to move, Space to drop).
 *  3. The handle is hidden from print (Cmd/Ctrl+P after dragging).
 *
 * The client side does NOT mutate the form back into the gallery
 * sample — drag changes are session-local to this page reload.
 * That's intentional: this is a verification surface, not a save
 * pipeline.
 */

import * as React from 'react';
import { useForm, FormProvider } from 'react-hook-form';

import { getTemplate } from '@/components/resume-templates';
import { gallerySampleResumeData } from '@/lib/resume-schema/sample';
import type { ResumeData } from '@/lib/resume-schema';

export function ReorderLabClient({
  templateId = 'modern'
}: {
  templateId?: string;
}) {
  // Resolved from the registry rather than hardcoded, so any template
  // can be mounted with `editable` via `?template=<id>`. This route
  // started out Modern-only; Jake's editor surface (click-to-edit
  // header contact, drag handles on its own chrome) is not verifiable
  // on the read-only /dev/design-lab page at all.
  const Template = getTemplate(templateId).Component;

  const form = useForm({
    // Resolved on the client, but the gallery sample is fully
    // deterministic (no Date.now() / Math.random()), so SSR +
    // client render the same value.
    defaultValues: gallerySampleResumeData as unknown as never,
    mode: 'onSubmit'
  });

  // The `as never` cast above widens the form's API; we read the
  // arrays through a loose `watch` shape so the sidebar stays in
  // sync with the form after each drag. `watch` triggers a
  // re-render when any nested entry changes — exactly what we
  // need here. Same pattern as
  // `components/editable/editable-resume.tsx` uses for the
  // template-reactive `form.watch('template')` call.
  const looseForm = form as unknown as {
    watch: (n: string) => unknown;
    reset: (v: never) => void;
  };
  const work = looseForm.watch('sections.work');
  const projects = looseForm.watch('sections.projects');
  const education = looseForm.watch('sections.education');
  const skills = looseForm.watch('sections.skills');

  function reset() {
    looseForm.reset(gallerySampleResumeData as unknown as never);
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_22rem]">
      {/* The actual template render — editable, drag handles visible. */}
      <div className="rounded bg-white shadow-lg ring-1 ring-zinc-200/60">
        <FormProvider {...form}>
          <Template
            data={form.watch() as unknown as ResumeData}
            editable
          />
        </FormProvider>
      </div>

      {/* Sidebar: live order readout + reset + instructions. */}
      <aside
        className="no-print sticky top-24 self-start space-y-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-sm"
        data-testid="reorder-lab-sidebar"
      >
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            How to test
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-700">
            <li>
              <strong>Mouse:</strong> click and hold the grip handle on
              the left of any row, drag, drop on another row.
            </li>
            <li>
              <strong>Keyboard:</strong> Tab to a grip handle, press
              Space, Arrow Up/Down to move, Space to drop. dnd-kit
              announces each step via the screen reader.
            </li>
            <li>
              The handles are <code className="text-[11px]">no-print</code> —
              Cmd/Ctrl+P shows a clean resume without any drag
              chrome.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Live order (re-renders on drag)
          </h2>

          <OrderList label="Work entries" items={work as unknown as Array<{ company: string }> | undefined} get={(e) => e.company} />
          <OrderList label="Projects" items={projects as unknown as Array<{ name: string }> | undefined} get={(e) => e.name} />
          <OrderList label="Education" items={education as unknown as Array<{ institution: string }> | undefined} get={(e) => e.institution} />
          <OrderList label="Skills" items={skills as unknown as Array<{ name: string }> | undefined} get={(e) => e.name} />
        </section>

        <section>
          <button
            type="button"
            onClick={reset}
            data-testid="reorder-lab-reset"
            className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Reset to gallery sample
          </button>
        </section>
      </aside>
    </div>
  );
}

interface OrderItem {
  [key: string]: unknown;
}

/**
 * Read-only list of `items` rendered in their current order, with
 * numeric prefix so a drag-induced swap is visible (e.g. "1. Loom
 * Systems" → after dragging Pagerly above Loom: "1. Pagerly, 2.
 * Loom Systems"). Each item shows the supplied key/label plus its
 * 1-based position. Empty when the section has no entries.
 */
function OrderList<T extends OrderItem>({
  label,
  items,
  get
}: {
  label: string;
  items: T[] | undefined;
  get: (item: T) => string;
}) {
  if (!items || items.length === 0) {
    return (
      <div className="mt-3" data-testid={`reorder-list-${label}`}>
        <p className="text-[11px] font-semibold text-zinc-700">
          {label}
        </p>
        <p className="text-[11px] italic text-zinc-400">(empty)</p>
      </div>
    );
  }
  return (
    <div className="mt-3" data-testid={`reorder-list-${label}`}>
      <p className="text-[11px] font-semibold text-zinc-700">{label}</p>
      <ol className="mt-1 space-y-0.5 text-[11px] text-zinc-700">
        {items.map((item, i) => (
          <li key={i} data-testid={`reorder-list-${label}-${i}`}>
            <span className="font-mono text-zinc-400">{i + 1}.</span>{' '}
            <span>{get(item)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
