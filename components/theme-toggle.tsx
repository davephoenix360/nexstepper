'use client';

/**
 * ThemeToggle — 3-way dropdown (light / dark / system) for the header.
 *
 * Renders the icon of the currently *resolved* theme so the user always
 * sees what they're getting. Selecting an option writes to localStorage
 * and immediately applies the class on <html>.
 */

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useTheme, type Theme } from './theme-provider';

const OPTIONS: Array<{
  value: Theme;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor }
];

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const Icon =
    theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Theme: ${theme} (currently ${resolvedTheme}). Click to change.`}
          data-testid="theme-toggle"
        >
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, label, icon: ItemIcon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            data-testid={`theme-option-${value}`}
          >
            <ItemIcon className="mr-2 size-4" />
            {label}
            {theme === value && (
              <span className="ml-auto text-xs text-muted-foreground">
                ✓
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}