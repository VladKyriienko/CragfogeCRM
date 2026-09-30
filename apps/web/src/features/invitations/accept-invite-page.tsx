import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AuthLayout } from '@/features/auth/auth-layout';
import { apiFetch } from '@/lib/api';
import { setStoredWorkspaceId } from '@/lib/workspace';

export function AcceptInvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/invite/accept' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function accept() {
    setError(null);
    if (!search.token) {
      setError(t('invite.missingToken'));
      return;
    }
    setPending(true);
    try {
      const result = await apiFetch<{ workspaceId: string }>('/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token: search.token }),
      });
      setStoredWorkspaceId(result.workspaceId);
      await navigate({ to: '/' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight">{t('invite.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('invite.description')}</p>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      <Button className="mt-6 w-full" disabled={pending} onClick={() => void accept()}>
        {pending ? t('invite.accepting') : t('invite.accept')}
      </Button>
    </AuthLayout>
  );
}
