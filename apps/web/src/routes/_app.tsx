import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { AppShell } from '@/features/shell/app-shell';
import { useWorkspaces } from '@/features/workspaces/use-workspaces';
import { authClient } from '@/lib/auth-client';
import { getCachedSession } from '@/lib/session-cache';

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const session = await getCachedSession(() => authClient.getSession());
    if (!session) {
      throw redirect({ to: '/sign-in' });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const workspaces = useWorkspaces();

  useEffect(() => {
    if (workspaces.isSuccess && workspaces.data.workspaces.length === 0) {
      void navigate({ to: '/onboarding' });
    }
  }, [navigate, workspaces.data?.workspaces.length, workspaces.isSuccess]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
