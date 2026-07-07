'use client';

import { cn } from '@/lib/utils';

export interface EditorTab {
  id: string;
  label: string;
}

/**
 * Pill-style tab bar for the resume editor. Local state lives in the
 * parent — this component is just the visual control + ARIA wiring.
 *
 * We use `data-state` instead of `aria-selected` so Tailwind's
 * data-state variants can drive the active styling.
 */
export function EditorTabs({
  tabs,
  activeTab,
  onChange
}: {
  tabs: readonly EditorTab[];
  activeTab: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Resume sections"
      className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`editor-panel-${tab.id}`}
            data-state={isActive ? 'active' : 'inactive'}
            data-testid={`editor-tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
              'data-[state=inactive]:hover:bg-background/50'
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}