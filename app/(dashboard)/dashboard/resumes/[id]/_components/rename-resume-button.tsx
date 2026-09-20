'use client';

import { GitBranch } from 'lucide-react';

import { InlineRename } from '@/components/editable/inline-rename';
import { renameResumeAction } from '../../actions';

/**
 * Client-side rename wrapper for the variant editor header. The
 * parent page is a Server Component, so it hands us the resume id +
 * initial name; we render the pencil + inline edit affordance.
 *
 * Used for both masters (where renaming matters less but is allowed)
 * and variants (the headline case — variants were created without
 * an editable name before this session).
 */
export function RenameResumeControl({
  resumeId,
  initialName,
  showBranchIcon = false
}: {
  resumeId: string;
  initialName: string;
  /** Show the GitBranch icon next to the name for variants. */
  showBranchIcon?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      {showBranchIcon && (
        <GitBranch className="h-5 w-5 text-muted-foreground" />
      )}
      <InlineRename
        initialName={initialName}
        resumeId={resumeId}
        testId="rename-resume"
        inputTestId="rename-resume-input"
        fieldName="name"
        className="text-lg lg:text-2xl font-medium"
        action={renameResumeAction}
      />
    </span>
  );
}
