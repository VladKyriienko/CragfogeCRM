import { z } from 'zod';

export const workspaceIdSchema = z.string().uuid();

export type WorkspaceId = z.infer<typeof workspaceIdSchema>;
