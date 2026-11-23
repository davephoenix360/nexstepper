'use client';

/**
 * Publishes the measured, bullet-level ATS issues to the editor.
 *
 * This is deliberately derived from the `issues` prop on every render.
 * Copying it into `useState` would freeze the markers at mount, so a
 * Recompute or a Scout edit would refresh the scorecard while leaving
 * stale icons beside the bullets — the same class of bug as
 * `useForm({ defaultValues })` being treated as reactive.
 */

import * as React from 'react';

import {
  groupIssuesByPath,
  type BulletIssue
} from '@/lib/scoring/bullet-issues';

type VariantIssuesContextValue = {
  issues: readonly BulletIssue[];
  issuesByPath: ReadonlyMap<string, readonly BulletIssue[]>;
};

export const EMPTY_BULLET_ISSUES: readonly BulletIssue[] = [];
const EMPTY_BY_PATH: ReadonlyMap<string, readonly BulletIssue[]> = new Map();

const VariantIssuesContext = React.createContext<VariantIssuesContextValue>({
  issues: EMPTY_BULLET_ISSUES,
  issuesByPath: EMPTY_BY_PATH
});

export function VariantIssuesProvider({
  issues,
  children
}: {
  issues: BulletIssue[];
  children: React.ReactNode;
}) {
  const value = React.useMemo<VariantIssuesContextValue>(
    () => ({
      issues,
      issuesByPath: groupIssuesByPath(issues)
    }),
    [issues]
  );

  return (
    <VariantIssuesContext.Provider value={value}>
      {children}
    </VariantIssuesContext.Provider>
  );
}

export function useVariantIssues(): VariantIssuesContextValue {
  return React.useContext(VariantIssuesContext);
}

/**
 * Issues for one dotted editor path. `BulletList` calls this for every
 * bullet; paths that were not measured by the persisted snapshot get the
 * shared empty array, so no icon is rendered without evidence.
 */
export function useBulletIssues(path: string): readonly BulletIssue[] {
  const { issuesByPath } = useVariantIssues();
  return issuesByPath.get(path) ?? EMPTY_BULLET_ISSUES;
}
