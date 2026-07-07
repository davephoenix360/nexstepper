'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Lock, Trash2, Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export default function SecurityPage() {
  const router = useRouter();
  const [pwdPending, startPwd] = useTransition();
  const [delPending, startDel] = useTransition();
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);
  const [delError, setDelError] = useState<string | null>(null);

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

  const deleteAccount = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDelError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') ?? '');

    startDel(async () => {
      const result = await authClient.deleteUser({ password });
      if (result.error) {
        setDelError(result.error.message ?? 'Account deletion failed.');
        return;
      }
      router.push('/');
      router.refresh();
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
              className="bg-orange-500 hover:bg-orange-600 text-white"
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

      <Card>
        <CardHeader>
          <CardTitle>Delete Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Account deletion is non-reversible. Please proceed with caution.
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