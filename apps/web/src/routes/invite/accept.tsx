import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { AcceptInvitePage } from '@/features/invitations/accept-invite-page';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/invite/accept')({
  validateSearch: z.object({
    token: z.string().optional(),
  }),
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: '/sign-in' });
    }
  },
  component: AcceptInvitePage,
});
