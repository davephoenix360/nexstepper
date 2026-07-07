'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { createVariantAction } from '../actions';

/**
 * "Tailor this for a job" button on a master resume. Posts to
 * createVariantAction; on success navigates to the new variant's
 * editor so the user can immediately tweak it.
 *
 * Slice 2 doesn't ask for a job-context input yet — Phase 3 will surface
 * a JD-capture step before the variant is created. For now, the variant
 * is a deep copy of the master and the user edits from there.
 */
export function CreateVariantButton({ masterId }: { masterId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await createVariantAction({ masterId });
      if (!result.ok) {
        setError(result.error ?? 'Could not create variant');
        return;
      }
      router.push(`/dashboard/resumes/${result.data.id}`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={handleClick} disabled={pending} variant="outline">
        <GitBranch className="mr-2 h-4 w-4" />
        {pending ? 'Creating variant...' : 'Tailor this for a job'}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}