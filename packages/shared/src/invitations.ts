import { z } from 'zod';
import { workspaceIdSchema } from './ids';

export const createInvitationBodySchema = z.object({
  email: z.string().trim().email().max(320),
  roleId: z.string().uuid(),
});

export const acceptInvitationBodySchema = z.object({
  token: z.string().min(1),
});

export const invitationSchema = z.object({
  id: z.string().uuid(),
  workspaceId: workspaceIdSchema,
  email: z.string().email(),
  roleId: z.string().uuid(),
  roleName: z.string(),
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type CreateInvitationBody = z.infer<typeof createInvitationBodySchema>;
export type AcceptInvitationBody = z.infer<typeof acceptInvitationBodySchema>;
