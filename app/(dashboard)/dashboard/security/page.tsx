'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Download, Lock, Trash2, Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { purgeUserAccount } from '@/lib/data-rights/purge-user';
import { exportUserData } from '@/lib/data-rights/export-user';

export default function SecurityPage() {
  const router = useRouter();
  const [pwdPending, startPwd] = useTransition();
  const [delPending, startDel] = useTransition();
  const [expPending, startExp] = useTransition();
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const [expError, setExpError] = useState<string | null>(null);

  const changePassword = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);
    const fd = new FormData(e.currentTarget);
    const currentPassword = String(fd.get('currentPassword') ?? '');
    const newPassword = String(fd.get('newPassword') ?? '');
    const confirmPassword = String(fd.get('confirmPassword') ?? '');

    if (newPassword !== confirmPassword) {
      setPwdError('New password and confirmation do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      setPwdError('New password must differ from the current one.');
      return;
    }

    startPwd(async () => {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword
      });
      if (result.error) {
        setPwdError(result.error.message ?? 'Failed to update password.');
        return;
      }
      setPwdSuccess('Password updated.');
      (e.target as HTMLFormElement).reset();
    });
  };

  /**
   * Delete account — now routes through the server-authoritative
   * `purgeUserAccount` action. That action:
   *   1. Cancels any active Stripe subscription (idempotent)
   *   2. Deletes the Stripe customer record (idempotent)
   *   3. Captures a `$delete_user` event on PostHog to scrub properties
   *   4. Writes an `erasure_log` audit row (hashed user id + processors)
   *   5. Calls Better Auth's `deleteUser` which cascades through every
   *      user-owned table via Postgres FKs
   *
   * After the action returns, we sign the client out and bounce to `/`.
   * We use `authClient.signOut()` (not the server action) because the
   * client SDK clears the session cookie in the browser — the server
   * has already revoked sessions when the user row went away.
   */
  const deleteAccount = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDelError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') ?? '');

    startDel(async () => {
      const result = await purgeUserAccount({ password });
      if (!result.ok) {
        setDelError(result.error);
        return;
      }
      await authClient.signOut();
      router.push('/');
      router.refresh();
    });
  };

  /**
   * Export user data — satisfies GDPR Art. 20 (right to data
   * portability). Self-service; no support-ticket round-trip. The
   * server action returns a JSON string + filename; the browser
   * triggers a download via a `Blob` + temporary anchor.
   */
  const exportData = () => {
    setExpError(null);
    startExp(async () => {
      const result = await exportUserData();
      if (!result.ok) {
        setExpError(result.error);
        return;
      }
      const blob = new Blob([result.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mb-6">
        Security
      </h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={changePassword}>
            <div>
              <Label htmlFor="current-password" className="mb-2">
                Current Password
              </Label>
              <Input
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                maxLength={100}
              />
            </div>
            <div>
              <Label htmlFor="new-password" className="mb-2">
                New Password
              </Label>
              <Input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={100}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password" className="mb-2">
                Confirm New Password
              </Label>
              <Input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                maxLength={100}
              />
            </div>
            {pwdError && <p className="text-red-500 text-sm">{pwdError}</p>}
            {pwdSuccess && (
              <p className="text-green-500 text-sm">{pwdSuccess}</p>
            )}
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={pwdPending}
            >
              {pwdPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Update Password
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Export your data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Download a JSON file containing every Nexstepper record linked to
            your account — profile, subscriptions, resumes and revisions,
            applications, score history, chat sessions and messages, and
            any active share links. This is your copy of your data; you
            can save it or forward it to another service.
          </p>
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={exportData}
              disabled={expPending}
            >
              {expPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download my data (JSON)
                </>
              )}
            </Button>
            {expError && (
              <p className="text-red-500 text-sm">{expError}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Account deletion is non-reversible. We will cancel any active
            subscription, delete the payment record on file with our
            processor, scrub your analytics properties, and erase your
            resume + chat data. The erasure is logged for compliance but
            no personally identifiable information is retained.
          </p>
          <form onSubmit={deleteAccount} className="space-y-4">
            <div>
              <Label htmlFor="delete-password" className="mb-2">
                Confirm Password
              </Label>
              <Input
                id="delete-password"
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={100}
              />
            </div>
            {delError && <p className="text-red-500 text-sm">{delError}</p>}
            <Button
              type="submit"
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
              disabled={delPending}
            >
              {delPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}