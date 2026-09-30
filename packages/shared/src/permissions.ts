import { z } from 'zod';

/** Built-in admin object for workspace admin endpoints (roles, invites, metadata). */
export const ADMIN_OBJECT_ID = '00000000-0000-4000-8000-000000000001';

export const permissionActionSchema = z.enum(['read', 'create', 'update', 'delete']);
export type PermissionAction = z.infer<typeof permissionActionSchema>;

export const fieldVisibilitySchema = z.enum(['hidden', 'read', 'write']);
export type FieldVisibility = z.infer<typeof fieldVisibilitySchema>;

export const requirePermissionMetaSchema = z.object({
  objectId: z.string().uuid(),
  action: permissionActionSchema,
});
