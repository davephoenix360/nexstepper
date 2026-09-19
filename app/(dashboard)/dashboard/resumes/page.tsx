import { FileText } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

import { getUser, listResumes } from '@/lib/db/queries';
import { CreateMasterResumeForm } from './_components/create-master-form';
import { ResumeList } from './_components/resume-list';

/**
 * Resume list page — variant-first UX (plan: docs/plans/variant-first-ux.md).
 *
 *   - Masters render as compact library cards. Variants render as
 *     rows nested under their master, linking to the variant editor.
 *   - The "Create a master" affordance lives at the top of the page,
 *     not inside the list. Variant creation is per-master.
 *   - No redirect on unauthed visitors — matches the dashboard home's
 *     pattern of rendering an empty state.
 *
 * Server Component: `listResumes()` (lib/db/queries.ts) returns the
 * already-grouped master→variant tree in one round trip. We never
 * re-fetch per row.
 */
export default async function ResumesPage() {
  const user = await getUser();
  const families = user ? await listResumes(user.id) : [];

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <header>
        <h1 className="text-lg lg:text-2xl font-medium">Resumes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {families.length === 0
            ? 'Build a master, then tailor variants for specific roles.'
            : 'Your masters are the source of truth. Variants branch off each one for specific roles.'}
        </p>
      </header>

      <CreateMasterResumeForm />

      {families.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No resumes yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create your first master above to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ResumeList families={families} />
      )}
    </section>
  );
}