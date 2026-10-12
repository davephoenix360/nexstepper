'use client';

/**
 * Client island for the Design Lab at /dev/design-lab.
 *
 * The route's page is a server component that reads `searchParams`
 * and passes the initial `printSettings` down here. The page is
 * server because (a) `searchParams` is a server-component prop and
 * (b) `metadata` exports (noindex) are server-only. This island
 * owns the live state, the print-settings panel, and the template
 * rendering — everything that needs to be interactive or hooks
 * into the template registry.
 *
 * The template components in the registry are 'use client', so they
 * can only be instantiated from a client tree. Splitting the page
 * this way lets the server handle the static parts (chrome,
 * metadata, noindex) and the client handle the interactive parts
 * without any server-to-client function-prop errors.
 */

import { useState } from 'react';

import { listTemplates } from '@/components/resume-templates';
import { gallerySampleResumeData } from '@/lib/resume-schema/sample';
import {
  DEFAULT_PRINT_SETTINGS,
  FONT_SIZE_PRESETS,
  FONT_SIZE_VALUES,
  LINE_HEIGHT_PRESETS,
  LINE_HEIGHT_VALUES,
  MARGIN_PRESETS,
  MARGIN_PRESET_VALUES,
  SECTION_SPACING_PRESETS,
  SECTION_SPACING_VALUES,
  coercePrintSettings,
  printSettingsToCssVars,
  type FontSizePreset,
  type LineHeightPreset,
  type MarginPreset,
  type PrintSettings,
  type SectionSpacingPreset
} from '@/lib/print-settings';

const TEMPLATES = listTemplates();

export function DesignLabClient({
  initialSettings
}: {
  /**
   * Coerced print settings parsed from the URL by the server
   * component. The server is the source of truth on first paint so
   * the initial render already reflects ?margin=compact&... without
   * a flash of defaults — `useSearchParams()` in a client
   * component alone is brittle on the SSR boundary.
   */
  initialSettings: PrintSettings;
}) {
  const [settings, setSettings] = useState<PrintSettings>(initialSettings);

  function update<K extends keyof PrintSettings>(
    key: K,
    value: PrintSettings[K]
  ): void {
    const next = { ...settings, [key]: value };
    setSettings(next);
    writeToUrl(next);
  }

  // The same wrapper shape the editor + preview use — keeping them
  // aligned means a visual change here proves it'll look the same in
  // the real product. The four `--resume-*` vars are consumed by
  // both the on-screen `:where(.printable)` rules and the printed
  // `@page { margin }` rule.
  const cssVars = printSettingsToCssVars(settings);

  return (
    <>
      <PrintSettingsPanel
        settings={settings}
        onUpdate={update}
        onReset={() => {
          setSettings(DEFAULT_PRINT_SETTINGS);
          writeToUrl(DEFAULT_PRINT_SETTINGS);
        }}
      />

      <div
        className="mx-auto max-w-[8.5in] printable"
        style={cssVars}
        data-testid="design-lab-printable"
      >
        {TEMPLATES.map((t) => {
          const Component = t.Component;
          const ts = t.meta;
          return (
            <section
              key={ts.id}
              id={`tpl-${ts.id}`}
              className="scroll-mt-20"
            >
              <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-300 pb-2">
                <h2 className="text-lg font-semibold text-zinc-900">
                  {ts.name}
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    v{ts.version} · {ts.tier}
                  </span>
                </h2>
                <span className="text-[11px] text-zinc-500">
                  {ts.atsSafe ? 'ATS-safe' : 'visual only'} · {ts.pageSize} ·
                  accent {ts.accent}
                </span>
              </header>
              <div className="rounded bg-white shadow-lg ring-1 ring-zinc-200/60 print:max-w-none print:shadow-none print:ring-0">
                <Component
                  data={gallerySampleResumeData}
                  editable={false}
                />
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function PrintSettingsPanel({
  settings,
  onUpdate,
  onReset
}: {
  settings: PrintSettings;
  onUpdate: <K extends keyof PrintSettings>(
    key: K,
    value: PrintSettings[K]
  ) => void;
  onReset: () => void;
}) {
  return (
    <section
      className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm print:hidden"
      data-testid="design-lab-print-settings"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Print settings
        </span>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] text-zinc-500 underline hover:text-zinc-700"
        >
          Reset
        </button>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
        <PanelSelect
          label="Margin"
          testId="lab-margin"
          value={settings.margin}
          options={MARGIN_PRESETS}
          onChange={(v) => onUpdate('margin', v as MarginPreset)}
          describe={(v) => `${MARGIN_PRESET_VALUES[v]}\u2033`}
        />
        <PanelSelect
          label="Line height"
          testId="lab-line-height"
          value={settings.lineHeight}
          options={LINE_HEIGHT_PRESETS}
          onChange={(v) => onUpdate('lineHeight', v as LineHeightPreset)}
          describe={(v) => `${LINE_HEIGHT_VALUES[v]}×`}
        />
        <PanelSelect
          label="Font size"
          testId="lab-font-size"
          value={settings.fontSize}
          options={FONT_SIZE_PRESETS}
          onChange={(v) => onUpdate('fontSize', v as FontSizePreset)}
          describe={(v) => `${FONT_SIZE_VALUES[v]}pt`}
        />
        <PanelSelect
          label="Section spacing"
          testId="lab-section-spacing"
          value={settings.sectionSpacing}
          options={SECTION_SPACING_PRESETS}
          onChange={(v) =>
            onUpdate('sectionSpacing', v as SectionSpacingPreset)
          }
          describe={(v) => SECTION_SPACING_VALUES[v]}
        />
      </div>
    </section>
  );
}

function PanelSelect<T extends string>({
  label,
  testId,
  value,
  options,
  onChange,
  describe
}: {
  label: string;
  testId: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  describe: (v: T) => string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-zinc-600">
      <span className="font-medium text-zinc-700">{label}</span>
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {capitalize(opt)} · {describe(opt)}
          </option>
        ))}
      </select>
    </label>
  );
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : '';
}

/* -------------------------------------------------------------------------- */
/* URL writes — keep the panel shareable and the back button useful.         */
/* -------------------------------------------------------------------------- */

const URL_KEYS: Array<keyof PrintSettings> = [
  'margin',
  'lineHeight',
  'fontSize',
  'sectionSpacing'
];

// We write to the URL with `window.history.replaceState` rather than
// `router.replace` because the latter triggers a route re-render —
// expensive and unnecessary for a value the page is already rendering.
function writeToUrl(settings: PrintSettings): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const key of URL_KEYS) {
    url.searchParams.set(key, settings[key]);
  }
  window.history.replaceState(null, '', url.toString());
}