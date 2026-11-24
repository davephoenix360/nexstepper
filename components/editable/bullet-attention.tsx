'use client';

/**
 * The measured ATS issue beside a work bullet.
 *
 * The icon is an editor affordance only: it is a sibling of `EditableText`
 * (never a child, so text readers do not pick up its label), it carries
 * `no-print`, and it is not rendered by any read-only template path.
 *
 * Clicking it sends a bullet-specific request straight to Scout through
 * the normal chat pipeline. There is no intermediate AI modal.
 */

import * as React from 'react';
import { AlertCircle } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { useChatHandoff } from '@/components/chat/chat-handoff-provider';
import { buildBulletImprovementPrompt } from '@/lib/chat/bullet-improvement-prompt';
import type { BulletIssue } from '@/lib/scoring/bullet-issues';

export function BulletAttention({
  path,
  issues
}: {
  path: string;
  issues: readonly BulletIssue[];
}) {
  const { askScout } = useChatHandoff();

  // `buildBulletIssues()` groups by path, so this component always has at
  // least one issue. The first one carries the exact targeting coordinates;
  // when two criteria flag the same bullet, the tooltip explains both.
  const firstIssue = issues[0];
  if (!firstIssue) return null;

  const label = issues.map((issue) => issue.dimensionLabel).join(' + ');

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    askScout({
      prompt: buildBulletImprovementPrompt(firstIssue!),
      label: `Improve this ${label} bullet`,
      targetPath: path
    });
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          onMouseDown={(event) => event.preventDefault()}
          aria-label={`ATS issue with ${label}: ${firstIssue.reason} Ask Scout to improve this bullet.`}
          data-testid={`bullet-issue-${path}`}
          className="no-print mr-1 inline-flex size-4 shrink-0 translate-y-[1px] items-center justify-center rounded-full text-amber-600 transition-colors hover:bg-amber-100 hover:text-amber-800 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:text-amber-400 dark:hover:bg-amber-950"
        >
          <AlertCircle className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="no-print max-w-xs space-y-1 text-left">
        <p className="font-semibold">ATS issue on this bullet</p>
        {issues.map((issue) => (
          <p key={issue.criterion}>
            <span className="font-medium">{issue.dimensionLabel}:</span>{' '}
            {issue.reason} {issue.fix}
          </p>
        ))}
        <p className="opacity-80">Click to ask Scout to improve it.</p>
      </TooltipContent>
    </Tooltip>
  );
}
