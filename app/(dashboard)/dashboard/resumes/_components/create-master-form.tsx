'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';

import { createMasterResumeAction } from '../actions';

/**
 * Inline form at the top of /dashboard/resumes. Posts to the
 * createMasterResumeAction server action, surfaces validation errors
 * inline, then redirects back to the list so the new master appears
 * at the top.
 *
 * Slice 2 (editor) will swap the redirect target to
 * `/dashboard/resumes/${result.data.id}/edit`.
 */
export function CreateMasterResumeForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '');

    startTransition(async () => {
      const result = await createMasterResumeAction({ name });
      if (!result.ok) {
        setError(
          result.fieldErrors?.name?.[0] ??
            result.error ??
            'Could not create resume'
        );
        return;
      }
      // Refetch the list so the new master shows up immediately.
      router.push('/dashboard/resumes');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a master resume</CardTitle>
        <CardDescription>
          Your master is the source of truth. Tailored variants branch off it
          for specific roles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5 flex-1">
            <Label htmlFor="resume-name">Resume name</Label>
            <Input
              id="resume-name"
              name="name"
              type="text"
              placeholder="e.g. Staff Engineer — General"
              maxLength={100}
              required
              disabled={pending}
            />
          </div>
          <Button type="submit" disabled={pending}>
            <Plus className="h-4 w-4" />
            {pending ? 'Creating...' : 'Create'}
          </Button>
        </form>
        {error && (
          <p className="text-sm text-destructive mt-3" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
