'use client';

import { useState, useTransition, useEffect } from 'react';
import { Sliders, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
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
  printSettingsToCssVars,
  type MarginPreset,
  type FontSizePreset,
  type LineHeightPreset,
  type SectionSpacingPreset,
  type PrintSettings
} from '@/lib/print-settings';

import { updatePrintSettingsAction } from '../actions';

/**
 * Toolbar button + popover for the four per-resume print settings.
 * v1 (Oct 2026). See lib/print-settings.ts for the rationale.
 */
export function PrintSettingsButton({
  resumeId,
  initialSettings,
  onChange
}: {
  resumeId: string;
  initialSettings?: PrintSettings;
  onChange?: (settings: PrintSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [settings, setSettings] = useState<PrintSettings>(
    initialSettings ?? DEFAULT_PRINT_SETTINGS
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialSettings) setSettings(initialSettings);
  }, [initialSettings]);

  function commit(next: PrintSettings) {
    setSettings(next);
    onChange?.(next);
    setError(null);
    startTransition(async () => {
      const result = await updatePrintSettingsAction({
        resumeId,
        settings: next
      });
      if (!result.ok) {
        setSettings(initialSettings ?? DEFAULT_PRINT_SETTINGS);
        onChange?.(initialSettings ?? DEFAULT_PRINT_SETTINGS);
        setError(result.error);
      }
    });
  }

  function update<K extends keyof PrintSettings>(
    key: K,
    value: PrintSettings[K]
  ): void {
    commit({ ...settings, [key]: value });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Print page settings"
          data-testid="print-settings-button"
          data-pending={pending ? 'true' : 'false'}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sliders className="h-4 w-4" />
          )}
          Page settings
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0"
        data-testid="print-settings-popover"
      >
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Print settings</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Applies to this resume only. Variants can differ from
            their master.
          </p>
        </div>

        <div className="space-y-3 px-4 py-4">
          <Field
            label="Page margin"
            description={MARGIN_PRESET_VALUES[settings.margin] + '\u2033 around all sides'}
          >
            <Select
              value={settings.margin}
              onValueChange={(v) => update('margin', v as MarginPreset)}
            >
              <SelectTrigger data-testid="print-margin-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARGIN_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {capitalize(preset)} · {MARGIN_PRESET_VALUES[preset]}&Prime;
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Line height"
            description={LINE_HEIGHT_VALUES[settings.lineHeight] + '\u00d7 font size on body copy'}
          >
            <Select
              value={settings.lineHeight}
              onValueChange={(v) => update('lineHeight', v as LineHeightPreset)}
            >
              <SelectTrigger data-testid="print-line-height-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINE_HEIGHT_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {capitalize(preset)} · {LINE_HEIGHT_VALUES[preset]}×
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Font size"
            description={FONT_SIZE_VALUES[settings.fontSize] + 'pt on body copy'}
          >
            <Select
              value={settings.fontSize}
              onValueChange={(v) => update('fontSize', v as FontSizePreset)}
            >
              <SelectTrigger data-testid="print-font-size-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZE_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {capitalize(preset)} · {FONT_SIZE_VALUES[preset]}pt
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Section spacing"
            description={SECTION_SPACING_VALUES[settings.sectionSpacing] + ' between major sections'}
          >
            <Select
              value={settings.sectionSpacing}
              onValueChange={(v) => update('sectionSpacing', v as SectionSpacingPreset)}
            >
              <SelectTrigger data-testid="print-section-spacing-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_SPACING_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {capitalize(preset)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div
          className="border-t bg-muted/30 px-4 py-3"
          aria-hidden
          data-testid="print-settings-preview"
          style={printSettingsToCssVars(settings)}
        >
          <p className="text-foreground/80 truncate">
            Aa · Sample preview line
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="border-t bg-destructive/5 px-4 py-2 text-xs text-destructive"
            data-testid="print-settings-error"
          >
            {error}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Field({
  label,
  description,
  children
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        <span className="text-[11px] text-muted-foreground/80">{description}</span>
      </div>
      {children}
    </div>
  );
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}
