import Link from 'next/link';
import { FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';

import { getUser, listResumes } from '@/lib/db/queries';
import { CreateMasterResumeForm } from './_components/create-master-form';

/**
 * Resume list page — masters and their variants, grouped by family.
 *
 * Slice 1: create form is inline at the top; the master cards link
 * to a disabled "coming next" target because `/dashboard/resumes/[id]`
 * (the editor) lands in slice 2.
 *
 * No redirect on unauthed visitors — matches the dashboard home's
 * pattern of rendering an empty state. Once Phase 1 is fully shipped
 * we can tighten this to require an active session.
 */
export default async function ResumesPage() {
  const user = await getUser();
  const families = user ? await listResumes(user.id) : [];

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <header>
        <h1 className="text-lg lg:text-2xl font-medium">Resumes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Masters and tailored variants you can edit and tailor per role.
        </p>
      </header>

      <CreateMasterResumeForm />

      {families.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No resumes yet. Create your first master above to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {families.map(({ master, variants }) => (
            <Card key={master.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {master.name}
                </CardTitle>
                <CardDescription>
                  Master · updated{' '}
                  {master.updatedAt.toLocaleDateString()}
                  {variants.length > 0 && (
                    <>
                      {' · '}
                      {variants.length} variant
                      {variants.length === 1 ? '' : 's'}
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" disabled>
                  <Link href={`/dashboard/resumes/${master.id}`}>
                    Open (editor coming next)
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
